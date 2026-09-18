import { describe, expect, it } from "vitest";
import {
  CMS_COLUMN_GROUPS,
  aggregationNote,
  classifyDiscoveredColumn,
  cmsColumnGroupLabel,
  cmsColumnGroupOrder,
  nativeVariantFieldColumns,
  sourceFieldGroup,
  sourceFieldColumn,
  variantFieldDef,
} from "./cms-columns";
import { SOURCE_FIELDS } from "./source-fields";

describe("cmsColumnGroupOrder / cmsColumnGroupLabel", () => {
  it("orders every declared group ahead of an unknown one", () => {
    const orders = CMS_COLUMN_GROUPS.map((group) => cmsColumnGroupOrder(group.id));
    // Strictly increasing, matching the declared array order — this is the sequence Stage 1's
    // dropdown and `mapping-options`'s discovery both sort by.
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(cmsColumnGroupOrder("identifiers")).toBeLessThan(cmsColumnGroupOrder("advanced"));
  });

  it("falls back to the raw id for a label lookup on an unknown group", () => {
    expect(cmsColumnGroupLabel("identifiers")).toBe("Product Identifiers & Core");
  });
});

describe("nativeVariantFieldColumns", () => {
  const columns = nativeVariantFieldColumns();

  it("declares every native per-variant field at variant scope", () => {
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((column) => column.scope === "variant")).toBe(true);
    expect(columns.every((column) => column.ref.kind === "variantField")).toBe(true);
  });

  it("states each field's own aggregation in its description, never leaving it implicit", () => {
    const price = columns.find((column) => column.ref.kind === "variantField" && column.ref.key === "price");
    expect(price?.aggregation).toBe("min");
    expect(price?.description).toContain(aggregationNote("min"));
  });

  it("keeps this list in step with the keys map-product.ts's readColumn switches on", () => {
    for (const column of columns) {
      if (column.ref.kind !== "variantField") continue;
      expect(variantFieldDef(column.ref.key)).toBeDefined();
    }
  });
});

describe("sourceFieldColumn", () => {
  it("assigns every non-internal SOURCE_FIELDS entry a group and a product scope", () => {
    for (const field of SOURCE_FIELDS) {
      if (field.internal) continue;
      const column = sourceFieldColumn(field);
      expect(column.scope).toBe("product");
      expect(column.group).toBe(sourceFieldGroup(field.key));
      expect(column.ref).toEqual({ kind: "field", key: field.key });
    }
  });
});

describe("classifyDiscoveredColumn", () => {
  it("puts a variant option group under variant_options at variant scope", () => {
    expect(classifyDiscoveredColumn({ kind: "option", group: "color" })).toEqual({
      group: "variant_options",
      scope: "variant",
      valueType: "list",
    });
  });

  it("puts a product meta key under product_custom at product scope", () => {
    expect(classifyDiscoveredColumn({ kind: "meta", key: "metafield.custom.fit" })).toEqual({
      group: "product_custom",
      scope: "product",
      valueType: "text",
    });
  });

  it("puts a per-variant meta key under variant_custom at variant scope", () => {
    expect(classifyDiscoveredColumn({ kind: "variantMeta", key: "meta.fit_note" })).toEqual({
      group: "variant_custom",
      scope: "variant",
      valueType: "text",
    });
  });
});
