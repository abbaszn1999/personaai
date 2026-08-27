import { importProducts, markOutOfStock } from "./client";
import { isAcsConfigured } from "./config";
import { ensureDynamicAttributeRegistered } from "./attributes-config";
import { getAcsProductSourceCategoryIds, markAcsProductOutOfStockIfExists } from "./catalog-reads";
import { buildAcsProductId } from "./isolation";
import { CUSTOM_OPTION_ATTRIBUTE_PREFIX, rawCatalogProductToAcsProduct, type MapProductInput } from "./map-product";
import type { AcsProduct } from "./types";

/**
 * ACS is the sole write path for the catalog — there is no pgvector table left to fall back to,
 * so every function here is what indexing actually depends on. Still best-effort in the sense
 * that a transient ACS error is logged and reported to the caller as a failure to retry, never
 * thrown past this module: the queue/webhook callers already have their own retry and
 * give-up machinery (see `process-queue.ts`'s `MAX_ATTEMPTS`), and re-implementing that here
 * would just be a second copy of it.
 */
export { isAcsConfigured };

function logAcsError(op: string, connectionId: string, detail: string, err: unknown): void {
  console.error(`[acs/sync ${op}]`, connectionId, detail, err);
}

/** Collects the distinct `opt_*` attribute keys a batch of mapped products actually carries —
 *  the merchant-specific option groups (fit, style, ...) `map-product.ts` had no predefined ACS
 *  field for — and registers each with the catalog before the import that writes their values.
 *  Registration only has to happen once per key per process (see `ensureDynamicAttributeRegistered`'s
 *  own cache), so this is cheap on every call after the first that sees a given option name. */
async function ensureDynamicAttributesRegistered(products: AcsProduct[]): Promise<void> {
  const keys = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(product.attributes ?? {})) {
      if (key.startsWith(CUSTOM_OPTION_ATTRIBUTE_PREFIX)) keys.add(key);
    }
  }

  await Promise.all([...keys].map((key) => ensureDynamicAttributeRegistered(key)));
}

/** Full upsert for one product — the webhook path's create-or-update. Uses `products:import`
 *  rather than `products.patch` even for a single item: import behaves as a genuine upsert
 *  regardless of whether the product already exists in ACS, while `patch` assumes it does and
 *  would 404 on a merchant's brand-new product. */
export async function syncProductToAcs(input: MapProductInput): Promise<boolean> {
  if (!isAcsConfigured()) return false;
  try {
    const product = rawCatalogProductToAcsProduct(input);
    await ensureDynamicAttributesRegistered([product]);
    await importProducts([product]);
    return true;
  } catch (err) {
    logAcsError("syncProductToAcs", input.connectionId, input.raw.externalId, err);
    return false;
  }
}

/** Batch upsert for the backfill path. One `importProducts` call per invocation — the client
 *  itself splits into `IMPORT_BATCH_SIZE` chunks, so callers don't need to. */
export async function syncProductsToAcs(inputs: MapProductInput[]): Promise<boolean> {
  if (inputs.length === 0) return true;
  if (!isAcsConfigured()) return false;
  try {
    const products = inputs.map(rawCatalogProductToAcsProduct);
    await ensureDynamicAttributesRegistered(products);
    await importProducts(products);
    return true;
  } catch (err) {
    // Batch failure — attribute to the batch's connection since a mixed-connection batch is not
    // expected in practice (process-queue.ts groups by connection before calling this).
    logAcsError("syncProductsToAcs", inputs[0]?.connectionId ?? "unknown", `batch of ${inputs.length}`, err);
    return false;
  }
}

/** Prefer this over an ACS delete when a product leaves the merchant's selected scope — Google's
 *  own guidance is to preserve user-event history rather than invalidate it (see the plan's
 *  "Delete vs. out-of-stock" risk). Unconditional: safe to call for a webhook `products/delete`
 *  event even without knowing whether ACS ever actually held the product. */
export async function markAcsProductOutOfStock(connectionId: string, externalId: string): Promise<void> {
  if (!isAcsConfigured()) return;
  try {
    await markOutOfStock(buildAcsProductId(connectionId, externalId));
  } catch (err) {
    logAcsError("markAcsProductOutOfStock", connectionId, externalId, err);
  }
}

/** Same as `markAcsProductOutOfStock`, but reports whether the product actually existed —
 *  needed by the webhook "recategorised out of scope" path to tell a genuine removal from a
 *  product that was simply never in scope to begin with, purely for the outcome it reports. */
export async function downgradeAcsProductIfExists(connectionId: string, externalId: string): Promise<boolean> {
  if (!isAcsConfigured()) return false;
  try {
    return await markAcsProductOutOfStockIfExists(connectionId, externalId);
  } catch (err) {
    logAcsError("downgradeAcsProductIfExists", connectionId, externalId, err);
    return false;
  }
}

/**
 * Reads back what ACS already has recorded for this product's category membership, so a fresh
 * walk that only knows the one category it is currently walking can merge rather than overwrite.
 * Without this, a product that belongs to two selected categories would lose the other the
 * moment either category is re-walked on its own (see `mergeSourceCategories` in
 * process-queue.ts).
 *
 * `null` means the read failed and the answer is unknown; `[]` means ACS genuinely has nothing
 * recorded. Callers must not conflate them. An earlier version returned `[]` for both on the
 * reasoning that a missed merge would be "corrected on the next walk", which was wrong in a way
 * that quietly damaged the catalog: every ACS import replaces the whole product document, so a
 * merge against a wrongly-empty base rewrites the product with only the category currently being
 * walked. The other categories it belonged to are gone, and re-walking one of those restores it
 * while dropping this one. The product never converges — it just changes which searches can't
 * find it. Under the 429s a wide backfill draws, that applied to whole swathes of a catalog at
 * once.
 */
export async function fetchExistingAcsSourceCategoryIds(
  connectionId: string,
  externalId: string
): Promise<string[] | null> {
  if (!isAcsConfigured()) return [];
  try {
    return await getAcsProductSourceCategoryIds(connectionId, externalId);
  } catch (err) {
    logAcsError("fetchExistingAcsSourceCategoryIds", connectionId, externalId, err);
    return null;
  }
}
