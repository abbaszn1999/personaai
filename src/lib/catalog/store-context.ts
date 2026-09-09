import type { StoreConnectionRow } from "@/lib/db/store-connections";

/**
 * The storefront a classifier's input came from, as one line for its prompt.
 *
 * Cheap evidence that changes real answers: a domain like `kidsboutique.gr` settles what an
 * unqualified "Clothing" path holds, and a store name echoed in a collection title marks it as a
 * house department rather than a brand.
 */
export function storeContextFor(connection: StoreConnectionRow): string {
  let domain = connection.storeUrl;
  try {
    domain = new URL(connection.storeUrl).hostname;
  } catch {
    // A stored URL that will not parse is still worth showing verbatim.
  }
  return `"${connection.storeName}" at ${domain}.`;
}
