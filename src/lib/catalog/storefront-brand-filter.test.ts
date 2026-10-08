import { describe, expect, it } from "vitest";
import { EMPTY_ACS_MAPPING, type AcsFieldMapping } from "./acs-mapping";
import { brandFilterSource, storefrontBrandFilterUrl, type WooBrandTerm } from "./storefront-links";
import { pageOffersFilter, shopifyFilterParameter } from "./storefront-filter-probe";

const category = { handle: "women-top-s26" };

describe("brandFilterSource", () => {
  it("defaults to the platform's vendor", () => {
    expect(brandFilterSource(EMPTY_ACS_MAPPING)).toEqual({ kind: "vendor" });
  });

  it("follows an option group bound to brand, or reassigned to it by role", () => {
    const bound: AcsFieldMapping = { ...EMPTY_ACS_MAPPING, sources: { brand: { kind: "option", group: "label" } } };
    expect(brandFilterSource(bound)).toEqual({ kind: "option", group: "label" });
    const byRole: AcsFieldMapping = { ...EMPTY_ACS_MAPPING, optionRoles: { maker: "brand" } };
    expect(brandFilterSource(byRole)).toEqual({ kind: "option", group: "maker" });
  });

  it("reads a Shopify metafield binding, and gives up on anything a URL cannot filter", () => {
    const meta: AcsFieldMapping = { ...EMPTY_ACS_MAPPING, sources: { brand: { kind: "meta", key: "metafield.custom.brand" } } };
    expect(brandFilterSource(meta)).toEqual({ kind: "metafield", namespace: "custom", key: "brand" });
    const wooMeta: AcsFieldMapping = { ...EMPTY_ACS_MAPPING, sources: { brand: { kind: "meta", key: "meta.brand" } } };
    expect(brandFilterSource(wooMeta)).toEqual({ kind: "none" });
    const title: AcsFieldMapping = { ...EMPTY_ACS_MAPPING, sources: { brand: { kind: "field", key: "title" } } };
    expect(brandFilterSource(title)).toEqual({ kind: "none" });
  });

  it("treats a switched-off binding as the default", () => {
    const off: AcsFieldMapping = { ...EMPTY_ACS_MAPPING, sources: { brand: { kind: "unmapped" } } };
    expect(brandFilterSource(off)).toEqual({ kind: "vendor" });
  });
});

describe("storefrontBrandFilterUrl on Shopify", () => {
  const input = { platform: "shopify" as const, storeUrl: "moustache.example.com/", category };

  it("filters a collection to the vendor, encoding the store's own spelling", () => {
    const link = storefrontBrandFilterUrl({ ...input, source: { kind: "vendor" }, labels: ["MOUSTACHE Men"] });
    expect(link.url).toBe("https://moustache.example.com/collections/women-top-s26?filter.p.vendor=MOUSTACHE%20Men");
    expect(link.filtered).toBe(true);
    expect(link.vendorPageUrl).toBe("https://moustache.example.com/collections/vendors?q=MOUSTACHE%20Men");
  });

  it("repeats the parameter for every spelling, so a comma in a name cannot split it", () => {
    const link = storefrontBrandFilterUrl({ ...input, source: { kind: "vendor" }, labels: ["Tom Tailor", "Tom Tailor, Denim", "Tom Tailor"] });
    expect(link.url).toBe(
      "https://moustache.example.com/collections/women-top-s26?filter.p.vendor=Tom%20Tailor&filter.p.vendor=Tom%20Tailor%2C%20Denim",
    );
  });

  it("uses the option and metafield parameters for those sources, without a vendor page", () => {
    const option = storefrontBrandFilterUrl({ ...input, source: { kind: "option", group: "label" }, labels: ["A&B"] });
    expect(option.url).toContain("?filter.v.option.label=A%26B");
    expect(option.vendorPageUrl).toBeNull();
    const metafield = storefrontBrandFilterUrl({ ...input, source: { kind: "metafield", namespace: "custom", key: "brand" }, labels: ["X"] });
    expect(metafield.url).toContain("?filter.p.m.custom.brand=X");
  });

  it("falls back to the plain collection when there is nothing to filter by", () => {
    const none = storefrontBrandFilterUrl({ ...input, source: { kind: "none" }, labels: ["X"] });
    expect(none).toEqual({ url: "https://moustache.example.com/collections/women-top-s26", filtered: false, vendorPageUrl: null });
    expect(storefrontBrandFilterUrl({ ...input, source: { kind: "vendor" }, labels: [] }).filtered).toBe(false);
    expect(storefrontBrandFilterUrl({ ...input, category: { handle: "" }, source: { kind: "vendor" }, labels: ["X"] }).url).toBeNull();
  });
});

describe("storefrontBrandFilterUrl on WooCommerce", () => {
  const input = { platform: "woocommerce" as const, storeUrl: "https://shop.example.com", category: { handle: "tops" } };
  const wooBrands: WooBrandTerm[] = [
    { id: 12, name: "Hermès", slug: "hermes" },
    { id: 13, name: "Tom Tailor", slug: "tom-tailor" },
  ];

  it("adds the Brands taxonomy slug and id beside the category", () => {
    const link = storefrontBrandFilterUrl({ ...input, source: { kind: "vendor" }, labels: ["Hermes"], wooBrands });
    expect(link.url).toBe("https://shop.example.com/?product_cat=tops&product_brand=hermes&filtering=1&filter_product_brand=12");
    expect(link.filtered).toBe(true);
  });

  it("combines several spellings and ignores brands the store has no term for", () => {
    const link = storefrontBrandFilterUrl({ ...input, source: { kind: "vendor" }, labels: ["Hermès", "TOM TAILOR"], wooBrands });
    expect(link.url).toContain("product_brand=hermes%2Ctom-tailor");
    expect(link.url).toContain("filter_product_brand=12%2C13");
    const unknown = storefrontBrandFilterUrl({ ...input, source: { kind: "vendor" }, labels: ["Nobody"], wooBrands });
    expect(unknown).toEqual({ url: "https://shop.example.com/?product_cat=tops", filtered: false, vendorPageUrl: null });
  });

  it("filters a global attribute through the layered-nav parameter", () => {
    const link = storefrontBrandFilterUrl({ ...input, source: { kind: "option", group: "brand" }, labels: ["Tom Tailor"] });
    expect(link.url).toBe("https://shop.example.com/?product_cat=tops&filtering=1&filter_brand=tom-tailor");
  });

  it("does not claim to filter by a custom field", () => {
    const link = storefrontBrandFilterUrl({ ...input, source: { kind: "none" }, labels: ["X"], wooBrands });
    expect(link.filtered).toBe(false);
  });
});

describe("filter probe parsing", () => {
  it("maps each brand source to its Shopify parameter", () => {
    expect(shopifyFilterParameter({ kind: "vendor" })).toBe("filter.p.vendor");
    expect(shopifyFilterParameter({ kind: "option", group: "label" })).toBe("filter.v.option.label");
    expect(shopifyFilterParameter({ kind: "metafield", namespace: "custom", key: "brand" })).toBe("filter.p.m.custom.brand");
    expect(shopifyFilterParameter({ kind: "none" })).toBeNull();
  });

  it("recognises a theme that renders the filter, as a control or as a link", () => {
    expect(pageOffersFilter('<input type="checkbox" name="filter.p.vendor" value="A">', "filter.p.vendor")).toBe(true);
    expect(pageOffersFilter('<a href="/collections/x?filter.p.vendor=A&amp;sort_by=price">', "filter.p.vendor")).toBe(true);
    expect(pageOffersFilter('<a href="/collections/x?q=1&amp;filter.p.vendor=A">', "filter.p.vendor")).toBe(true);
  });

  it("does not mistake a page without the filter, or a longer parameter, for support", () => {
    expect(pageOffersFilter("<html>no filters</html>", "filter.p.vendor")).toBe(false);
    expect(pageOffersFilter('<input name="filter.p.vendor_extra">', "filter.p.vendor")).toBe(false);
    expect(pageOffersFilter('<input name="filter.p.product_type">', "filter.p.vendor")).toBe(false);
  });
});
