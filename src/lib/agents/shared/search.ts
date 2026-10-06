import { AcsApiError, searchProducts } from "@/lib/catalog/acs/client";
import { buildAcsVisitorId } from "@/lib/catalog/acs/isolation";
import { toCandidate } from "@/lib/catalog/acs/search-adapter";
import { recordSearchEvent } from "@/lib/catalog/acs/user-events";
import type { AcsSearchResultItem } from "@/lib/catalog/acs/types";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { AgentContext } from "../types";
import { toAcsFilter, type SearchSpec } from "./acs-translator";
import { bodyMeasurements, fitFilterClause, fittingSizes, isChildShopper } from "./fit";
import { hydrateLiveFacts } from "./hydrate";

export interface SearchOutcome {
  candidates: CatalogCandidate[];
  attributionToken?: string;
  filter: string;
}

/** Fit fields ACS rejected as unknown (no product carries them yet), retried after a while. */
const unsupportedFitFields = new Map<string, number>();
const UNSUPPORTED_FIELD_TTL_MS = 10 * 60_000;

function currentUnsupportedFields(): Set<string> {
  const now = Date.now();
  for (const [field, expires] of unsupportedFitFields) if (expires <= now) unsupportedFitFields.delete(field);
  return new Set(unsupportedFitFields.keys());
}

function unsupportedFitField(error: unknown): string | null {
  if (!(error instanceof AcsApiError) || error.status !== 400) return null;
  return error.body.match(/Unsupported field \\?"(attributes\.fit_[a-z_]+)\\?"/)?.[1] ?? null;
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
  pageSize: number
): Promise<SearchOutcome> {
  if (!ctx.connection || ctx.categoryScope.length === 0) return { candidates: [], filter: "" };
  const specFilter = toAcsFilter(spec, ctx.connection.id);
  const body = ctx.session.measurements ? bodyMeasurements(ctx.session.measurements) : null;
  const child = isChildShopper(ctx.session.audience);
  const filterWith = (unsupported: ReadonlySet<string>): string | null => {
    if (!body) return specFilter;
    const fit = fitFilterClause(body, child, unsupported);
    return fit ? `${specFilter} AND (${fit})` : null;
  };

  const run = async (text: string) => {
    for (;;) {
      const filter = filterWith(currentUnsupportedFields());
      if (filter === null) return { filter: specFilter, response: null };
      try {
        const response = await searchProducts({
          connectionId: ctx.connection!.id,
          categoryScope: ctx.categoryScope,
          visitorId: buildAcsVisitorId(ctx.connection!.id, ctx.visitorId),
          query: text,
          pageSize,
          extraFilter: filter,
          meter: ctx.meter,
        });
        return { filter, response };
      } catch (error) {
        const field = unsupportedFitField(error);
        if (!field || unsupportedFitFields.has(field)) throw error;
        unsupportedFitFields.set(field, Date.now() + UNSUPPORTED_FIELD_TTL_MS);
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
  // A long styling description can match only products nobody can be shown (no image) or none
  // at all, while the validated filter still has stock. Every product inside that filter
  // satisfies the request, so browse it instead.
  // When the filter itself matched nothing there is nothing to browse: the same filter without a
  // query can only return the same empty set, and the extra search would be billed for nothing.
  if (response && response.results?.length && query.trim() && !candidates.some(isDisplayable)) {
    ({ filter, response } = await run(""));
    candidates = collect(response?.results);
  }
  return { candidates, attributionToken: response?.attributionToken, filter };
}

function isDisplayable(candidate: CatalogCandidate): boolean {
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
