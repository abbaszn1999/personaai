/**
 * One row of Categories step 2: a path the merchant put in scope, awaiting a parent sizing
 * category.
 *
 * Both platforms collapse onto this shape by the time step 2 renders, which is the whole point of
 * it. WooCommerce contributes the frontier of its native term tree; Shopify contributes the
 * distinct collections behind the leaves of the tree the merchant built. Step 2 is then one screen
 * with one behaviour instead of two that have to be kept in agreement.
 */
export interface MappablePath {
  /** The platform's own id — a WooCommerce term id, a Shopify collection id — which is what the
   *  parent map keys on. */
  id: string;
  name: string;
  /** `Women > Tops > T-Shirts`, for telling apart the four different `T-Shirts` a real store has. */
  path: string;
  /**
   * The store's own slug for this path, where it has one.
   *
   * The breadcrumb is usually enough to identify a row, but not always: a store can carry several
   * sibling terms with the same display name — this catalog has ten called "Accessories" under
   * Women — and those all produce the same breadcrumb. The slug is unique where the name is not, so
   * it is the last thing standing between the merchant and ten identical rows.
   */
  handle?: string;
  productCount: number;
}

/** One path's verdict as the classify route returns it. `parent` is left loosely typed because it
 *  crossed the wire — the client narrows it with `isSizingGroup` before writing it to the map. */
export interface ClassifiedPath {
  id: string;
  parent: string | null;
  /** The path holds several parents at once, so no single mapping is right for it. */
  mixed: boolean;
  reason: string;
}

/** What auto-classify concluded about one row, kept to show underneath it. */
export interface PathNote {
  mixed: boolean;
  reason: string;
}
