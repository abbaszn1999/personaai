/**
 * Puts the sizes that fit a shopper in the words the store sells them in.
 *
 * A product's fit rows are labelled in the chart's own size system, in the system the merchant
 * declared (`canonicalLabelForRow`). Most stores sell in that same system, so "M" is "M" or "Medium".
 * Some sell in another: trousers listed as 46 / 48 / 50 against a chart whose rows are S / M / L. The
 * match between the two is made from the row's aliases when the index is built, and then thrown away,
 * leaving only the chart label ("M"). Shown as it was, the shopper is told "size M" for a product that
 * has no M, and Add to cart goes looking for a variant called M and reports it sold out.
 *
 * The match is recomputed here, with the same code that built the index, and only for the products
 * where the labels do not already agree.
 */
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { SizingResolutionContext } from "./product-chart";
import { sizeLabelCandidates } from "./size-label-forms";

function sameSize(left: string, right: string): boolean {
  const forms = new Set(sizeLabelCandidates(right));
  return sizeLabelCandidates(left).some((form) => forms.has(form));
}

/** One of the product's chart rows: the label the store uses, and the label the chart gave it. */
export interface SizeMatch {
  raw: string;
  canonical: string;
}

/**
 * `fitSizes` (chart labels, best first) as store labels. A label the store already sells is kept as
 * it is. Otherwise it is looked up in the product's own chart matches and replaced by the store's
 * label for that row, preferring one that is in stock. A label that cannot be placed is dropped, and
 * null comes back when none can, so the caller keeps what it had rather than showing nothing.
 */
export function storeLabelsFor(
  fitSizes: readonly string[],
  matches: readonly SizeMatch[],
  stocked: readonly string[],
): string[] | null {
  const result: string[] = [];
  const add = (label: string) => {
    if (!result.some((existing) => sameSize(existing, label))) result.push(label);
  };

  for (const size of fitSizes) {
    if (stocked.some((label) => sameSize(label, size))) {
      add(size);
      continue;
    }
    const raws = matches.filter((match) => sameSize(match.canonical, size)).map((match) => match.raw);
    const inStock = raws.map((raw) => stocked.find((label) => sameSize(label, raw))).find((label) => label !== undefined);
    const pick = inStock ?? (stocked.length === 0 ? raws[0] : undefined);
    if (pick) add(pick);
  }
  return result.length > 0 ? result : null;
}

/** True when a product's chart sizes are not among the sizes it is sold in. */
export function needsStoreLabels(candidate: Pick<CatalogCandidate, "fitSizes" | "attributes">): boolean {
  const stocked = candidate.attributes?.size ?? [];
  if (!candidate.fitSizes?.length || stocked.length === 0) return false;
  return candidate.fitSizes.some((size) => !stocked.some((label) => sameSize(label, size)));
}

const CONTEXT_TTL_MS = 60_000;
const contexts = new Map<string, { value: Promise<SizingResolutionContext>; expiresAt: number }>();

function contextFor(connection: StoreConnectionRow): Promise<SizingResolutionContext> {
  const cached = contexts.get(connection.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = import("./product-chart").then((module) => module.loadSizingResolutionContext(connection));
  contexts.set(connection.id, { value, expiresAt: Date.now() + CONTEXT_TTL_MS });
  // A failed load must not be remembered: the next turn tries again.
  value.catch(() => contexts.delete(connection.id));
  return value;
}

/**
 * The candidates with `fitSizes` in the store's own labels. Touches the database only when some
 * candidate's labels disagree with its stocked sizes, which is rare, and never fails a turn: on any
 * error the candidates come back as they were.
 */
export async function localizeFitSizes(
  connection: StoreConnectionRow | null | undefined,
  candidates: CatalogCandidate[],
): Promise<CatalogCandidate[]> {
  if (!connection) return candidates;
  const targets = candidates.filter(needsStoreLabels);
  if (targets.length === 0) return candidates;

  try {
    // Loaded on use: this module is imported by the agents, whose tests run without a database.
    const [{ listSizingProductRecordsByIds }, { resolveProductChart }] = await Promise.all([
      import("@/lib/db/sizing-product-records"),
      import("./product-chart"),
    ]);
    const [records, context] = await Promise.all([
      listSizingProductRecordsByIds(connection.id, targets.map((candidate) => candidate.externalId)),
      contextFor(connection),
    ]);
    const byId = new Map(records.map((record) => [record.externalId, record]));

    return candidates.map((candidate) => {
      if (!needsStoreLabels(candidate)) return candidate;
      const record = byId.get(candidate.externalId);
      if (!record) return candidate;
      const resolution = resolveProductChart(
        {
          brandKey: record.brandKey,
          sizingCategory: record.sizingCategory,
          primaryPersonaLeafKey: record.primaryPersonaLeafKey,
          rawSizeFormat: record.rawSizeFormat,
        },
        context,
      );
      if (resolution.status !== "matched") return candidate;
      const labels = storeLabelsFor(candidate.fitSizes!, resolution.sizeMatches, candidate.attributes?.size ?? []);
      return labels ? { ...candidate, fitSizes: labels } : candidate;
    });
  } catch (error) {
    console.warn("[sizing localizeFitSizes]", error instanceof Error ? error.message : error);
    return candidates;
  }
}
