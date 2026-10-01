import {
  ackCatalogMessages,
  archiveCatalogMessages,
  getCatalogQueueDepth,
  readCatalogMessages,
  type QueuedMessage,
} from "@/lib/db/catalog-queue";
import { syncProductsToAcs } from "@/lib/catalog/acs/sync";
import { deleteProduct } from "@/lib/catalog/acs/client";
import { buildAcsProductId } from "@/lib/catalog/acs/isolation";
import { clearAcsStageFiveCache } from "@/lib/catalog/acs/stage-five-listing";
import { scheduleRebuildPersonaPathConfig } from "@/lib/catalog/path-config/rebuild";
import type { MapProductInput } from "@/lib/catalog/acs/map-product";
import {
  getStoreConnectionById,
  listConnectionsBySyncStatus,
  updateCatalogSyncState,
  type StoreConnectionRow,
} from "@/lib/db/store-connections";
import { resolveCategoryPaths, resolveGarmentCategory } from "./index-product";
import { loadSizingResolutionContext } from "@/lib/sizing/product-chart";
import { sizingForRawProduct } from "./sizing-for-product";
import {
  getActiveSizingRun,
  listActivePublishingSizingRuns,
  updateSizingRun,
} from "@/lib/db/sizing-runs";

/**
 * Parent products claimed per batch.
 *
 * One parent can fan out to many ACS VARIANT documents. Keeping this bounded prevents a single
 * queue claim from turning into dozens of sequential 100-document ACS import operations.
 */
const BATCH_SIZE = 20;

/**
 * Three ACS import polling windows for the current store's largest 20-parent batch, plus overhead.
 * The previous 120-second lease could expire while variant documents were still importing, letting
 * an overlapping worker claim and import the same parents again.
 */
const VISIBILITY_SECONDS = 300;

/** In-flight `source_category_ids` lookups per batch (see `fetchExistingAcsSourceCategoryIds`).
 *  These are plain ACS reads, not paid model calls, so this is sized for round-trip parallelism
 *  rather than any external quota. */
/** After this many deliveries a message is archived rather than retried. Without a ceiling, a
 *  product that always fails — ACS rejecting its mapped shape, say — retries forever and the
 *  run never reports complete. */
const MAX_ATTEMPTS = 4;

export interface DrainResult {
  claimed: number;
  indexed: number;
  failed: number;
  remaining: number;
  batches: number;
  /** Messages dropped because the connection they belonged to no longer exists. */
  orphaned: number;
}

/** How long one invocation keeps claiming batches before returning, kept under the route's
 *  own `maxDuration` so it finishes deliberately rather than being cut off mid-batch. */
const DRAIN_BUDGET_MS = 240_000;

/**
 * Drains one batch off the ACS import queue: resolve paths, map, import, acknowledge.
 *
 * This queue exists purely for chunking now — there is no per-product Gemini call left to
 * throttle or bill for, since ACS does its own retrieval/ranking server-side and needs no
 * fused description/embedding computed at index time. It is kept anyway (rather than importing
 * inline from the walk) because a single request importing tens of thousands of products would
 * still risk the route's own `maxDuration`, and because claimed messages staying invisible to
 * other readers is what lets overlapping invocations of this route work on disjoint batches
 * instead of duplicating each other.
 *
 * Ordering matters. A message is only acknowledged after its import is confirmed, so a crash
 * anywhere in between leaves the message on the queue to be retried rather than losing the
 * product silently.
 */
export async function drainCatalogQueue(): Promise<DrainResult> {
  const deadline = Date.now() + DRAIN_BUDGET_MS;
  const total: DrainResult = { claimed: 0, indexed: 0, failed: 0, remaining: 0, batches: 0, orphaned: 0 };

  // Keep claiming batches until the queue empties or the budget runs out. One batch per
  // invocation would make a 20,000-product backfill take far longer than it needs to at any
  // sane schedule; because claimed messages are invisible to other readers, overlapping
  // invocations of this route work on disjoint batches rather than duplicating each other.
  while (Date.now() < deadline) {
    const batch = await drainOneBatch();

    total.claimed += batch.claimed;
    total.indexed += batch.indexed;
    total.failed += batch.failed;
    total.orphaned += batch.orphaned;
    total.remaining = batch.remaining;
    total.batches += 1;

    if (batch.claimed === 0) break;
  }

  // An empty queue is what ends a run, not a counter reaching its target — see
  // `settleFinishedRuns`. Done here rather than in each caller so the in-process worker and the
  // `pg_cron` route conclude runs identically.
  if (total.remaining === 0) await settleFinishedRuns();

  return total;
}

/**
 * Concludes any run whose work is finished but whose counter never reached its total.
 *
 * Completion used to be read off `progress >= total`, which quietly made an exact count a
 * precondition for a run ever ending. It is not one. A product retired after `MAX_ATTEMPTS`, a
 * message orphaned by a disconnected store, and two batches racing on the same read-modify-write
 * of `progress` all leave the count permanently short. The run then sat in `indexing` forever,
 * which is worse than a stuck progress bar: a catalog counts as searchable only at `ready`, so a
 * run stranded one product short locked the agent out of every product that *did* index.
 *
 * The queue emptying is the real terminal condition, so that is what this reads. Depth counts
 * claimed-but-unacknowledged messages too, so zero means no work is left anywhere, for anyone.
 */
export async function settleFinishedRuns(): Promise<number> {
  const [running, publishingRuns] = await Promise.all([
    listConnectionsBySyncStatus("indexing"),
    listActivePublishingSizingRuns(),
  ]);
  // Defensive even though the DB reader already returns only `running`: a `pending` publish has
  // not called startCatalogBackfill yet and must never inherit an earlier catalog's `ready` state.
  const startedPublishingRuns = publishingRuns.filter((run) => run.status === "running");
  const publishingByConnection = new Map(startedPublishingRuns.map((run) => [run.connectionId, run]));
  const connectionsById = new Map(running.map((connection) => [connection.id, connection]));

  // Recovery path: a process can stop after writing the catalog's `ready` state but before writing
  // the sizing run's completion. Do not scan every ready connection on every idle tick — only fetch
  // connections that currently have an active publish run and were not already found as indexing.
  await Promise.all(
    startedPublishingRuns.map(async (run) => {
      if (connectionsById.has(run.connectionId)) return;
      const connection = await getStoreConnectionById(run.connectionId);
      if (connection?.catalogSyncStatus === "ready") connectionsById.set(connection.id, connection);
    }),
  );

  // `startCatalogBackfill` claims `indexing` before it walks and records the total only once the
  // walk has enqueued everything, so a zero total means work is still to come and an empty queue
  // says nothing about it yet.
  const finishable = [...connectionsById.values()].filter(
    (connection) => connection.catalogSyncTotal > 0,
  );
  if (finishable.length === 0) return 0;

  if ((await getCatalogQueueDepth()) > 0) return 0;

  let settled = 0;

  for (const connection of finishable) {
    // Progress is left as it stands rather than rounded up to the total. "5,967 products
    // searchable" is the truth, and the gap to the total is the only way anyone would notice the
    // shortfall at all. A run that indexed nothing has nothing to search, which is a failure
    // rather than a small one.
    const status = connection.catalogSyncProgress > 0 ? "ready" : "error";

    const statusWritten =
      connection.catalogSyncStatus === status ||
      await updateCatalogSyncState(connection.id, { status });
    if (statusWritten) settled += 1;
    const sizingRun = statusWritten ? publishingByConnection.get(connection.id) : null;
    if (sizingRun?.stage === "publish") {
      await updateSizingRun(sizingRun.id, status === "ready"
        ? {
            status: "complete",
            phaseDone: connection.catalogSyncProgress,
            phaseTotal: connection.catalogSyncTotal,
            publishedAt: new Date().toISOString(),
            error: null,
          }
        : {
            status: "failed",
            phaseDone: connection.catalogSyncProgress,
            phaseTotal: connection.catalogSyncTotal,
            error: "The sizing-aware catalog publish indexed no products.",
          });
      if (status === "ready") clearAcsStageFiveCache(connection.id);
    }
    if (statusWritten && status === "ready") scheduleRebuildPersonaPathConfig(connection.id);

    const summary =
      `[catalog process-queue] settled ${connection.id} as ${status}: ` +
      `${connection.catalogSyncProgress} of ${connection.catalogSyncTotal} indexed, queue empty`;
    if (status === "error") console.error(summary);
    else console.warn(summary);
  }

  return settled;
}

async function drainOneBatch(): Promise<Omit<DrainResult, "batches">> {
  const messages = await readCatalogMessages(BATCH_SIZE, VISIBILITY_SECONDS);

  if (messages.length === 0) {
    return { claimed: 0, indexed: 0, failed: 0, remaining: await getCatalogQueueDepth(), orphaned: 0 };
  }

  const byConnection = new Map<string, QueuedMessage[]>();
  for (const message of messages) {
    const bucket = byConnection.get(message.body.connectionId) ?? [];
    bucket.push(message);
    byConnection.set(message.body.connectionId, bucket);
  }

  let indexed = 0;
  let failed = 0;
  let orphaned = 0;
  const done: number[] = [];
  const giveUp: number[] = [];

  for (const [connectionId, batch] of byConnection) {
    const outcomes = await processConnectionBatch(connectionId, batch);

    for (const [index, outcome] of outcomes.entries()) {
      const message = batch[index];

      if (outcome === "orphaned") {
        orphaned += 1;
        done.push(message.msgId);
        continue;
      }

      if (outcome === "excluded") {
        done.push(message.msgId);
        continue;
      }

      if (outcome === "failed") {
        failed += 1;
        // Leave it on the queue to retry after the visibility timeout — unless it has already
        // had its chances, in which case it is retired so the run can finish.
        if (message.readCount >= MAX_ATTEMPTS) giveUp.push(message.msgId);
        continue;
      }

      indexed += 1;
      done.push(message.msgId);
    }
  }

  await ackCatalogMessages(done);
  await archiveCatalogMessages(giveUp);

  return { claimed: messages.length, indexed, failed, remaining: await getCatalogQueueDepth(), orphaned };
}

type ItemOutcome = "indexed" | "failed" | "orphaned" | "excluded";

async function processConnectionBatch(connectionId: string, batch: QueuedMessage[]): Promise<ItemOutcome[]> {
  // A message can outlive the connection that enqueued it: disconnecting a store cascades its
  // catalog rows away, but the queue is shared across merchants and keeps whatever was already
  // enqueued for it. Checking first is what keeps that cheap.
  const connection = await getStoreConnectionById(connectionId);
  if (!connection || connection.status !== "connected") {
    console.warn(`[catalog process-queue] dropping ${batch.length} message(s) for inactive connection ${connectionId}`);
    return batch.map(() => "orphaned");
  }

  const sizingContext = connection.sizingBrandMapping && connection.storeSizeSettings
    ? await loadSizingResolutionContext(connection)
    : null;
  const prepared = batch.map((message) => {
    const sourceCategoryIds = message.body.sourceCategoryIds ?? [];
    const rawWithMembership = { ...message.body.product, sourceCategoryIds };
    const categoryPaths = resolveCategoryPaths(
      rawWithMembership,
      connection
    );
    if (categoryPaths.length === 0) return { message, input: null };
    const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(message.body.product);

    const input: MapProductInput = {
      raw: message.body.product,
      connectionId,
      categoryPaths,
      garmentCategory,
      garmentSubcategory,
      // The backfill is the path that actually populates the index, so omitting this would make a
      // merchant's Stage 1 reassignment purely cosmetic — correct in the preview, absent from search.
      fieldMapping: connection.acsFieldMapping,
      sizing: sizingContext ? sizingForRawProduct(rawWithMembership, connection, sizingContext) : null,
    };

    return { message, input };
  });

  const importable = prepared.filter((entry): entry is { message: QueuedMessage; input: MapProductInput } => entry.input !== null);

  const skipped = prepared.length - importable.length;
  if (skipped > 0) {
    console.warn(`[catalog process-queue] excluded ${skipped} product(s) for ${connectionId}: no mapped Persona path`);
  }

  // Disconnect marks the row inactive before sweeping ACS. Re-check after preparation so a
  // batch claimed just before that transition cannot recreate products after the sweep.
  const current = await getStoreConnectionById(connectionId);
  if (!current || current.status !== "connected") {
    console.warn(`[catalog process-queue] dropping ${batch.length} prepared message(s) for inactive connection ${connectionId}`);
    return batch.map(() => "orphaned");
  }

  const written = await syncProductsToAcs(importable.map((entry) => entry.input));

  // A disconnect can land in the narrow interval between the pre-import check and the write.
  // In that case this worker owns the race and removes exactly the products it just recreated.
  const afterWrite = await getStoreConnectionById(connectionId);
  if (!afterWrite || afterWrite.status !== "connected") {
    if (written) {
      await Promise.all(
        importable.map((entry) => deleteProduct(buildAcsProductId(connectionId, entry.input.raw.externalId)))
      );
    }
    return batch.map(() => "orphaned");
  }

  const outcomes: ItemOutcome[] = prepared.map((entry) =>
    entry.input === null ? "excluded" : written ? "indexed" : "failed"
  );
  await reportProgress(connection, written ? importable.length : 0);
  return outcomes;
}

/**
 * Keeps `source_category_ids` current for a product whose categories span more than one walk.
 *
 * Without this, a product first indexed under one category and later found under a second keeps
 * only the second, because each ACS import replaces the whole product document rather than
 * merging fields. Deselecting the second category later would then remove a product the first
 * still covers.
 */
export function mergeSourceCategories(existing: string[], incoming: string[]): string[] {
  const merged = new Set(existing);
  for (const id of incoming) merged.add(id);
  return [...merged];
}

/**
 * Reports progress as a running count against the total this connection's walk enqueued.
 *
 * Derived from what this batch actually wrote, added to whatever the row already recorded,
 * rather than an absolute recount — there is no local table left to recount against, and ACS
 * has no cheap "how many of this merchant's products exist" read the way a `count(*)` was. The
 * cost is that an overlapping retry of the same batch (a claimed-but-not-yet-acked message whose
 * visibility timeout expired) can double-count once; the UI-facing progress bar tolerates that
 * far better than a stalled backfill would.
 */
async function reportProgress(connection: StoreConnectionRow, indexedDelta: number): Promise<void> {
  if (connection.catalogSyncTotal <= 0 || indexedDelta === 0) return;

  const progress = Math.min(connection.catalogSyncProgress + indexedDelta, connection.catalogSyncTotal);
  // Reaching the numeric total is not the terminal condition: overlapping claims can double-count,
  // and the queue may still contain work for this or another connection. Only settleFinishedRuns,
  // after observing an empty queue, is allowed to publish `ready`.
  const status = connection.catalogSyncStatus === "error" ? "error" : "indexing";

  await updateCatalogSyncState(connection.id, { progress, status });
  const sizingRun = await getActiveSizingRun(connection.id);
  if (sizingRun?.stage === "publish") {
    await updateSizingRun(sizingRun.id, {
      phaseDone: progress,
      phaseTotal: connection.catalogSyncTotal,
    });
  }
}
