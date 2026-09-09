import { getAcsAccessToken } from "./auth";
import { branchPath, catalogPath, defaultPlacementPath, getAcsConfig } from "./config";
import { categoryScopeFilterClause, merchantFilterClause } from "./isolation";
import type {
  AcsImportRequestBody,
  AcsListProductsResponse,
  AcsOperation,
  AcsProduct,
  AcsSearchRequest,
  AcsSearchResponse,
  AcsUserEvent,
} from "./types";

const API_BASE = "https://retail.googleapis.com/v2";

/** ACS's own best-practice batch size for inline import — see the plan's "Sync in depth"
 *  section: 100/call is the safe batch size even though the API's absolute ceiling is higher. */
export const IMPORT_BATCH_SIZE = 100;

export class AcsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    path: string
  ) {
    super(`ACS API error ${status} on ${path}: ${body}`);
  }
}

/**
 * Attempts per request, including the first.
 *
 * A backfill reads `source_category_ids` back for every product it is about to write, `CONCURRENCY`
 * at a time (see process-queue.ts), which is more than enough to draw 429s from ACS. Retrying
 * belongs here rather than at the call sites because a throttled read is indistinguishable, to a
 * caller, from a read of a product that does not exist — and one caller acting on that confusion
 * rewrites a product's category membership (see `fetchExistingAcsSourceCategoryIds`).
 */
const MAX_REQUEST_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 250;

/** Both of these mean "rejected, not applied", so a retry cannot duplicate a write. 500 is left
 *  out on purpose: it says nothing about whether the write landed, and `userEvents:write` is the
 *  one call in this module that isn't idempotent. */
const RETRYABLE_STATUSES = new Set([429, 503]);

function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  // Jittered, because the requests being throttled here arrive as a parallel batch — a fixed
  // delay would send the whole batch back at the same instant and trip the same quota again.
  return BASE_BACKOFF_MS * 2 ** attempt * (1 + Math.random());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acsFetch<T>(path: string, init: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await getAcsAccessToken();
    const res = await fetch(`${API_BASE}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const text = await res.text();
    if (res.ok) return text ? (JSON.parse(text) as T) : ({} as T);

    if (!RETRYABLE_STATUSES.has(res.status) || attempt >= MAX_REQUEST_ATTEMPTS - 1) {
      throw new AcsApiError(res.status, text, path);
    }

    await sleep(backoffMs(attempt, res.headers.get("retry-after")));
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Bulk-imports products in `IMPORT_BATCH_SIZE` chunks. Always `INCREMENTAL` — this app never
 * calls `FULL` reconciliation against the shared catalog, since a `FULL` batch diffs and deletes
 * anything *not* present in it, and a merchant-scoped batch would delete every other merchant's
 * products it doesn't happen to include. Full recatalogs use `OUT_OF_STOCK` patches instead, per
 * the plan's sync-mapping table.
 *
 * Every product must already carry the `merchant_id` attribute from the mapper — this function
 * does not add it, since it has no per-product connection context of its own once given a flat
 * `AcsProduct[]`. Callers must build products via `rawCatalogProductToAcsProduct`, never by hand.
 */
export async function importProducts(products: AcsProduct[]): Promise<void> {
  const config = getAcsConfig();
  const batches = chunk(products, IMPORT_BATCH_SIZE);

  for (const batch of batches) {
    const body: AcsImportRequestBody = {
      inputConfig: { productInlineSource: { products: batch } },
      reconciliationMode: "INCREMENTAL",
    };
    const operation = await acsFetch<AcsOperation>(`${branchPath(config)}/products:import`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    await awaitImportOperation(operation);
  }
}

/** How long one import batch's operation gets to finish. `IMPORT_BATCH_SIZE` products normally
 *  complete in seconds; the ceiling is here so a stuck operation fails its batch — and lets the
 *  queue redeliver it — rather than holding a claimed message past its visibility timeout. */
const IMPORT_POLL_TIMEOUT_MS = 60_000;
const IMPORT_POLL_INTERVAL_MS = 1_000;

/**
 * Blocks until an import operation reports done, and throws if it failed.
 *
 * Accepting the initial 200 as success was wrong: that response only acknowledges that ACS
 * received the batch. An import that is rejected wholesale still returns it, so the queue counted
 * every product in the batch as indexed and `catalog_sync_progress` climbed to a full count over
 * an index holding nothing. Failing here instead lets `syncProductsToAcs` report the batch as
 * failed, which is what leaves its messages on the queue to be retried.
 */
async function awaitImportOperation(operation: AcsOperation): Promise<void> {
  const deadline = Date.now() + IMPORT_POLL_TIMEOUT_MS;
  let current = operation;

  while (!current.done) {
    if (!current.name) throw new Error("ACS import returned no operation name to poll");
    if (Date.now() > deadline) throw new Error(`ACS import ${current.name} did not finish within ${IMPORT_POLL_TIMEOUT_MS}ms`);

    await sleep(IMPORT_POLL_INTERVAL_MS);
    current = await acsFetch<AcsOperation>(current.name, { method: "GET" });
  }

  if (current.error) throw new Error(`ACS import failed: ${current.error.message ?? JSON.stringify(current.error)}`);

  // Individual rejections don't fail the operation, and the rest of the batch is already indexed.
  // Throwing on them would make one permanently-malformed product retry — and eventually
  // discard — the hundreds imported alongside it, so they're logged rather than raised. Logging
  // is still the whole point: the alternative to seeing them here is not seeing them at all.
  const samples = current.response?.errorSamples ?? [];
  if (samples.length > 0) {
    const detail = samples.slice(0, 3).map((sample) => sample.message ?? JSON.stringify(sample));
    console.error(`[acs/client importProducts] ACS rejected ${samples.length} product(s) in this batch:`, detail);
  }
}

/** A masked patch only ever needs `id` plus whatever fields `updateMask` names — the full
 *  `AcsProduct` shape (with its required `title`/`categories`) would force every caller to
 *  re-send fields nothing changed about, just to satisfy the type. */
export type AcsProductPatch = Partial<AcsProduct> & Pick<AcsProduct, "id">;

/** Single-item update for the webhook path — same "send only what changed" shape as today's
 *  Supabase upsert. `updateMask` is a comma-joined list of top-level field paths; omit it to
 *  replace the whole product (rare — most callers want a mask). */
export async function patchProduct(product: AcsProductPatch, updateMask?: string[]): Promise<void> {
  const config = getAcsConfig();
  const name = `${branchPath(config)}/products/${product.id}`;
  const query = updateMask?.length ? `?updateMask=${encodeURIComponent(updateMask.join(","))}` : "";
  await acsFetch(`${name}${query}`, { method: "PATCH", body: JSON.stringify(product) });
}

/**
 * Prefer this over `products.delete` for a product no longer current — Google's own guidance is
 * explicit that deleting invalidates the user-event history tied to that product (see the plan's
 * "Delete vs. out-of-stock" risk). Reserve actual deletion for genuine duplicates/errors, and for
 * a merchant disconnecting their store entirely — there is no ongoing catalog left for that
 * user-event history to serve at that point (see `deleteAllAcsProductsForConnection`).
 */
export async function markOutOfStock(acsProductId: string): Promise<void> {
  await patchProduct({ id: acsProductId, availability: "OUT_OF_STOCK" }, ["availability"]);
}

/**
 * Idempotent, and returns whether this call is what removed the product.
 *
 * A 404 is success, not failure: it means the product is already in the state this function
 * exists to produce. That matters because ACS's search index lags deletion by enough that a
 * bulk sweep driven by search results will legitimately be handed ids it has already deleted —
 * treating those as errors aborts the sweep partway through and strands the rest (see
 * `deleteAllAcsProductsForConnection`).
 */
export async function deleteProduct(acsProductId: string): Promise<boolean> {
  const config = getAcsConfig();
  try {
    await acsFetch(`${branchPath(config)}/products/${acsProductId}`, { method: "DELETE" });
    return true;
  } catch (err) {
    if (err instanceof AcsApiError && err.status === 404) return false;
    throw err;
  }
}

/**
 * Reads products from ProductService itself rather than the search index. The latter is
 * eventually consistent, so it cannot be the source of truth for destructive cleanup.
 */
export async function listProducts(pageToken?: string): Promise<AcsListProductsResponse> {
  const config = getAcsConfig();
  const params = new URLSearchParams({ pageSize: "1000" });
  if (pageToken) params.set("pageToken", pageToken);
  return acsFetch<AcsListProductsResponse>(`${branchPath(config)}/products?${params}`, { method: "GET" });
}

/** Single-item lookup, used by the catalog-reads and sync paths to read back what ACS already
 *  holds for a product (its `source_category_ids` attribute, or simply whether it exists at
 *  all) before deciding how to write it. Returns `null` on a 404 rather than throwing — "doesn't
 *  exist yet" is an expected, ordinary outcome for every caller of this function. */
export async function getProduct(acsProductId: string): Promise<AcsProduct | null> {
  const config = getAcsConfig();
  try {
    return await acsFetch<AcsProduct>(`${branchPath(config)}/products/${acsProductId}`, { method: "GET" });
  } catch (err) {
    if (err instanceof AcsApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Sent on every search, because the server default is `DISABLED` and that default is wrong for
 * how this app queries.
 *
 * With expansion off, ACS treats a query as strictly conjunctive: every additional word narrows
 * the result set, and one word absent from the catalog's text empties it. Retrieval here does not
 * pass a shopper's two-word phrase through — it passes a written description of the ideal item —
 * so the default guarantees zero results for exactly the descriptive queries the agent is built
 * around. `pinUnexpandedResults` keeps genuine exact matches on top, so widening only ever adds
 * to the tail rather than reordering a result set that was already good.
 */
const QUERY_EXPANSION_SPEC = { condition: "AUTO", pinUnexpandedResults: true } as const;

export interface SearchOptions {
  connectionId: string;
  /** The merchant's currently-selected categories, expanded to include descendants — same value
   *  every pgvector read is scoped by. Required, not optional, for the same reason
   *  `merchantFilterClause` is non-skippable: this is the other half of the isolation boundary
   *  (see `categoryScopeFilterClause`). An empty scope is a valid input — it means "search
   *  nothing" — and is handled by the caller short-circuiting before this is ever called, exactly
   *  like `searchCatalogProducts`/`filterCatalogProducts` do today. */
  categoryScope: readonly string[];
  visitorId: string;
  query?: string;
  pageSize?: number;
  /** Additional filter clauses beyond the mandatory merchant/scope ones, e.g. category/price/brand
   *  from `filter-builder.ts`. ANDed with them — never a replacement for either. */
  extraFilter?: string;
  pageCategories?: string[];
  /** Set from a previous call's `nextPageToken` to fetch the next page. Used by the
   *  catalog-reads facet/browse paths, which need more than one page's worth of results. */
  pageToken?: string;
}

/**
 * The one chokepoint every retrieval mode must call through. `merchantFilterClause` and
 * `categoryScopeFilterClause` are always present and always ANDed first — there is no parameter
 * that lets a caller omit either, which is the point: the isolation boundary can't be forgotten
 * by a future call site the way an easily-skipped optional argument could be.
 */
export async function searchProducts(options: SearchOptions): Promise<AcsSearchResponse> {
  const scopeClause = categoryScopeFilterClause(options.categoryScope);
  // An empty scope means "select nothing", never "no restriction" — the same rule pgvector's
  // reads enforce. Failing loudly here catches a caller that forgot to short-circuit rather than
  // silently handing back another merchant's — or this merchant's deselected — products.
  if (!scopeClause) {
    throw new Error("searchProducts: categoryScope must not be empty — callers must short-circuit before calling");
  }

  const clauses = [merchantFilterClause(options.connectionId), scopeClause];
  if (options.extraFilter) clauses.push(`(${options.extraFilter})`);

  return searchProductsRaw(clauses.join(" AND "), options);
}

/**
 * The escape hatch beneath `searchProducts`, for the handful of call sites that need a filter
 * `searchProducts`'s mandatory inclusion-scope clause can't express — most notably pruning,
 * which has to find products *outside* a scope rather than inside one. Callers here are on their
 * own for isolation: each one must still fold in `merchantFilterClause` itself, since nothing
 * about this signature enforces it the way `searchProducts` does.
 */
export async function searchProductsRaw(
  filter: string,
  options: Pick<SearchOptions, "visitorId" | "query" | "pageSize" | "pageCategories" | "pageToken">
): Promise<AcsSearchResponse> {
  const config = getAcsConfig();

  const body: AcsSearchRequest = {
    placement: defaultPlacementPath(config),
    visitorId: options.visitorId,
    query: options.query ?? "",
    pageSize: options.pageSize ?? 10,
    filter,
    pageCategories: options.pageCategories,
    pageToken: options.pageToken,
    queryExpansionSpec: QUERY_EXPANSION_SPEC,
  };

  return acsFetch<AcsSearchResponse>(`${defaultPlacementPath(config)}:search`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Records one behavioral signal (search / detail-page-view / add-to-cart / ...) against the
 * catalog-wide `userEvents.write` endpoint. Unlike products and searches, user events carry no
 * `merchant_id` filter of their own — isolation here rides entirely on `visitorId` already being
 * connection-namespaced (see `buildAcsVisitorId`) and on `productDetails` already referencing
 * connection-namespaced product ids (see `buildAcsProductId`), so there is nothing to enforce at
 * this call site.
 */
export async function writeUserEvent(event: AcsUserEvent): Promise<void> {
  const config = getAcsConfig();
  const body: AcsUserEvent = { ...event, eventTime: event.eventTime ?? new Date().toISOString() };
  await acsFetch(`${catalogPath(config)}/userEvents:write`, { method: "POST", body: JSON.stringify(body) });
}
