import { randomUUID } from "node:crypto";
import { getStoreConnectionById, type StoreConnectionRow } from "@/lib/db/store-connections";
import {
  claimAutoMatchJob,
  completeAutoMatchJob,
  failAutoMatchJob,
  touchAutoMatchJob,
} from "@/lib/db/auto-match-jobs";
import { getLastPublishedAt } from "@/lib/db/sizing-runs";
import { fetchSampleProductTitles } from "@/lib/catalog/acs/preview";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import { storeCategoryBreadcrumb } from "@/lib/catalog/persona-mapping";
import {
  classifyPersonaPaths,
  type PersonaAutoMatchVerdict,
  type PersonaPathCandidate,
} from "@/lib/catalog/classify-persona-paths";
import { storeContextFor } from "@/lib/catalog/store-context";
import { applyPersonaMappingChange } from "@/lib/catalog/persona-mapping-effects";
import { setupResetPending } from "@/lib/catalog/setup-reset-state";
import {
  AUTO_MATCH_DEADLINE_MS,
  AUTO_MATCH_HEARTBEAT_MS,
  autoMatchRunning,
  type AutoMatchResult,
} from "@/lib/catalog/auto-match-state";
import { isQuotaExhaustedError } from "@/lib/ai/gemini";
import { ShopifyApiError } from "@/lib/shopify/client";
import type { PersonaCategoryMap, SerializedTaxonomyScope } from "@/modules/store/mapping/persona-taxonomy";
import type { StoreCategory } from "@/modules/store/types";

// One Gemini call classifies the entire run. This cap only guards against pathological input sizes;
// a real store's category list (even several hundred entries) fits comfortably in a single call.
export const MAX_AUTO_MATCH_CATEGORIES = 400;
/** Bounds the prompt when a container has dozens of children; enough to judge what it holds. */
const CHILD_NAMES_IN_PROMPT = 12;
// Kept modest — each unit of concurrency here is one category's worth of live store requests
// firing at once, and a fragile WooCommerce host (cheap shared hosting especially) has shown it
// can't absorb much more than this before its own database connection starts dropping requests.
// Shopify's titles-only query costs a few points, so three at once stays well inside its rate limit.
const SAMPLE_CONCURRENCY = 3;
const SHOPIFY_SAMPLE_MAX_ATTEMPTS = 8;
/** Retries for a dropped connection or a 5xx, which on a run of hundreds of requests is routine. */
const TRANSIENT_RETRIES = 2;
/**
 * Reading product titles stops this long before the deadline, leaving the AI call and the save their
 * time. Categories not reached by then are judged on their names alone, which the AI treats as weak
 * evidence and mostly leaves unmapped.
 */
const CLASSIFY_RESERVE_MS = 4 * 60_000;
const PROGRESS_WRITE_MS = 2_000;

/**
 * Sample size follows the category's size instead of a flat 5 for everything. Five titles is ample
 * evidence for a 20-product leaf and close to worthless for a 2,000-product bucket: it was five
 * women's shoe titles, drawn from the front of a 2,045-item "Shoes & Bags" category, that got the
 * whole thing — handbags and baby sandals included — mapped to women's footwear. More titles is the
 * only way the model can see that a big bucket is mixed. Each step still costs exactly one store
 * request per category, just for a larger page.
 */
function sampleSizeFor(productCount: number): number {
  if (productCount <= 50) return 5;
  if (productCount <= 300) return 15;
  return 30;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A failure whose message is already fit to show the merchant. */
class AutoMatchError extends Error {}

/** AI matching can only offer paths the merchant enabled in "Configure What You Sell". */
export function autoMatchScopeReady(scope: SerializedTaxonomyScope): boolean {
  return scope.configured && scope.enabledLeafKeys.length > 0;
}

/** The requested categories this run may classify: known to the store and not yet mapped or excluded. */
export function autoMatchCandidateIds(connection: StoreConnectionRow, requested: readonly unknown[]): string[] {
  const known = new Set(connection.categories.map((category) => category.id));
  return [
    ...new Set(
      requested.filter(
        (id): id is string => typeof id === "string" && known.has(id) && !connection.personaCategoryMap[id],
      ),
    ),
  ];
}

export type StartAutoMatchOutcome =
  | { ok: true; jobId: string; categoryIds: string[] }
  | { ok: false; status: number; error: string };

/** Checks a run may start and claims it for the store. The run itself goes to `runAutoMatchJob`. */
export async function startAutoMatch(
  connection: StoreConnectionRow,
  requested: unknown,
): Promise<StartAutoMatchOutcome> {
  if (connection.personaAutoMatchCompletedAt) {
    return { ok: false, status: 409, error: "AI matching has already run for this store. Clear the mapping to run it again." };
  }
  if (autoMatchRunning(connection.autoMatchJob)) {
    return { ok: false, status: 409, error: "AI matching is already running for this store." };
  }
  if (!autoMatchScopeReady(connection.personaTaxonomyScope)) {
    return { ok: false, status: 400, error: "Configure What You Sell before running AI matching." };
  }
  if (!Array.isArray(requested)) {
    return { ok: false, status: 400, error: "categoryIds must be an array" };
  }
  const categoryIds = autoMatchCandidateIds(connection, requested);
  if (categoryIds.length === 0) {
    return { ok: false, status: 400, error: "There are no unmapped categories to match." };
  }
  if (categoryIds.length > MAX_AUTO_MATCH_CATEGORIES) {
    return {
      ok: false,
      status: 400,
      error: `AI matching takes at most ${MAX_AUTO_MATCH_CATEGORIES} categories at a time. Select fewer and run it again.`,
    };
  }

  const jobId = randomUUID();
  if (!(await claimAutoMatchJob(connection.id, jobId, categoryIds.length))) {
    return { ok: false, status: 409, error: "AI matching is already running for this store." };
  }
  return { ok: true, jobId, categoryIds };
}

export function buildAutoMatchCandidates(
  categories: readonly StoreCategory[],
  categoryIds: readonly string[],
): PersonaPathCandidate[] {
  const known = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, StoreCategory[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = childrenByParent.get(category.parentId);
    if (siblings) siblings.push(category);
    else childrenByParent.set(category.parentId, [category]);
  }

  function depthOf(categoryId: string): number {
    let depth = 0;
    const seen = new Set<string>([categoryId]);
    let parentId = known.get(categoryId)?.parentId ?? null;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = known.get(parentId)?.parentId ?? null;
    }
    return depth;
  }

  return categoryIds.flatMap((id) => {
    const category = known.get(id);
    if (!category) return [];
    const children = childrenByParent.get(id) ?? [];
    return [{
      id,
      path: storeCategoryBreadcrumb(id, categories) || category.name,
      productCount: category.productCount,
      sampleTitles: [],
      depth: depthOf(id),
      childCount: children.length,
      childNames: children.slice(0, CHILD_NAMES_IN_PROMPT).map((child) => child.name),
    }];
  });
}

function isTransientFailure(error: unknown): boolean {
  if (error instanceof ShopifyApiError && error.throttled) return false;
  // What `fetch` throws for a dropped or reset connection.
  if (error instanceof TypeError) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 500;
}

async function fetchTitlesWithRetry(connection: StoreConnectionRow, sourceIds: string[], sampleSize: number) {
  let throttled = 0;
  let transient = 0;
  for (;;) {
    try {
      return await fetchSampleProductTitles(connection, sourceIds, sampleSize);
    } catch (error) {
      if (
        connection.platform === "shopify" &&
        error instanceof ShopifyApiError &&
        error.throttled &&
        throttled < SHOPIFY_SAMPLE_MAX_ATTEMPTS - 1
      ) {
        // Shopify sometimes reports a zero wait for a query it has already rejected. Always allow
        // at least half a second for its cost bucket to refill, with a small bounded backoff when the
        // store is also serving another catalog operation.
        await wait(Math.min(Math.max(error.retryAfterMs ?? 0, 500) * 2 ** Math.min(throttled, 3), 10_000));
        throttled += 1;
        continue;
      }
      if (isTransientFailure(error) && transient < TRANSIENT_RETRIES) {
        transient += 1;
        await wait(1_000 * transient);
        continue;
      }
      throw error;
    }
  }
}

/** Reads a few real product titles per category, which is the AI's main evidence. */
export async function sampleCandidateTitles(
  connection: StoreConnectionRow,
  candidates: PersonaPathCandidate[],
  options: { until?: number; signal?: AbortSignal; onSampled?: (sampled: number) => void } = {},
): Promise<void> {
  let cursor = 0;
  let sampled = 0;
  async function sampleWorker() {
    while (cursor < candidates.length) {
      if (options.signal?.aborted || (options.until !== undefined && Date.now() >= options.until)) return;
      const candidate = candidates[cursor++];
      // An empty category with no sub-categories has no titles to read. Stores keep plenty of them
      // (old seasons, emptied sales), and skipping them saves a request each.
      if (candidate.productCount > 0 || (candidate.childCount ?? 0) > 0) {
        try {
          const sourceIds = expandCategorySelection([candidate.id], connection.categories);
          candidate.sampleTitles = await fetchTitlesWithRetry(connection, sourceIds, sampleSizeFor(candidate.productCount));
        } catch (error) {
          console.error(`[persona auto-match] sample failed for ${candidate.id}`, error);
        }
      }
      sampled += 1;
      options.onSampled?.(sampled);
    }
  }
  await Promise.all(Array.from({ length: Math.min(SAMPLE_CONCURRENCY, candidates.length) }, () => sampleWorker()));
}

/**
 * The store's mapping with the AI's verdicts added. A category the merchant mapped or excluded in
 * the meantime keeps their answer; nothing the AI declined to decide is written.
 */
export function mergeAutoMatchVerdicts(
  current: PersonaCategoryMap,
  verdicts: readonly PersonaAutoMatchVerdict[],
  candidates: readonly PersonaPathCandidate[],
): { map: PersonaCategoryMap; result: AutoMatchResult } {
  const map: PersonaCategoryMap = { ...current };
  const result: AutoMatchResult = {
    mapped: 0,
    excluded: 0,
    unmapped: 0,
    withoutSamples: candidates.filter((candidate) => candidate.sampleTitles.length === 0).length,
  };
  const decided = new Map(verdicts.map((verdict) => [verdict.id, verdict.mapping]));
  for (const candidate of candidates) {
    if (map[candidate.id]) continue;
    const mapping = decided.get(candidate.id);
    if (!mapping) {
      result.unmapped += 1;
    } else if (mapping.status === "excluded") {
      map[candidate.id] = { ...mapping, isAutoMatched: true };
      result.excluded += 1;
    } else if (mapping.departmentId && mapping.categoryId && mapping.subCategory) {
      map[candidate.id] = { ...mapping, isAutoMatched: true };
      result.mapped += 1;
    } else {
      result.unmapped += 1;
    }
  }
  return { map, result };
}

function failureMessage(error: unknown, timedOut: boolean): string {
  if (timedOut) return "AI matching did not finish within 10 minutes. Try again, or select fewer categories.";
  if (error instanceof AutoMatchError) return error.message;
  if (isQuotaExhaustedError(error)) return "AI matching is unavailable because the Gemini API credits are depleted.";
  return "AI matching failed. Please try again.";
}

/**
 * The AI match for one store, run in the background after `startAutoMatch` claimed it. It reads
 * product titles, asks the AI once, and saves the result itself, so the merchant's page only has
 * to follow its progress: closing or refreshing the page loses nothing.
 *
 * Every write is tied to `jobId`. A run that was cleared or replaced while it worked writes nothing,
 * and one that reaches its 10-minute deadline stops and reports a failure.
 */
export async function runAutoMatchJob(
  connectionId: string,
  jobId: string,
  categoryIds: readonly string[],
): Promise<"done" | "failed" | "superseded"> {
  const deadline = Date.now() + AUTO_MATCH_DEADLINE_MS;
  const abort = new AbortController();
  let superseded = false;
  let timedOut = false;

  const stopIfReplaced = (owned: boolean) => {
    if (owned || superseded) return;
    superseded = true;
    abort.abort(new AutoMatchError("AI matching was cleared or replaced."));
  };
  const heartbeat = setInterval(() => {
    void touchAutoMatchJob(connectionId, jobId).then(stopIfReplaced);
  }, AUTO_MATCH_HEARTBEAT_MS);
  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    abort.abort(new AutoMatchError("AI matching ran out of time."));
  }, AUTO_MATCH_DEADLINE_MS);

  try {
    const connection = await getStoreConnectionById(connectionId);
    if (!connection) throw new AutoMatchError("The store connection could not be read.");
    const scope = connection.personaTaxonomyScope;
    if (!autoMatchScopeReady(scope)) throw new AutoMatchError("Configure What You Sell before running AI matching.");

    const candidates = buildAutoMatchCandidates(connection.categories, categoryIds);
    let lastProgressWrite = 0;
    await sampleCandidateTitles(connection, candidates, {
      until: deadline - CLASSIFY_RESERVE_MS,
      signal: abort.signal,
      onSampled: (sampled) => {
        if (Date.now() - lastProgressWrite < PROGRESS_WRITE_MS && sampled < candidates.length) return;
        lastProgressWrite = Date.now();
        void touchAutoMatchJob(connectionId, jobId, { sampled }).then(stopIfReplaced);
      },
    });
    abort.signal.throwIfAborted();

    stopIfReplaced(await touchAutoMatchJob(connectionId, jobId, { phase: "classifying", sampled: candidates.length }));
    abort.signal.throwIfAborted();
    const verdicts = await classifyPersonaPaths(candidates, scope, storeContextFor(connection), { signal: abort.signal });
    abort.signal.throwIfAborted();

    stopIfReplaced(await touchAutoMatchJob(connectionId, jobId, { phase: "saving" }));
    abort.signal.throwIfAborted();
    const latest = await getStoreConnectionById(connectionId);
    if (!latest) throw new AutoMatchError("The store connection could not be read.");
    if (setupResetPending(latest.setupReset)) {
      throw new AutoMatchError("Start from scratch ran while AI matching was working. Run AI matching again.");
    }

    const { map, result } = mergeAutoMatchVerdicts(latest.personaCategoryMap, verdicts, candidates);
    const changed = result.mapped + result.excluded > 0;
    const live = (await getLastPublishedAt(connectionId)) !== null;
    const saved = await completeAutoMatchJob(connectionId, jobId, {
      personaCategoryMap: changed ? map : null,
      resetCatalogSync: !live,
      result,
    });
    if (!saved) return "superseded";

    if (changed) {
      try {
        const updated = await getStoreConnectionById(connectionId);
        if (updated) await applyPersonaMappingChange(updated, live);
      } catch (error) {
        console.error("[persona auto-match] follow-up after saving the mapping failed", connectionId, error);
      }
    }
    return "done";
  } catch (error) {
    if (superseded) return "superseded";
    if (!timedOut) console.error("[persona auto-match] run failed", connectionId, error);
    await failAutoMatchJob(connectionId, jobId, failureMessage(error, timedOut));
    return "failed";
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadlineTimer);
  }
}
