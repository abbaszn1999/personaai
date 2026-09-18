import { downgradeAcsProductIfExists, syncProductToAcs } from "@/lib/catalog/acs/sync";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { CategoryPath } from "@/lib/retrieval/types";
import { mapToCanonical } from "@/lib/retrieval/taxonomy";
import { boundMetafieldKeys, SHOPIFY_METAFIELD_PREFIX } from "./acs-mapping";
import { expandCategorySelection } from "./category-scope";
import { buildPersonaMappingConfig, resolvePersonaPaths } from "./persona-mapping";
import { createCatalogPager } from "./pager";
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
 *  `acsFieldMapping` is required rather than optional on purpose: it is the one field a caller can
 *  omit without anything failing, and the consequence of omitting it is silent — the merchant's
 *  Stage 1 reassignment would be correct in the preview and absent from the index. Making the type
 *  demand it means the compiler catches a new call site that forgets. */
export type CategoryLookup = Pick<
  StoreConnectionRow,
  "selectedCategoryIds" | "categories" | "acsFieldMapping"
> & Partial<Pick<StoreConnectionRow, "personaTaxonomyScope" | "personaCategoryMap">>;

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
  const config = buildPersonaMappingConfig(
    connection.personaTaxonomyScope,
    connection.personaCategoryMap,
    connection.categories,
  );
  return resolvePersonaPaths(product.sourceCategoryIds, config).map((path) => path.segments);
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
    if (categoryPaths.length === 0) return "failed";
    const { garmentCategory, garmentSubcategory } = resolveGarmentCategory(product);

    const written = await syncProductToAcs({
      raw: product,
      connectionId,
      categoryPaths,
      garmentCategory,
      garmentSubcategory,
      fieldMapping: connection.acsFieldMapping,
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
  //
  // The same refetch also recovers the merchant's bound metafields, which a Shopify webhook body
  // never carries: without it, every webhook edit would rewrite the product with those attributes
  // emptied, so a mapped metafield would survive the backfill and then quietly disappear the next
  // time anyone touched the product in the store admin.
  //
  // Checked key-by-key rather than "is `customFields` empty" — the webhook payload already carries
  // a few of Shopify's own built-in fields (tags, compare-at price), so it is routinely non-empty
  // even when every bound metafield is still missing from it.
  let membership = product.sourceCategoryIds;
  let customFields = product.customFields;
  let variants = product.variants;
  const boundMetafields = boundMetafieldKeys(connection.acsFieldMapping);
  const needsCustomFields = boundMetafields.some(
    (key) => !(`${SHOPIFY_METAFIELD_PREFIX}${key}` in customFields)
  );
  // WooCommerce's webhook payload for a "variable" product carries only its variations' ids, not
  // their price/stock/options — `mapWooWebhookProduct` signals that gap with an empty array (see
  // its own doc comment) rather than a single wrong synthetic variant. Shopify's webhook payload
  // never has this gap; its mapper always returns at least one real entry.
  const needsVariants = variants.length === 0;

  if (membership.length === 0 || needsCustomFields || needsVariants) {
    try {
      const pager = await createCatalogPager(connection);
      const refreshed = pager ? (await pager.fetchByIds([product.externalId]))[0] : undefined;
      if (membership.length === 0) membership = refreshed?.sourceCategoryIds ?? [];
      if (needsCustomFields && refreshed) customFields = refreshed.customFields;
      if (needsVariants && refreshed) variants = refreshed.variants;
    } catch (error) {
      console.error(`[catalog index-product] cannot refresh ${product.externalId} for indexing`, error);
      return "failed";
    }
  }

  if (!membership.some((id) => scope.includes(id))) {
    const removed = await downgradeAcsProductIfExists(connection.id, product.externalId);
    return removed ? "removed" : "out-of-scope";
  }

  return indexSingleProduct(
    connection.id,
    { ...product, sourceCategoryIds: membership, customFields, variants },
    membership,
    connection
  );
}
