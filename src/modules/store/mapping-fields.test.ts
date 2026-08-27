import { describe, expect, it } from "vitest";
import { buildFieldRows } from "./mapping-fields";
import type { MappingPreviewSample } from "./types";

function row(sample: MappingPreviewSample, label: string) {
  const found = buildFieldRows(sample).find((r) => r.label === label);
  if (!found) throw new Error(`no row for "${label}"`);
  return found;
}

const FULLY_POPULATED: MappingPreviewSample = {
  raw: {
    externalId: "123",
    productGroupId: "group-1",
    sku: "SKU-1",
    title: "Linen Shirt",
    description: "A breezy linen shirt",
    brand: "Acme",
    rawCategories: ["Shirts"],
    sourceCategoryIds: ["cat-1", "cat-2"],
    price: 42,
    currency: "USD",
    inStock: true,
    productUrl: "https://store.example/products/linen-shirt",
    imageUrl: "https://store.example/img.jpg",
    images: ["https://store.example/img.jpg", "https://store.example/img2.jpg"],
    variantOptions: {
      Color: [{ id: "1", label: "Blue" }, { id: "2", label: "Green" }],
      Size: [{ id: "3", label: "M" }],
      Fabric: [{ id: "4", label: "Linen" }],
      Fit: [{ id: "5", label: "Slim" }],
    },
    updatedAt: null,
  },
  mapped: {
    id: "11111111-1111-1111-1111-111111111111_123",
    type: "PRIMARY",
    title: "Linen Shirt",
    categories: ["Men", "Men > Shirts"],
    description: "A breezy linen shirt",
    brands: ["Acme"],
    priceInfo: { price: 42, currencyCode: "USD" },
    availability: "IN_STOCK",
    images: [{ uri: "https://store.example/img.jpg" }, { uri: "https://store.example/img2.jpg" }],
    uri: "https://store.example/products/linen-shirt",
    colorInfo: { colors: ["Blue", "Green"] },
    sizes: ["M"],
    materials: ["Linen"],
    attributes: {
      merchant_id: { text: ["11111111-1111-1111-1111-111111111111"] },
      source_category_ids: { text: ["cat-1", "cat-2"] },
      garment_category: { text: ["top"] },
      garment_subcategory: { text: ["shirt"] },
      product_group_id: { text: ["group-1"] },
      sku: { text: ["SKU-1"] },
      opt_fit: { text: ["Slim"] },
    },
  },
};

const SPARSE: MappingPreviewSample = {
  raw: {
    externalId: "456",
    productGroupId: null,
    sku: null,
    title: "Mystery Box",
    description: null,
    brand: null,
    rawCategories: [],
    sourceCategoryIds: [],
    price: null,
    currency: null,
    inStock: false,
    productUrl: null,
    imageUrl: null,
    images: [],
    variantOptions: {},
    updatedAt: null,
  },
  mapped: {
    id: "11111111-1111-1111-1111-111111111111_456",
    type: "PRIMARY",
    title: "Mystery Box",
    categories: ["Men"],
    availability: "OUT_OF_STOCK",
    attributes: {
      merchant_id: { text: ["11111111-1111-1111-1111-111111111111"] },
    },
  },
};

describe("buildFieldRows", () => {
  it("maps every field for a fully-populated sample", () => {
    const rows = buildFieldRows(FULLY_POPULATED);

    expect(row(FULLY_POPULATED, "Title")).toMatchObject({ storeValue: "Linen Shirt", acsValue: "Linen Shirt" });
    expect(row(FULLY_POPULATED, "Brand")).toMatchObject({ storeValue: "Acme", acsValue: "Acme" });
    expect(row(FULLY_POPULATED, "Price")).toMatchObject({ storeValue: "42 USD", acsValue: "42 USD" });
    expect(row(FULLY_POPULATED, "Stock")).toMatchObject({ storeValue: "true", acsValue: "IN_STOCK" });
    expect(row(FULLY_POPULATED, "Categories")).toMatchObject({
      storeValue: "Shirts",
      acsValue: "Men, Men > Shirts",
    });
    expect(row(FULLY_POPULATED, "Color")).toMatchObject({ storeValue: "Blue, Green", acsValue: "Blue, Green" });
    expect(row(FULLY_POPULATED, "Size")).toMatchObject({ storeValue: "M", acsValue: "M" });
    expect(row(FULLY_POPULATED, "Material")).toMatchObject({ storeValue: "Linen", acsValue: "Linen" });
    expect(row(FULLY_POPULATED, "SKU")).toMatchObject({ storeValue: "SKU-1", acsValue: "SKU-1" });
    expect(row(FULLY_POPULATED, "Product ID")).toMatchObject({
      storeValue: "123",
      acsValue: "11111111-1111-1111-1111-111111111111_123",
    });

    // "Fit" has no dedicated field (unlike Material/Color/...), so it falls into the dynamic
    // opt_<name> catch-all rather than being dropped.
    expect(row(FULLY_POPULATED, "Fit")).toMatchObject({
      storePath: 'variantOptions["Fit"]',
      storeValue: "Slim",
      acsPath: "attributes.opt_fit",
      acsValue: "Slim",
      internal: false,
      notSent: false,
    });

    // Every field defined shows up as exactly one row, in a stable order regardless of sample,
    // followed by one dynamic row per leftover variant-option group this sample actually has.
    expect(rows.map((r) => r.label)).toEqual([
      "Title",
      "Description",
      "Brand",
      "Price",
      "Stock",
      "Categories",
      "Category membership",
      "Images",
      "Product URL",
      "Color",
      "Size",
      "Material",
      "Pattern",
      "Gender",
      "Age group",
      "Variant group",
      "Garment type",
      "Product ID",
      "Merchant",
      "SKU",
      "Fit",
    ]);
  });

  it("marks internal-only attributes without implying they are store fields", () => {
    const merchant = row(FULLY_POPULATED, "Merchant");
    expect(merchant.internal).toBe(true);
    expect(merchant.storePath).toBeNull();
    expect(merchant.acsValue).toBe("11111111-1111-1111-1111-111111111111");

    const membership = row(FULLY_POPULATED, "Category membership");
    expect(membership.internal).toBe(true);
    expect(membership.storePath).toBe("sourceCategoryIds");

    const garmentType = row(FULLY_POPULATED, "Garment type");
    expect(garmentType.internal).toBe(true);
    expect(garmentType.acsValue).toBe("top, shirt");
  });

  it("renders \u2014 for missing optional fields rather than omitting the row", () => {
    const rows = buildFieldRows(SPARSE);
    expect(rows).toHaveLength(20);

    expect(row(SPARSE, "Description")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "Brand")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "Price")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "Images")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "Color")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "Material")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "SKU")).toMatchObject({ storeValue: "—", acsValue: "—" });
    expect(row(SPARSE, "Variant group")).toMatchObject({ storeValue: "—", acsValue: "—" });
    // No leftover variant-option groups at all on this sample, so no dynamic rows are added.
    expect(rows.some((r) => r.label === "Fit")).toBe(false);
  });

  it("does not add a dynamic row for an option group with no non-empty labels", () => {
    const emptyOption: MappingPreviewSample = {
      raw: { ...SPARSE.raw, variantOptions: { Fit: [] } },
      mapped: SPARSE.mapped,
    };
    expect(buildFieldRows(emptyOption).some((r) => r.label === "Fit")).toBe(false);
  });

  it("does not throw on malformed raw/mapped payloads", () => {
    const malformed = { raw: null, mapped: undefined } as unknown as MappingPreviewSample;
    expect(() => buildFieldRows(malformed)).not.toThrow();

    const rows = buildFieldRows(malformed);
    expect(rows).toHaveLength(20);
    // "Merchant"/"Garment type" have no store field at all, so their storeValue is a fixed
    // explanation rather than "—" — every other row has nothing to draw from and falls back to it.
    for (const r of rows) {
      if (r.storePath === null) continue;
      expect(r.storeValue).toBe("—");
    }
  });
});
