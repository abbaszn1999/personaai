import { AcsApiError, searchProducts } from "@/lib/catalog/acs/client";
import { buildAcsVisitorId } from "@/lib/catalog/acs/isolation";
import { toCandidate } from "@/lib/catalog/acs/search-adapter";
import { recordSearchEvent } from "@/lib/catalog/acs/user-events";
import type { AcsSearchResultItem } from "@/lib/catalog/acs/types";
import { normalizePath } from "@/lib/catalog/path-config/lookup";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { SizingGroup } from "@/lib/sizing/measurements";
import { personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";
import type { AgentContext } from "../types";
import { IMAGE_FILTER_FIELD, toAcsFilter, type SearchSpec } from "./acs-translator";
import { bodyMeasurements, fitFilterClause, fittingSizes, isChildShopper } from "./fit";
import { hydrateLiveFacts } from "./hydrate";

export interface SearchOutcome {
  candidates: CatalogCandidate[];
  attributionToken?: string;
  filter: string;
}

/** Attribute fields ACS rejected as unknown (no product carries them yet), retried after a while.
 *  Global on purpose: every store shares one ACS catalog, so a field it does not know yet is
 *  unknown for all of them. */
const unsupportedFields = new Map<string, number>();
const UNSUPPORTED_FIELD_TTL_MS = 10 * 60_000;

function currentUnsupportedFields(): Set<string> {
  const now = Date.now();
  for (const [field, expires] of unsupportedFields) if (expires <= now) unsupportedFields.delete(field);
  return new Set(unsupportedFields.keys());
}

function unsupportedField(error: unknown): string | null {
  if (!(error instanceof AcsApiError) || error.status !== 400) return null;
  return error.body.match(/Unsupported field \\?"(attributes\.[a-z_]+)\\?"/)?.[1] ?? null;
}

export interface SearchOptions {
  /** Leave the shopper's fit out — only to learn whether fit is what emptied a search. */
  skipFit?: boolean;
}

/**
 * The sizing groups a search can return: a Persona category is sized on exactly one group, so a
 * shirt search needs only the tops clause. Null — every group — when a path is a whole
 * department. Sending only what can match keeps the filter short, and a group whose field ACS
 * does not index yet (no footwear anywhere) cannot fail a search that never wanted it.
 */
export function sizingGroupsFor(paths: readonly string[]): SizingGroup[] | null {
  const groups = new Set<SizingGroup>();
  for (const path of paths) {
    const category = normalizePath(path).split(" > ")[1];
    const group = category ? personaSizingGroup(category) : null;
    if (!group) return null;
    groups.add(group);
  }
  return groups.size > 0 ? [...groups] : null;
}

/**
 * One catalog search. An empty `query` is ACS browse mode (structural filter only); a written
 * description ranks by meaning inside the same filter. Variants collapse to their product, first
 * occurrence wins, so a colourway match never shows the same product twice.
 *
 * With the shopper's measurements on the session, only products whose size chart confirms an
 * in-stock size fits them come back, each carrying those sizes in `fitSizes`. A product with no
 * chart is never returned: nothing can confirm it fits.
 */
export async function searchCatalog(
  ctx: AgentContext,
  spec: SearchSpec,
  query: string,
  pageSize: number,
  options: SearchOptions = {}
): Promise<SearchOutcome> {
  if (!ctx.connection || ctx.categoryScope.length === 0) return { candidates: [], filter: "" };
  const connectionId = ctx.connection.id;
  const body = ctx.session.measurements && !options.skipFit ? bodyMeasurements(ctx.session.measurements) : null;
  const child = isChildShopper(ctx.session.audience);
  const groups = sizingGroupsFor(spec.paths);
  const filterWith = (unsupported: ReadonlySet<string>): string | null => {
    const specFilter = toAcsFilter(spec, connectionId, { hideImageless: !unsupported.has(IMAGE_FILTER_FIELD) });
    if (!body) return specFilter;
    const fit = fitFilterClause(body, child, unsupported, groups);
    return fit ? `${specFilter} AND (${fit})` : null;
  };

  const run = async (text: string) => {
    for (;;) {
      const unsupported = currentUnsupportedFields();
      const filter = filterWith(unsupported);
      if (filter === null) return { filter: toAcsFilter(spec, connectionId), response: null };
      try {
        const response = await searchProducts({
          connectionId,
          categoryScope: ctx.categoryScope,
          visitorId: buildAcsVisitorId(connectionId, ctx.visitorId),
          query: text,
          pageSize,
          extraFilter: filter,
          meter: ctx.meter,
          signal: ctx.signal,
        });
        return { filter, response };
      } catch (error) {
        // Retried only when the filter that failed still named the field: a concurrent search may
        // already have learned it, and one that did not name it would loop.
        const field = unsupportedField(error);
        if (!field || !filter.includes(field)) throw error;
        unsupportedFields.set(field, Date.now() + UNSUPPORTED_FIELD_TTL_MS);
      }
    }
  };

  const collect = (results: AcsSearchResultItem[] | undefined) => {
    const byProduct = new Map<string, CatalogCandidate>();
    const rows = new Map<string, Set<string>>();
    for (const item of results ?? []) {
      const candidate = toCandidate(item);
      if (!byProduct.has(candidate.externalId)) byProduct.set(candidate.externalId, candidate);
      const productRows = rows.get(candidate.externalId) ?? new Set<string>();
      for (const row of candidate.attributes?.fit_rows ?? []) productRows.add(row);
      rows.set(candidate.externalId, productRows);
    }
    const candidates: CatalogCandidate[] = [];
    for (const candidate of byProduct.values()) {
      if (!body) {
        candidates.push(candidate);
        continue;
      }
      // A variant record carries only its own size row; fit is judged across every size the
      // page returned for the product, so a one-number chart has its neighbouring sizes.
      const merged = { ...candidate, attributes: { ...candidate.attributes, fit_rows: [...(rows.get(candidate.externalId) ?? [])] } };
      const fitSizes = fittingSizes(merged, body, spec.sizes, child);
      if (fitSizes.length > 0) candidates.push({ ...candidate, fitSizes });
    }
    return candidates;
  };

  let { filter, response } = await run(query);
  let candidates = collect(response?.results);
  // A styling description retrieves only products whose text matches it, so it can come back with
  // nothing (or nothing that can be shown) while the validated filter still has stock. Every
  // product inside that filter satisfies the request, so browse it instead. A search that could
  // not be sent at all (no fit clause possible) has nothing to browse.
  if (response && query.trim() && !candidates.some(isDisplayable)) {
    ({ filter, response } = await run(""));
    candidates = collect(response?.results);
  }
  return { candidates, attributionToken: response?.attributionToken, filter };
}

export function isDisplayable(candidate: CatalogCandidate): boolean {
  return candidate.inStock && Boolean(candidate.imageUrl) && candidate.price !== null;
}

/**
 * Live price and stock for exactly what is about to be shown, then the rules nothing may break:
 * in stock, and inside the price window the shopper asked for. The index can be minutes stale;
 * the store is the truth.
 */
export async function verifyForDisplay(
  ctx: AgentContext,
  candidates: CatalogCandidate[],
  window: { priceMin: number | null; priceMax: number | null } = { priceMin: null, priceMax: null }
): Promise<CatalogCandidate[]> {
  if (!ctx.connection || candidates.length === 0) return candidates;
  const live = await hydrateLiveFacts(ctx.connection, candidates);
  return live.filter((candidate) => {
    if (!candidate.inStock || !candidate.imageUrl) return false;
    if (candidate.price === null) return window.priceMin === null && window.priceMax === null;
    if (window.priceMax !== null && candidate.price > window.priceMax) return false;
    if (window.priceMin !== null && candidate.price < window.priceMin) return false;
    return true;
  });
}

/** Tells ACS what was shown for which query, so its ranking learns from this store's shoppers. */
export function recordShown(ctx: AgentContext, query: string, attributionToken: string | undefined, ids: string[]): void {
  if (!ctx.connection || ids.length === 0) return;
  void recordSearchEvent({
    connectionId: ctx.connection.id,
    visitorId: ctx.visitorId,
    searchQuery: query,
    attributionToken,
    resultExternalIds: ids,
  }).catch((error) => console.warn("[agents search] search event failed:", error instanceof Error ? error.message : error));
}
