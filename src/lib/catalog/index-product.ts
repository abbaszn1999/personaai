import { downgradeAcsProductIfExists, fetchExistingAcsSourceCategoryIds, syncProductToAcs } from "@/lib/catalog/acs/sync";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { CategoryPath } from "@/lib/retrieval/types";
import { mapToCanonical } from "@/lib/retrieval/taxonomy";
import { expandCategorySelection } from "./category-scope";
import type { RawCatalogProduct } from "./sync-types";

/** No more "unchanged" outcome — there is no local hash-gated cache to skip, and ACS's own
 *  import is cheap enough (no per-product model call the way Gemini enrichment/embedding was)
 *  that every walk simply re-writes every product it sees. */
export type IndexOutcome = "indexed" | "failed";

/** Adds the two decisions a webhook can reach that a direct index call cannot. */
export type WebhookIndexOutcome = IndexOutcome | "out-of-scope" | "removed";

/** What a connection needs to resolve a product's category paths and route its option groups —
 *  just enough to be usable from a test fixture without pulling in the whole `StoreConnectionRow`.
 *
 *  `acsFieldOverrides` is required rather than optional on purpose: it is the one field a caller can
 *  omit without anything failing, and the consequence of omitting it is silent — the merchant's
 *  Stage 1 reassignment would be correct in the preview and absent from the index. Making the type
 *  demand it means the compiler catches a new call site that forgets. */
export type CategoryLookup = Pick<
  StoreConnectionRow,
  "selectedCategoryIds" | "categories" | "acsFieldOverrides"
>;

/**
 * Resolves every selected category a product belongs to, using the merchant's own names, in
 * full — however many levels deep the merchant's store actually nests that category.
 *
 * A product can sit in more than one category the merchant has chosen to index at once — a
 * wallet filed under both "mens pants" and "Shoes & Bags" — and this keeps every one of them
 * rather than picking a single winner, so a shopper reaches it however they ask. Categories the
 * merchant hasn't selected are ignored entirely, same as the rest of the indexing pipeline.
 *
 * The merchant selects at any level, and choosing a branch pulls in everything beneath it. But a
 * product is tagged with the *specific* term it sits on, which is commonly a child or grandchild
 * of what was selected ("Men" selected;
 * a shirt is tagged "Men > Clothing > Shirts" and reports only "Shirts"). So this walks up from
 * each of the product's own tags, collecting every name along the way, until it reaches whichever
 * selected category owns it — rather than only matching a product tagged with the selected id
 * verbatim, which would silently produce zero paths for almost every real, multi-level store.
 *
 * The emitted array is root-first, leaf-last: `["Men", "Clothing", "Shirts"]`. It stops at the
 * selected ancestor rather than climbing further — anything above that was never chosen, so it
 * isn't part of what the product was indexed under.
 *
 * Ordered by the merchant's own selection order, so `[0]` is deterministic rather than whatever
 * order the platform API happened to return.
 */
export function resolveCategoryPaths(product: RawCatalogProduct, connection: CategoryLookup): CategoryPath[] {
  const byId = new Map(connection.categories.map((category) => [category.id, category]));
  const selected = new Set(connection.selectedCategoryIds);
  const seen = new Set<string>();
  // Grouped by which selected category owns the path, so the result can be emitted in the
  // merchant's own selection order regardless of the order the product's own tags are listed in.
  const byRootId = new Map<string, CategoryPath[]>();

  for (const taggedId of product.sourceCategoryIds) {
    const leaf = byId.get(taggedId);
    if (!leaf) continue;

    // Collect the chain as we climb, root-first once reversed. Stops the moment a selected
    // category is reached — that's the root of this path, and nothing above it was chosen.
    const chain = [leaf];
    let root = selected.has(leaf.id) ? leaf : null;
    let cursor = leaf;
    while (!root && cursor.parentId) {
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      chain.unshift(parent);
      cursor = parent;
      if (selected.has(cursor.id)) root = cursor;
    }
    if (!root) continue;

    const path = chain.map((node) => node.name);
    const key = path.join("::");
    if (seen.has(key)) continue;
    seen.add(key);

    const bucket = byRootId.get(root.id) ?? [];
    bucket.push(path);
    byRootId.set(root.id, bucket);
  }

  const paths: CategoryPath[] = [];
  for (const id of connection.selectedCategoryIds) paths.push(...(byRootId.get(id) ?? []));
  return paths;
}

/**
 * Derives the internal try-on/bundle slot from the title alone.
 *
 * Deliberately independent of the merchant's real category names above: "Men" or "New Arrivals"
 * says nothing about what a garment physically occupies, so try-on layering and the bundle
 * finder still need the fixed tops/bottoms/footwear vocabulary — just never exposed to the
 * shopper as a filterable value.
 */
export function resolveGarmentCategory(product: RawCatalogProduct): {
  garmentCategory: string | null;
  garmentSubcategory: string | null;
} {
  const mapped = mapToCanonical(product.title);
  return { garmentCategory: mapped?.category ?? null, garmentSubcategory: mapped?.subcategory ?? null };
}

/**
 * Indexes exactly one product, inline.
 *
 * The webhook path uses this rather than the queue: a single item's ACS write is one API call,
 * and putting it behind a possibly-large backfill's queue would mean a merchant editing a
 * product waits behind 20,000 unrelated ones to see the change.
 */
export async function indexSingleProduct(
  connectionId: string,
  product: RawCatalogProduct,
  sourceCategoryIds: string[],
  connection: CategoryLookup
): Promise<IndexOutcome> {
  try {
    const categoryPaths = resolveCategoryPaths({ ...product, sourceCategoryIds }, connection);
    const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(product);

    const written = await syncProductToAcs({
      raw: product,
      connectionId,
      categoryPaths,
      garmentCategory,
      garmentSubcategory,
      sourceCategoryIds,
      fieldOverrides: connection.acsFieldOverrides,
    });

    return written ? "indexed" : "failed";
  } catch (err) {
    console.error("[catalog indexSingleProduct]", connectionId, product.externalId, err);
    return "failed";
  }
}

/**
 * Indexes a webhook product only if the merchant's category selection covers it.
 *
 * The scope check happens before the ACS write, which is the point: a store webhook fires for
 * every product a merchant touches, and indexing whatever arrives would put products the
 * merchant deliberately excluded into the shared catalog anyway.
 *
 * It also handles the reverse. A product recategorised out of the selection is downgraded to
 * out-of-stock rather than left behind, because an already-indexed row would otherwise keep
 * being recommended.
 */
export async function indexProductIfInScope(
  connection: StoreConnectionRow,
  product: RawCatalogProduct
): Promise<WebhookIndexOutcome> {
  const scope = expandCategorySelection(connection.selectedCategoryIds, connection.categories);
  if (scope.length === 0) return "out-of-scope";

  // Shopify's payload omits collections entirely, so an empty set means "unknown", not "belongs
  // to nothing". Falling back to what ACS already has recorded keeps edits to indexed products
  // working; a genuinely new product with no membership information waits for the next category
  // walk instead of being indexed on a guess.
  const membership =
    product.sourceCategoryIds.length > 0
      ? product.sourceCategoryIds
      : await fetchExistingAcsSourceCategoryIds(connection.id, product.externalId);

  // A failed read leaves membership unknown, and every branch below treats unknown membership as
  // "belongs to nothing" — which here means downgrading an in-scope product to out-of-stock and
  // pulling it from the storefront over a transient 429. Reported as a failure so the webhook is
  // redelivered instead.
  if (membership === null) {
    console.error(`[catalog index-product] cannot resolve scope for ${product.externalId}: category read failed`);
    return "failed";
  }

  if (!membership.some((id) => scope.includes(id))) {
    const removed = await downgradeAcsProductIfExists(connection.id, product.externalId);
    return removed ? "removed" : "out-of-scope";
  }

  return indexSingleProduct(connection.id, { ...product, sourceCategoryIds: membership }, membership, connection);
}
