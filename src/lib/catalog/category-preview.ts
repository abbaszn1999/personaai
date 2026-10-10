import type { CatalogPager } from "./pager";
import type { RawCatalogProduct } from "./sync-types";

export const CATEGORY_PREVIEW_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_CATEGORY_PREVIEW_PAGE_SIZE = 25;

/** Where the next page starts: which group, which raw platform page, and how many of that page's
 *  products an earlier request already showed. */
interface PreviewPosition {
  group: number;
  raw: string | null;
  skip: number;
}

export function encodePreviewCursor(position: PreviewPosition): string {
  return Buffer.from(JSON.stringify(position)).toString("base64url");
}

export function decodePreviewCursor(cursor: string | null | undefined): PreviewPosition | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<PreviewPosition>;
    if (
      typeof parsed.group !== "number" ||
      !Number.isInteger(parsed.group) ||
      parsed.group < 0 ||
      typeof parsed.skip !== "number" ||
      !Number.isInteger(parsed.skip) ||
      parsed.skip < 0 ||
      (parsed.raw !== null && typeof parsed.raw !== "string")
    ) {
      return null;
    }
    return { group: parsed.group, raw: parsed.raw ?? null, skip: parsed.skip };
  } catch {
    return null;
  }
}

/** Raw platform pages read for one preview page. A collection of drafts could otherwise keep this
 *  loop going for the whole catalog; past the cap the page is returned short with a cursor, and the
 *  next request carries on from there. */
const MAX_RAW_PAGES_PER_PREVIEW = 8;

/**
 * One page of a category, filled to `pageSize` whenever that many products remain.
 *
 * Platform pages are not the merchant's pages: Shopify drops drafts and archived products after the
 * read, so a raw page of 100 can hold 3, and WooCommerce walks a category subtree in several groups.
 * Filling across them is what makes "100 per page" mean 100. The cursor names a raw page plus how many
 * of its products were already used, so no product is skipped or shown twice when a raw page is split
 * across two preview pages.
 */
export async function readCategoryPreviewPage(
  pager: Pick<CatalogPager, "groups" | "fetchPage">,
  options: {
    pageSize: number;
    cursor?: string | null;
    /** Products failing this are passed over, counted in `hidden`, and do not take a slot. */
    keep?: (product: RawCatalogProduct) => boolean;
  },
): Promise<{ products: RawCatalogProduct[]; nextCursor: string | null; hidden: number }> {
  let position: PreviewPosition = decodePreviewCursor(options.cursor) ?? { group: 0, raw: null, skip: 0 };
  const products: RawCatalogProduct[] = [];
  const seen = new Set<string>();
  const keep = options.keep ?? (() => true);
  let hidden = 0;
  let rawPages = 0;

  while (products.length < options.pageSize && position.group < pager.groups.length) {
    if (rawPages >= MAX_RAW_PAGES_PER_PREVIEW) break;
    rawPages += 1;

    const page = await pager.fetchPage(pager.groups[position.group], position.raw);
    const fresh = page.products.slice(position.skip).filter((product) => !seen.has(product.externalId));
    const unused = fresh.filter(keep);
    const room = options.pageSize - products.length;

    if (unused.length > room) {
      // Only part of this raw page fits. Stay on it and remember how far in we got.
      const taken = unused.slice(0, room);
      for (const product of taken) seen.add(product.externalId);
      products.push(...taken);
      const consumedFromSlice = page.products.slice(position.skip).findIndex((product) => product === taken[room - 1]) + 1;
      const consumed = page.products.slice(position.skip, position.skip + consumedFromSlice);
      hidden += consumed.filter((product) => !keep(product) && !seen.has(product.externalId)).length;
      for (const product of consumed) seen.add(product.externalId);
      position = { group: position.group, raw: position.raw, skip: position.skip + consumedFromSlice };
      break;
    }

    hidden += fresh.length - unused.length;
    for (const product of fresh) seen.add(product.externalId);
    products.push(...unused);
    position = page.nextCursor
      ? { group: position.group, raw: page.nextCursor, skip: 0 }
      : { group: position.group + 1, raw: null, skip: 0 };
  }

  return {
    products,
    nextCursor: position.group >= pager.groups.length ? null : encodePreviewCursor(position),
    hidden,
  };
}
