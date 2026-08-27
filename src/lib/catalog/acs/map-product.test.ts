import { describe, expect, it } from "vitest";
import type { RawCatalogProduct } from "@/lib/catalog/sync-types";
import { rawCatalogProductToAcsProduct } from "./map-product";
import { buildAcsProductId, parseAcsProductId } from "./isolation";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

function raw(overrides: Partial<RawCatalogProduct> = {}): RawCatalogProduct {
  return {
    externalId: "123",
    productGroupId: null,
    sku: "SKU-1",
    title: "Linen Shirt",
    description: "A relaxed warm-weather shirt.",
    brand: "Acme",
    rawCategories: ["Men > Shirts"],
    sourceCategoryIds: ["cat-1"],
    price: 59.99,
    currency: "USD",
    inStock: true,
    productUrl: "https://store.example.com/products/linen-shirt",
    imageUrl: "https://cdn.example.com/linen-shirt.jpg",
    images: [],
    variantOptions: {},
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("rawCatalogProductToAcsProduct", () => {
  it("maps a normal, fully-populated product", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men", "Shirts"]],
      garmentCategory: "tops",
      garmentSubcategory: "shirt",
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.id).toBe(`${CONNECTION_ID}_123`);
    expect(product.type).toBe("PRIMARY");
    expect(product.title).toBe("Linen Shirt");
    expect(product.categories).toEqual(["Men", "Men > Shirts"]);
    expect(product.description).toBe("A relaxed warm-weather shirt.");
    expect(product.brands).toEqual(["Acme"]);
    expect(product.priceInfo).toEqual({ price: 59.99, currencyCode: "USD" });
    expect(product.availability).toBe("IN_STOCK");
    expect(product.images).toEqual([{ uri: "https://cdn.example.com/linen-shirt.jpg" }]);
    expect(product.uri).toBe("https://store.example.com/products/linen-shirt");
    expect(product.attributes?.merchant_id).toEqual({
      text: [CONNECTION_ID],
      searchable: false,
      indexable: true,
    });
    expect(product.attributes?.garment_category).toEqual({
      text: ["tops"],
      searchable: false,
      indexable: true,
    });
    expect(product.attributes?.source_category_ids).toEqual({
      text: ["cat-1"],
      searchable: false,
      indexable: true,
    });
  });

  it("tags the merchant_id attribute using the connection id, not any product field", () => {
    const productA = rawCatalogProductToAcsProduct({
      raw: raw({ externalId: "same-id" }),
      connectionId: "11111111-1111-1111-1111-111111111111",
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });
    const productB = rawCatalogProductToAcsProduct({
      raw: raw({ externalId: "same-id" }),
      connectionId: "22222222-2222-2222-2222-222222222222",
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    // Same externalId, different connections — must not collide in the shared catalog.
    expect(productA.id).not.toBe(productB.id);
    expect(productA.attributes?.merchant_id.text?.[0]).toBe("11111111-1111-1111-1111-111111111111");
    expect(productB.attributes?.merchant_id.text?.[0]).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("round-trips the namespaced id back to connectionId + externalId", () => {
    const id = buildAcsProductId(CONNECTION_ID, "external-42");
    expect(parseAcsProductId(id)).toEqual({ connectionId: CONNECTION_ID, externalId: "external-42" });
  });

  it("maps a product missing every optional field", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({
        sku: null,
        description: null,
        brand: null,
        price: null,
        currency: null,
        productUrl: null,
        imageUrl: null,
        images: [],
        variantOptions: {},
      }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men", "Shirts"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.description).toBeUndefined();
    expect(product.brands).toBeUndefined();
    expect(product.priceInfo).toBeUndefined();
    expect(product.images).toBeUndefined();
    expect(product.uri).toBeUndefined();
    expect(product.colorInfo).toBeUndefined();
    expect(product.sizes).toBeUndefined();
    expect(product.materials).toBeUndefined();
    expect(product.patterns).toBeUndefined();
    expect(product.genders).toBeUndefined();
    expect(product.ageGroups).toBeUndefined();
    expect(product.attributes?.sku).toBeUndefined();
    // merchant_id must survive even on an otherwise-empty product — isolation is never optional.
    expect(product.attributes?.merchant_id).toBeDefined();
  });

  it("flattens every ancestor prefix of each category path, deduped, not just the leaf", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [
        ["Men", "Clothing", "Shirts"],
        ["Shoes & Bags"],
      ],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    // Every level stored as its own entry — ACS's `categories: ANY(...)` matches by exact string
    // equality, so a filter naming just "Men" would otherwise never match a leaf-only entry.
    expect(product.categories).toEqual(["Men", "Men > Clothing", "Men > Clothing > Shirts", "Shoes & Bags"]);
  });

  it("dedupes a shared root across multiple category paths", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [
        ["Men", "Shirts"],
        ["Men", "Jackets"],
      ],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.categories).toEqual(["Men", "Men > Shirts", "Men > Jackets"]);
  });

  it("carries every source category id as a text-list custom attribute", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1", "cat-2"],
    });

    expect(product.attributes?.source_category_ids).toEqual({
      text: ["cat-1", "cat-2"],
      searchable: false,
      indexable: true,
    });
  });

  it("omits the source_category_ids attribute when there are none", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: [],
    });

    expect(product.attributes?.source_category_ids).toBeUndefined();
  });

  it("extracts Color and Size option groups into colorInfo/sizes, case-insensitively", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({
        variantOptions: {
          Colour: [{ id: "c1", label: "Navy" }, { id: "c2", label: "Olive" }],
          size: [{ id: "s1", label: "M" }, { id: "s2", label: "L" }],
        },
      }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.colorInfo).toEqual({ colors: ["Navy", "Olive"] });
    expect(product.sizes).toEqual(["M", "L"]);
  });

  it("extracts Material/Pattern/Gender/Age group option groups into their predefined fields", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({
        variantOptions: {
          Fabric: [{ id: "m1", label: "Linen" }],
          Print: [{ id: "p1", label: "Striped" }],
          Sex: [{ id: "g1", label: "Male" }],
          "Age Group": [{ id: "a1", label: "Adult" }],
        },
      }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.materials).toEqual(["Linen"]);
    expect(product.patterns).toEqual(["Striped"]);
    expect(product.genders).toEqual(["Male"]);
    expect(product.ageGroups).toEqual(["Adult"]);
    // None of these have a dedicated custom-attribute equivalent — they went to real fields.
    expect(product.attributes?.opt_fabric).toBeUndefined();
    expect(product.attributes?.opt_print).toBeUndefined();
  });

  it("routes any other option group into a sanitized attributes.opt_<name> catch-all", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({
        variantOptions: {
          "Fit & Cut": [{ id: "f1", label: "Slim" }, { id: "f2", label: "Regular" }],
          Style: [{ id: "s1", label: "Casual" }],
        },
      }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    // "Fit & Cut" sanitizes to "fit_cut": non alphanumeric/underscore characters collapse to a
    // single underscore, since ACS attribute keys allow only alphanumerics and underscores.
    expect(product.attributes?.opt_fit_cut).toEqual({
      text: ["Slim", "Regular"],
      searchable: true,
      indexable: true,
    });
    expect(product.attributes?.opt_style).toEqual({
      text: ["Casual"],
      searchable: true,
      indexable: true,
    });
  });

  it("skips an option group whose name sanitizes to nothing", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({ sku: null, variantOptions: { "!!!": [{ id: "x", label: "Whatever" }] } }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: [],
    });

    // No attribute named after an empty sanitized key was added — merchant_id is the only one
    // guaranteed regardless of input.
    expect(Object.keys(product.attributes ?? {})).toEqual(["merchant_id"]);
  });

  it("sends the SKU as a non-searchable, indexable custom attribute", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({ sku: "ABC-123" }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.attributes?.sku).toEqual({ text: ["ABC-123"], searchable: false, indexable: true });
  });

  it("omits the sku attribute when the store has none", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({ sku: null }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.attributes?.sku).toBeUndefined();
  });

  it("falls back to imageUrl when the images array is empty", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({ images: [], imageUrl: "https://cdn.example.com/only-image.jpg" }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.images).toEqual([{ uri: "https://cdn.example.com/only-image.jpg" }]);
  });

  it("prefers the images array over imageUrl when both are present", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({
        images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
        imageUrl: "https://cdn.example.com/only-image.jpg",
      }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.images).toEqual([{ uri: "https://cdn.example.com/a.jpg" }, { uri: "https://cdn.example.com/b.jpg" }]);
  });

  it("maps out-of-stock availability", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({ inStock: false }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.availability).toBe("OUT_OF_STOCK");
  });

  it("passes productGroupId through as a custom attribute, still importing as PRIMARY", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw({ productGroupId: "group-9" }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(product.type).toBe("PRIMARY");
    expect(product.attributes?.product_group_id).toEqual({
      text: ["group-9"],
      searchable: false,
      indexable: true,
    });
  });
});
