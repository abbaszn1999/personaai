import type { AcsProduct } from "@/lib/catalog/acs/types";
import { buildPathConfig } from "@/lib/catalog/path-config/build";
import type { CatalogCandidate } from "@/lib/retrieval/types";

export const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

/** What a published size chart leaves on a product; the path config only counts sized products. */
export const SIZED_ATTRIBUTES: NonNullable<AcsProduct["attributes"]> = {
  fit_group: { text: ["tops"] },
  fit_chest_cm: { text: ["98", "99", "100"] },
};

export function acsProduct(
  id: string,
  path: string,
  price: number,
  extra: Partial<AcsProduct> = {}
): AcsProduct {
  return {
    id,
    type: "PRIMARY",
    title: id,
    categories: [`persona > ${path}`],
    priceInfo: { currencyCode: "USD", price },
    availability: "IN_STOCK",
    images: [{ uri: `https://example.com/${id}.jpg` }],
    ...extra,
    attributes: { ...SIZED_ATTRIBUTES, ...extra.attributes },
  };
}

export const PRODUCTS: AcsProduct[] = [
  acsProduct("w-trouser-1", "women > bottom > trouser", 40, {
    brands: ["Acme"],
    colorInfo: { colors: ["Black"] },
    materials: ["Cotton"],
    attributes: { inseam: { numbers: [30] } },
  }),
  acsProduct("w-trouser-2", "women > bottom > trouser", 90, {
    brands: ["Bolt"],
    colorInfo: { colors: ["Navy"] },
    attributes: { inseam: { numbers: [34] } },
  }),
  acsProduct("w-trouser-3", "women > bottom > trouser", 65, { brands: ["Acme"], colorInfo: { colors: ["Black"] } }),
  acsProduct("w-tee-1", "women > top > t-shirt", 25, { brands: ["Acme"], colorInfo: { colors: ["White"] } }),
  acsProduct("w-tee-2", "women > top > t-shirt", 45, { brands: ["Cora"], colorInfo: { colors: ["Pink"] } }),
  acsProduct("w-sneaker-1", "women > footwear > sneaker", 80, { brands: ["Dash"] }),
  acsProduct("u-trouser-1", "unisex > bottom > trouser", 60, { brands: ["Zed"], colorInfo: { colors: ["Olive"] } }),
  acsProduct("w-jeans-oos", "women > bottom > jeans", 70, { availability: "OUT_OF_STOCK", brands: ["Ghost"] }),
  acsProduct("w-trouser-1-v", "women > bottom > trouser", 40, { type: "VARIANT", brands: ["Variant"] }),
  acsProduct("w-trouser-noimg", "women > bottom > trouser", 10, { brands: ["Blank"], images: [] }),
];

export const CONFIG = buildPathConfig(PRODUCTS);

export function candidate(overrides: Partial<CatalogCandidate> & { externalId: string }): CatalogCandidate {
  return {
    productGroupId: null,
    title: overrides.externalId,
    brand: null,
    categoryPaths: [["persona", "women", "top", "t-shirt"]],
    garmentCategory: null,
    garmentSubcategory: null,
    price: 50,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: "https://example.com/a.jpg",
    enrichedDescription: null,
    ...overrides,
  };
}
