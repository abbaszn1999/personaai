import { createHash } from "node:crypto";

/** One selected category a product belongs to, in the merchant's own names, ordered root-first
 *  down to the product's own most specific tag — `["Men", "Clothing", "Shirts"]` — however many
 *  levels deep the merchant's store actually nests that category. */
export type CategoryPath = string[];

/** The fields whose change should force a product to be described and embedded again. */
export interface HashableProductContent {
  title: string;
  description?: string | null;
  brand?: string | null;
  categoryPaths: CategoryPath[];
  imageUrl?: string | null;
}

function stableCategoryKey(paths: CategoryPath[]): string {
  return paths
    .map((path) => path.join("::"))
    .sort()
    .join("|");
}

/**
 * Fingerprints everything the enriched description and the vector are derived from.
 *
 * The gate this drives is what makes ongoing sync nearly free: a merchant editing a price or
 * selling out of a size re-syncs the row and skips both model calls, while a retitled product
 * or a swapped photo re-runs them.
 *
 * The image URL is part of the hash for that second case specifically. Omitting it is the
 * subtle bug — a product would keep a vector describing a photo it no longer uses, and
 * nothing would error; it would just rank against the wrong picture indefinitely.
 *
 * `categoryPaths` is sorted before hashing so the order categories were walked in never causes
 * a spurious re-embed — only an actual change in which categories the product belongs to does.
 * A product moving between selected categories legitimately changes what it should be described
 * against, so that case is meant to re-run both calls, unlike price and stock below.
 *
 * Price, stock and inventory counts are deliberately absent. They change constantly, feed
 * neither the description nor the vector, and including them would re-run both calls on every
 * routine inventory update.
 */
export function computeContentHash(content: HashableProductContent): string {
  const payload = [
    content.title.trim(),
    content.description?.trim() ?? "",
    content.brand?.trim() ?? "",
    stableCategoryKey(content.categoryPaths),
    content.imageUrl?.trim() ?? "",
  ].join("\u0000");

  return createHash("sha256").update(payload).digest("hex");
}
