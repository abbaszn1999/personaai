/**
 * The resumable full-catalog walk behind Stage 1's "real coverage, not a 25-product guess" numbers
 * — see the plan's step 4 and `cms-column-store.ts`, which this writes into.
 *
 * Shares the exact walking mechanics `enqueue-sync.ts` and `lib/sizing/scan.ts` already use
 * (`createCatalogPager`, one group at a time, an opaque per-group cursor) rather than inventing a
 * third copy of "how do I page this merchant's whole catalog" — see `pager.ts`'s own doc comment on
 * why that duplication is the one worth avoiding.
 *
 * One page per call (`runCmsColumnDiscoveryStep`), driven repeatedly by the worker loop
 * (`catalog/worker.ts`) or the `pg_cron` route, exactly like `drainCatalogQueue` — a full walk
 * outlives a single request, so nothing here tries to finish one in a single call.
 */

import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { listConnectionsByCmsColumnDiscoveryStatus, updateCmsColumnDiscoveryState } from "@/lib/db/store-connections";
import { createCatalogPager } from "./pager";
import { columnSampleText } from "./acs/map-product";
import { normalizeOptionGroupName } from "./option-groups";
import { SOURCE_FIELDS } from "./source-fields";
import {
  classifyDiscoveredColumn,
  nativeVariantFieldColumns,
  sourceFieldColumn,
  type CmsColumnDef,
} from "./cms-columns";
import { columnKey, type CmsColumnRef } from "./acs-mapping";
import { SHOPIFY_NATIVE_COLUMNS } from "@/lib/shopify/product-columns";
import { WOOCOMMERCE_NATIVE_COLUMNS } from "@/lib/woocommerce/product-columns";
import { recordCmsColumnPage, clearCmsColumns, type CmsColumnUpsert } from "./cms-column-store";
import type { RawCatalogProduct } from "./sync-types";

/** Rows fetched per pager call during the walk. Smaller than the pager's own platform maximum on
 *  purpose: `discoverCustomFields: true` turns Shopify's metafields read into an open connection
 *  per product, and a smaller page keeps one walk step's cost predictable regardless of how many
 *  custom fields a merchant's products happen to carry. */
const DISCOVERY_PAGE_SIZE = 50;

function nativeColumnsFor(platform: StoreConnectionRow["platform"]): readonly CmsColumnDef[] {
  if (platform === "shopify") return SHOPIFY_NATIVE_COLUMNS;
  if (platform === "wordpress" || platform === "woocommerce") return WOOCOMMERCE_NATIVE_COLUMNS;
  return [];
}

/**
 * Every column this page's products give evidence for: the platform's always-present native
 * fields and variant fields (so they accumulate `sampled` even on a page where every product
 * happens to leave them empty), plus whatever ad hoc option group, product meta key, or per-variant
 * meta key this page's products actually carry.
 *
 * Deliberately independent of `discoverColumns` in `mapping-options/route.ts`: that one merges a
 * single small sample with platform-declared *definitions* for the UI to render; this one is the
 * unit of work a persisted walk folds in page by page, and conflating the two would mean a change
 * to one silently changing what the other counts.
 */
function pageColumnDefs(connection: StoreConnectionRow, products: readonly RawCatalogProduct[]): CmsColumnDef[] {
  const defs = new Map<string, CmsColumnDef>();
  const add = (def: CmsColumnDef) => defs.set(columnKey(def.ref), def);

  for (const field of SOURCE_FIELDS) {
    if (!field.internal) add(sourceFieldColumn(field));
  }
  for (const def of nativeColumnsFor(connection.platform)) add(def);
  for (const def of nativeVariantFieldColumns()) add(def);

  for (const product of products) {
    for (const name of Object.keys(product.variantOptions)) {
      const normalized = normalizeOptionGroupName(name);
      if (!normalized) continue;
      const ref: CmsColumnRef = { kind: "option", group: normalized };
      add({ ref, label: name, ...classifyDiscoveredColumn(ref) });
    }
    for (const key of Object.keys(product.customFields)) {
      const ref: CmsColumnRef = { kind: "meta", key };
      add({ ref, label: key, ...classifyDiscoveredColumn(ref) });
    }
    for (const variant of product.variants) {
      for (const key of Object.keys(variant.customFields)) {
        const ref: CmsColumnRef = { kind: "variantMeta", key };
        add({ ref, label: key, ...classifyDiscoveredColumn(ref) });
      }
    }
  }

  return [...defs.values()];
}

/** This page's evidence, ready to fold into the connection's running snapshot. */
function scorePage(products: readonly RawCatalogProduct[], defs: readonly CmsColumnDef[]): CmsColumnUpsert[] {
  return defs.map((def) => {
    let presence = 0;
    let sample: string | null = null;

    for (const product of products) {
      const text = columnSampleText(product, def.ref);
      if (!text) continue;
      presence += 1;
      sample ??= text.length > 160 ? `${text.slice(0, 160)}…` : text;
    }

    return {
      key: columnKey(def.ref),
      label: def.label,
      group: def.group,
      scope: def.scope,
      valueType: def.valueType,
      sample,
      presence,
      sampled: products.length,
    };
  });
}

/** Starts (or restarts) a full-catalog walk for this connection. Idempotent in the sense that
 *  calling it again simply throws away whatever a previous walk had found and begins over — there
 *  is no partial state worth preserving once a merchant has asked to refresh. */
export async function startCmsColumnDiscovery(connection: StoreConnectionRow): Promise<void> {
  await clearCmsColumns(connection.id);
  await updateCmsColumnDiscoveryState(connection.id, {
    status: "running",
    groupIndex: 0,
    cursor: null,
    scanned: 0,
    error: null,
  });
}

export interface DiscoveryStepResult {
  connectionId: string;
  outcome: "advanced" | "finished" | "skipped" | "failed";
  scanned: number;
}

/**
 * Advances one connection's walk by exactly one page. Called repeatedly — by the worker loop or a
 * `pg_cron` tick — until it reports `"finished"`.
 */
export async function runCmsColumnDiscoveryStep(connection: StoreConnectionRow): Promise<DiscoveryStepResult> {
  const base = { connectionId: connection.id, scanned: connection.cmsColumnDiscoveryScanned };

  try {
    const pager = await createCatalogPager(connection, {
      pageSize: DISCOVERY_PAGE_SIZE,
      discoverCustomFields: true,
    });

    if (!pager || pager.groups.length === 0) {
      await updateCmsColumnDiscoveryState(connection.id, { status: "done" });
      return { ...base, outcome: "finished" };
    }

    if (connection.cmsColumnDiscoveryGroupIndex >= pager.groups.length) {
      await updateCmsColumnDiscoveryState(connection.id, { status: "done" });
      return { ...base, outcome: "finished" };
    }

    const group = pager.groups[connection.cmsColumnDiscoveryGroupIndex];
    const { products, nextCursor } = await pager.fetchPage(group, connection.cmsColumnDiscoveryCursor);

    if (products.length > 0) {
      const defs = pageColumnDefs(connection, products);
      await recordCmsColumnPage(connection.id, scorePage(products, defs));
    }

    const scanned = connection.cmsColumnDiscoveryScanned + products.length;

    if (nextCursor) {
      await updateCmsColumnDiscoveryState(connection.id, { cursor: nextCursor, scanned });
      return { connectionId: connection.id, outcome: "advanced", scanned };
    }

    // This group is exhausted — move to the next one, or finish if that was the last.
    const nextGroupIndex = connection.cmsColumnDiscoveryGroupIndex + 1;
    if (nextGroupIndex >= pager.groups.length) {
      await updateCmsColumnDiscoveryState(connection.id, { status: "done", groupIndex: nextGroupIndex, cursor: null, scanned });
      return { connectionId: connection.id, outcome: "finished", scanned };
    }

    await updateCmsColumnDiscoveryState(connection.id, { groupIndex: nextGroupIndex, cursor: null, scanned });
    return { connectionId: connection.id, outcome: "advanced", scanned };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The column discovery walk failed.";
    console.error("[discover-cms-columns]", connection.id, err);
    await updateCmsColumnDiscoveryState(connection.id, { status: "error", error: message });
    return { ...base, outcome: "failed" };
  }
}

/** Advances every connection with a walk in flight by one page each — the shape
 *  `runCatalogEnqueuePass`/`runSizingJobPass` already use, so `worker.ts` can drive all three the
 *  same way. Sequential per tick, same reasoning as those: a walk hits one merchant's store API,
 *  and running several full-catalog walks at once is a plausible way to rate-limit a live store. */
export async function runCmsColumnDiscoveryPass(): Promise<DiscoveryStepResult[]> {
  const running = await listConnectionsByCmsColumnDiscoveryStatus("running");

  const results: DiscoveryStepResult[] = [];
  for (const connection of running) {
    results.push(await runCmsColumnDiscoveryStep(connection));
  }
  return results;
}
