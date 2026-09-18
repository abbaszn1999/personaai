import { describe, expect, it } from "vitest";
import type { RawCatalogProduct, RawCatalogVariant } from "@/lib/catalog/sync-types";
import { buildVariantAcsProducts, rawCatalogProductToAcsProduct, rawCatalogProductToAcsProducts } from "./map-product";
import type { AcsFieldMapping, CmsColumnRef, CustomAttributeDef } from "@/lib/catalog/acs-mapping";
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
    customFields: {},
    updatedAt: "2026-08-01T00:00:00.000Z",
    variants: [],
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
    expect(product.attributes?.source_category_ids).toBeUndefined();
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

  it("never publishes merchant source category ids", () => {
    const product = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1", "cat-2"],
    });

    expect(product.attributes?.source_category_ids).toBeUndefined();
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


describe("merchant column binding", () => {
  /** A mapping with only the bindings a test cares about, since every absent key means "keep the
   *  default" � which is the property most of these tests are about. */
  function mapping(parts: Partial<AcsFieldMapping>): AcsFieldMapping {
    return { sources: {}, customAttributes: [], optionRoles: {}, ...parts };
  }

  function field(key: string): CmsColumnRef {
    return { kind: "field", key };
  }

  function map(parts: Partial<AcsFieldMapping>, overrides: Partial<RawCatalogProduct> = {}) {
    return rawCatalogProductToAcsProduct({
      raw: raw(overrides),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
      fieldMapping: mapping(parts),
    });
  }

  it("produces exactly the default mapping when the merchant has changed nothing", () => {
    // The property the whole binding path rests on: a store that never opens the dropdown must get
    // byte-identical output to the one the mapper produced before Stage 1 existed.
    const withEmpty = map({});
    const withoutMapping = rawCatalogProductToAcsProduct({
      raw: raw(),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(withEmpty).toEqual(withoutMapping);
  });

  it("fills an ACS field from the column the merchant bound to it", () => {
    const product = map({ sources: { brand: field("sku") } });

    // Ahead of the platform's own brand field, which is exactly the point: binding SKU to Brand is a
    // deliberate statement, usually made precisely because `brand` is wrong.
    expect(product.brands?.[0]).toBe("SKU-1");
  });

  it("stops a bound column from also feeding the field it used to default into", () => {
    // The exclusivity rule the inverted table rests on. Without it the SKU column would show up in
    // two rows at once, and a merchant would have no way to say "move it" rather than "copy it".
    const product = map({ sources: { brand: field("sku") } });

    expect(product.attributes?.sku).toBeUndefined();
  });

  it("empties a field the merchant explicitly switched off", () => {
    const product = map({ sources: { description: { kind: "unmapped" } } });

    expect(product.description).toBeUndefined();
  });

  it("keeps the store's own title even when the title row is switched off", () => {
    // ACS rejects a product with no title, so this row has a floor. Losing a binding is recoverable;
    // a whole catalog failing import on a required field is not.
    const product = map({ sources: { title: { kind: "unmapped" } } });

    expect(product.title).toBe("Linen Shirt");
  });

  it("lets an option group beat a scalar column bound to the same native row", () => {
    const product = map(
      { sources: { brand: field("sku") }, optionRoles: { label: "brand" } },
      { variantOptions: { Label: [{ id: "b1", label: "Acme Studio" }] } }
    );

    expect(product.brands).toEqual(["Acme Studio"]);
  });

  it("reads a price out of a text column for a store that keeps it somewhere else", () => {
    // Currency symbols and thousands separators are what real storefront fields actually carry, and
    // a European store writes for 1299.50 what a US one writes as "1,299.50".
    const european = map({ sources: { price: field("sku") } }, { price: null, currency: "EUR", sku: "�1.299,50" });
    const american = map({ sources: { price: field("sku") } }, { price: null, currency: "USD", sku: "$1,299.50" });

    expect(european.priceInfo).toEqual({ price: 1299.5, currencyCode: "EUR" });
    expect(american.priceInfo).toEqual({ price: 1299.5, currencyCode: "USD" });
  });

  it("renders a price bound to a text field rather than dropping it", () => {
    // Every column is offered on every row, so an odd combination has to produce something sensible
    // instead of silently vanishing.
    const product = map({ sources: { description: field("price") } });

    expect(product.description).toBe("59.99 USD");
  });

  it("reads stock out of a word, and falls back when the word means nothing", () => {
    const inStock = map({ sources: { availability: field("sku") } }, { inStock: false, sku: "In Stock" });
    const unreadable = map({ sources: { availability: field("sku") } }, { inStock: false, sku: "maybe" });

    expect(inStock.availability).toBe("IN_STOCK");
    // Guessing here would hide real stock, so an unrecognized word falls back rather than assuming.
    expect(unreadable.availability).toBe("OUT_OF_STOCK");
  });

  it("carries a bound size chart column into the payload", () => {
    const product = map(
      { sources: { sizeChartData: { kind: "meta", key: "metafield.custom.size_guide" } } },
      { customFields: { "metafield.custom.size_guide": "S=90cm; M=96cm" } }
    );

    expect(product.attributes?.size_chart_data?.text).toEqual(["S=90cm; M=96cm"]);
  });
});

describe("declared custom attributes", () => {
  function map(customAttributes: CustomAttributeDef[], overrides: Partial<RawCatalogProduct> = {}) {
    return rawCatalogProductToAcsProduct({
      raw: raw(overrides),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
      fieldMapping: { sources: {}, customAttributes, optionRoles: {} },
    });
  }

  it("writes a declared attribute under its own key rather than an opt_ one", () => {
    const product = map([
      { key: "fit_note", name: "Fit Note", type: "text", source: { kind: "meta", key: "meta.fit_note" } },
    ], { customFields: { "meta.fit_note": "Runs small" } });

    expect(product.attributes?.fit_note?.text).toEqual(["Runs small"]);
    expect(product.attributes?.opt_fit_note).toBeUndefined();
  });

  it("sends a number-typed attribute as numbers, so a range filter is possible at all", () => {
    // A heel height stored as text sorts "10" before "7.5", which is the whole reason the type is
    // collected rather than assumed.
    const product = map([
      { key: "heel_height", name: "Heel Height", type: "number", source: { kind: "meta", key: "meta.heel" } },
    ], { customFields: { "meta.heel": "7.5 cm" } });

    expect(product.attributes?.heel_height?.numbers).toEqual([7.5]);
    expect(product.attributes?.heel_height?.text).toBeUndefined();
  });

  it("drops a number-typed value that will not convert instead of sending it as text", () => {
    // A numeric facet containing "one size" is worse than one missing a product.
    const product = map([
      { key: "heel_height", name: "Heel Height", type: "number", source: { kind: "meta", key: "meta.heel" } },
    ], { customFields: { "meta.heel": "one size" } });

    expect(product.attributes?.heel_height).toBeUndefined();
  });

  it("claims the option group it is bound to, so the group is not also written as opt_", () => {
    const product = map([
      { key: "closure", name: "Closure", type: "text", source: { kind: "option", group: "closure type" } },
    ], { variantOptions: { "Closure Type": [{ id: "c1", label: "Zip" }] } });

    expect(product.attributes?.closure?.text).toEqual(["Zip"]);
    expect(product.attributes?.opt_closure_type).toBeUndefined();
  });

  // ACS caps a `CustomAttribute.text` value at 256 characters ? a free-text metafield (a long
  // care-instructions blob, someone pasting a whole paragraph into "Fit Note") can exceed that
  // easily, where every other bound field in this file stays well under it.
  it("clamps an over-long text value instead of sending something ACS would reject outright", () => {
    const long = "x".repeat(500);
    const product = map([
      { key: "care_notes", name: "Care Notes", type: "text", source: { kind: "meta", key: "meta.care" } },
    ], { customFields: { "meta.care": long } });

    expect(product.attributes?.care_notes?.text?.[0]).toHaveLength(256);
    expect(product.attributes?.care_notes?.text?.[0]).toBe(long.slice(0, 256));
  });

  // ACS caps a `CustomAttribute.text` array at 400 strings. A `variantMeta` binding's distinct-list
  // aggregation (see `aggregateVariantMeta`) can exceed that on a product with hundreds of real
  // SKUs, each carrying its own value for the bound per-variant custom field.
  it("clamps an over-long list of distinct variant values to ACS's 400-string ceiling", () => {
    const variants = Array.from({ length: 450 }, (_, i) => ({
      externalId: `v${i}`,
      sku: `SKU-${i}`,
      barcode: null,
      title: null,
      price: 10,
      compareAtPrice: null,
      currency: "USD",
      inStock: true,
      inventoryQuantity: null,
      imageUrl: null,
      selectedOptions: {},
      weight: null,
      weightUnit: null,
      productUrl: null,
      customFields: { "meta.fit_tag": `tag-${i}` },
    }));

    const product = map([
      { key: "fit_tags", name: "Fit Tags", type: "text", source: { kind: "variantMeta", key: "meta.fit_tag" } },
    ], { variants });

    expect(product.attributes?.fit_tags?.text).toHaveLength(400);
  });
});

function variant(overrides: Partial<RawCatalogVariant> = {}): RawCatalogVariant {
  return {
    externalId: "v1",
    sku: "SKU-1-BERRY-M",
    barcode: null,
    title: "Berry / M",
    price: 59.99,
    compareAtPrice: null,
    currency: "USD",
    inStock: true,
    inventoryQuantity: 4,
    imageUrl: "https://cdn.example.com/berry-m.jpg",
    selectedOptions: { Color: "Berry", Size: "M" },
    weight: null,
    weightUnit: null,
    productUrl: null,
    customFields: {},
    ...overrides,
  };
}

describe("buildVariantAcsProducts", () => {
  function build(variants: RawCatalogVariant[], overrides: Partial<RawCatalogProduct> = {}) {
    const input = {
      raw: raw({ variants, ...overrides }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men", "Shirts"]],
      garmentCategory: "tops",
      garmentSubcategory: "shirt",
      sourceCategoryIds: ["cat-1"],
    };
    const primary = rawCatalogProductToAcsProduct(input);
    return { primary, variants: buildVariantAcsProducts(input, primary) };
  }

  it("emits nothing for a product with zero or one variant, since the PRIMARY already states everything", () => {
    expect(build([]).variants).toEqual([]);
    expect(build([variant()]).variants).toEqual([]);
  });

  it("emits one tenant-scoped VARIANT record per real SKU, linked back to its PRIMARY", () => {
    const { primary, variants } = build([
      variant({ externalId: "v1", selectedOptions: { Color: "Berry", Size: "M" } }),
      variant({ externalId: "v2", price: 64.99, inStock: false, selectedOptions: { Color: "Pine Green", Size: "L" } }),
    ]);

    expect(variants).toHaveLength(2);
    expect(variants[0].type).toBe("VARIANT");
    expect(variants[0].id).toBe(buildAcsProductId(CONNECTION_ID, "123::v1"));
    expect(variants[0].primaryProductId).toBe(primary.id);
    expect(variants[0].attributes?.merchant_id).toEqual({
      text: [CONNECTION_ID],
      searchable: false,
      indexable: true,
    });
    // What lets a webhook delete/category-deselection find every child of a PRIMARY by a plain
    // attribute filter (`getAcsVariantIds`) without reconstructing each variant's own external id.
    expect(variants[0].attributes?.primary_external_id).toEqual({
      text: ["123"],
      searchable: false,
      indexable: true,
    });
    expect(variants[1].priceInfo).toEqual({ price: 64.99, currencyCode: "USD" });
    expect(variants[1].availability).toBe("OUT_OF_STOCK");
  });

  it("inherits the PRIMARY's category, description, and brand rather than re-resolving them", () => {
    const { primary, variants } = build([variant({ externalId: "v1" }), variant({ externalId: "v2" })]);

    expect(variants[0].categories).toEqual(primary.categories);
    expect(variants[0].description).toBe(primary.description);
    expect(variants[0].brands).toEqual(primary.brands);
  });

  it("falls back to the PRIMARY's price/image/uri when a variant does not carry its own", () => {
    const { primary, variants } = build([
      variant({ externalId: "v1", price: null, currency: null, imageUrl: null }),
      variant({ externalId: "v2" }),
    ]);

    expect(variants[0].priceInfo).toEqual(primary.priceInfo);
    expect(variants[0].images).toEqual(primary.images);
  });

  it("buckets a variant's own selected options into colorInfo/sizes rather than the parent's aggregate", () => {
    const { variants } = build([
      variant({ externalId: "v1", selectedOptions: { Color: "Berry", Size: "M" } }),
      variant({ externalId: "v2", selectedOptions: { Color: "Pine Green", Size: "L" } }),
    ]);

    expect(variants[0].colorInfo).toEqual({ colors: ["Berry"] });
    expect(variants[0].sizes).toEqual(["M"]);
    expect(variants[1].colorInfo).toEqual({ colors: ["Pine Green"] });
    expect(variants[1].sizes).toEqual(["L"]);
  });

  it("writes gtin from a variant's own barcode", () => {
    const { variants } = build([
      variant({ externalId: "v1", barcode: "012345678905" }),
      variant({ externalId: "v2" }),
    ]);

    expect(variants[0].gtin).toBe("012345678905");
  });
});

describe("rawCatalogProductToAcsProducts", () => {
  it("returns the PRIMARY followed by its VARIANT children in one array, ready for one importProducts call", () => {
    const products = rawCatalogProductToAcsProducts({
      raw: raw({ variants: [variant({ externalId: "v1" }), variant({ externalId: "v2" })] }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(products).toHaveLength(3);
    expect(products[0].type).toBe("PRIMARY");
    expect(products[1].type).toBe("VARIANT");
    expect(products[2].type).toBe("VARIANT");
  });

  it("returns just the PRIMARY for a product with no real variant fan-out", () => {
    const products = rawCatalogProductToAcsProducts({
      raw: raw({ variants: [] }),
      connectionId: CONNECTION_ID,
      categoryPaths: [["Men"]],
      garmentCategory: null,
      garmentSubcategory: null,
      sourceCategoryIds: ["cat-1"],
    });

    expect(products).toHaveLength(1);
    expect(products[0].type).toBe("PRIMARY");
  });
});
