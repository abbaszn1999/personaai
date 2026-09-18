import { describe, expect, it } from "vitest";
import {
  EMPTY_ACS_MAPPING,
  UNMAPPED,
  boundMetafieldKeys,
  columnKey,
  parseAcsMapping,
  parseColumnKey,
  resolveBinding,
  resolveRole,
  type AcsFieldMapping,
} from "./acs-mapping";
import { NOT_SENT } from "./acs-targets";

function mapping(parts: Partial<AcsFieldMapping>): AcsFieldMapping {
  return { ...EMPTY_ACS_MAPPING, ...parts };
}

describe("column keys", () => {
  it("round-trips every kind, since the dropdown's value and the stored ref must agree", () => {
    for (const ref of [
      { kind: "field", key: "sku" },
      { kind: "option", group: "colour" },
      { kind: "meta", key: "metafield.custom.size_guide" },
      UNMAPPED,
    ] as const) {
      expect(parseColumnKey(columnKey(ref))).toEqual(ref);
    }
  });

  it("reads an unparseable key as unmapped rather than throwing", () => {
    // These arrive from request bodies and stored jsonb, so a malformed one must not break a save.
    expect(parseColumnKey("nonsense")).toEqual(UNMAPPED);
    expect(parseColumnKey("field:")).toEqual(UNMAPPED);
  });
});

describe("resolveBinding", () => {
  it("uses auto-mapping's column when the merchant has bound nothing", () => {
    const { ref, explicit } = resolveBinding(EMPTY_ACS_MAPPING, "brand");

    expect(ref).toEqual({ kind: "field", key: "brand" });
    // False is what lets the table say which rows the merchant has actually touched.
    expect(explicit).toBe(false);
  });

  it("lets the merchant's own binding win, and says so", () => {
    const { ref, explicit } = resolveBinding(mapping({ sources: { brand: { kind: "field", key: "sku" } } }), "brand");

    expect(ref).toEqual({ kind: "field", key: "sku" });
    expect(explicit).toBe(true);
  });

  it("empties the row a claimed column used to default into", () => {
    // The exclusivity rule: one column feeds one ACS field. Binding the SKU column to Brand has to
    // leave the SKU row showing nothing, or the table claims one value reaches two fields.
    const { ref } = resolveBinding(mapping({ sources: { brand: { kind: "field", key: "sku" } } }), "sku");

    expect(ref).toEqual(UNMAPPED);
  });

  it("matches a native attribute row against the store's own option group names", () => {
    // A native row has no static default — its column is whichever group this catalog happens to
    // call the thing, which is why discovery has to be passed in.
    const { ref, explicit } = resolveBinding(EMPTY_ACS_MAPPING, "colors", ["Colour", "Size"]);

    expect(ref).toEqual({ kind: "option", group: "colour" });
    expect(explicit).toBe(false);
  });

  it("follows an optionRoles override when matching a native row", () => {
    const { ref } = resolveBinding(mapping({ optionRoles: { talla: "size" } }), "sizes", ["Talla"]);

    expect(ref).toEqual({ kind: "option", group: "talla" });
  });

  it("resolves to unmapped when the catalog has no group for the row", () => {
    expect(resolveBinding(EMPTY_ACS_MAPPING, "patterns", ["Colour"]).ref).toEqual(UNMAPPED);
  });
});

describe("resolveRole", () => {
  it("lets a binding beat a stored role, since it is the more specific statement", () => {
    // Choosing a group in the Materials row's dropdown is unambiguous; a role is a claim about what
    // the group means. Without this precedence the two controls could contradict each other.
    const document = mapping({
      sources: { materials: { kind: "option", group: "fabric" } },
      optionRoles: { fabric: "custom" },
    });

    expect(resolveRole(document, "fabric")).toBe("material");
  });

  it("treats a group claimed by a declared attribute as custom", () => {
    const document = mapping({
      customAttributes: [
        { key: "closure", name: "Closure", type: "text", source: { kind: "option", group: "closure type" } },
      ],
    });

    expect(resolveRole(document, "closure type")).toBe("custom");
  });

  it("falls back to the built-in name match", () => {
    expect(resolveRole(EMPTY_ACS_MAPPING, "colour")).toBe("color");
  });
});

describe("parseAcsMapping", () => {
  it("reads the current shape back", () => {
    const parsed = parseAcsMapping({
      sources: { brand: { kind: "field", key: "sku" } },
      customAttributes: [{ key: "fit", name: "Fit", type: "number", source: { kind: "meta", key: "meta.fit" } }],
      optionRoles: { talla: "size" },
    });

    expect(parsed.sources).toEqual({ brand: { kind: "field", key: "sku" } });
    expect(parsed.customAttributes).toEqual([
      { key: "fit", name: "Fit", type: "number", source: { kind: "meta", key: "meta.fit" } },
    ]);
    expect(parsed.optionRoles).toEqual({ talla: "size" });
  });

  it("drops a binding for an ACS field that does not exist rather than throwing", () => {
    // Stored jsonb is untrusted: a key left behind by an older shape must not break indexing.
    const parsed = parseAcsMapping({ sources: { vendor_name: { kind: "field", key: "brand" } } });

    expect(parsed.sources).toEqual({});
  });

  it("gives an empty mapping for a value that is not an object at all", () => {
    expect(parseAcsMapping(null)).toEqual(EMPTY_ACS_MAPPING);
  });

  it("inverts a legacy field-keyed document into bindings", () => {
    // Every connection saved before Stage 1 was inverted holds this shape, and the column is read on
    // every index write — so the conversion happens on parse rather than in a migration.
    const parsed = parseAcsMapping({ optionRoles: {}, fieldTargets: { sku: "brand" }, manualGroups: {} });

    expect(parsed.sources).toEqual({ brand: { kind: "field", key: "sku" } });
  });

  it("turns a legacy not-sent field into an explicitly emptied target", () => {
    // "My SKU goes nowhere" inverts into "the row SKU used to fill takes nothing", which is only
    // expressible because we know which target that was.
    const parsed = parseAcsMapping({ fieldTargets: { sku: NOT_SENT } });

    expect(parsed.sources).toEqual({ sku: UNMAPPED });
  });

  it("turns a legacy custom-routed field into a declared attribute", () => {
    const parsed = parseAcsMapping({ fieldTargets: { sku: "custom" } });

    expect(parsed.customAttributes).toEqual([
      { key: "sku", name: "sku", type: "text", source: { kind: "field", key: "sku" } },
    ]);
  });

  it("keeps a legacy manual group that had a named role as a role rather than claiming its column", () => {
    // Converting it would claim the column and silently empty the named field it was routing to.
    const parsed = parseAcsMapping({ optionRoles: { talla: "size" }, manualGroups: { talla: "Talla" } });

    expect(parsed.customAttributes).toEqual([]);
    expect(parsed.optionRoles).toEqual({ talla: "size" });
  });
});

describe("boundMetafieldKeys", () => {
  it("names only the Shopify metafields something is actually bound to", () => {
    // What keeps the indexing walk's cost proportional to what the merchant uses: an unbound
    // metafield is never fetched, and binding one is the single action that starts paying for it.
    const document = mapping({
      sources: { sizeChartData: { kind: "meta", key: "metafield.custom.size_guide" } },
      customAttributes: [
        { key: "fit", name: "Fit", type: "text", source: { kind: "meta", key: "metafield.custom.fit" } },
        // WooCommerce meta travels in the same product payload, so it needs no query of its own.
        { key: "care", name: "Care", type: "text", source: { kind: "meta", key: "meta.care" } },
      ],
    });

    expect(boundMetafieldKeys(document).sort()).toEqual(["custom.fit", "custom.size_guide"]);
  });

  it("names nothing for a store that has bound none", () => {
    expect(boundMetafieldKeys(EMPTY_ACS_MAPPING)).toEqual([]);
  });
});
