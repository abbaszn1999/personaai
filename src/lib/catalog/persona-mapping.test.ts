import { describe, expect, it } from "vitest";
import {
  buildPersonaMappingConfig,
  effectiveMappingFor,
  mappedSourceCategoryIds,
  personaPathLabel,
  resolvePersonaPaths,
  storeCategoryTrail,
} from "./persona-mapping";
import type { StoreCategory } from "@/modules/store/types";

const categories: StoreCategory[] = [
  { id: "tees", name: "Graphic Tees", productCount: 10 },
  { id: "sale", name: "Sale", productCount: 20 },
  { id: "ignored", name: "Furniture", productCount: 2 },
];

const scope = {
  configured: true,
  enabledDeptIds: ["women"],
  enabledLeafKeys: ["women:top:t-shirt", "women:bottom:jean"],
  customLeaves: [],
  customCategories: [],
};

describe("Persona category mapping", () => {
  it("resolves multiple source memberships to multiple Persona paths and deduplicates them", () => {
    const config = buildPersonaMappingConfig(scope, {
      tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
      sale: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
      ignored: { status: "excluded" },
    }, categories);

    expect(resolvePersonaPaths(["tees", "sale", "ignored"], config)).toEqual([
      expect.objectContaining({
        key: "women:top:t-shirt",
        segments: ["persona", "women", "top", "t-shirt"],
        sizingGroup: "tops",
        gender: "female",
        ageGroup: "adult",
      }),
    ]);
    expect(mappedSourceCategoryIds(config.mappings)).toEqual(["tees", "sale"]);
  });

  it("excludes unmapped, disabled and invalid paths", () => {
    const config = buildPersonaMappingConfig(scope, {
      tees: { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "jean" },
      ignored: { status: "mapped", departmentId: "men", categoryId: "top", subCategory: "t-shirt" },
      missing: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
    }, categories);

    expect(resolvePersonaPaths(["tees", "ignored", "missing"], config)).toEqual([
      expect.objectContaining({ key: "women:bottom:jean", sizingGroup: "bottoms" }),
    ]);
  });
});

describe("hierarchy-aware resolution", () => {
  const tree: StoreCategory[] = [
    { id: "women", name: "Women", productCount: 0, parentId: null },
    { id: "tops", name: "Tops", productCount: 0, parentId: "women" },
    { id: "polos", name: "Polos", productCount: 0, parentId: "tops" },
    { id: "bottoms", name: "Bottoms", productCount: 0, parentId: "women" },
    { id: "sale", name: "Sale", productCount: 0, parentId: null },
  ];
  const tops = { status: "mapped" as const, departmentId: "women" as const, categoryId: "top", subCategory: "t-shirt" };
  const jeans = { status: "mapped" as const, departmentId: "women" as const, categoryId: "bottom", subCategory: "jean" };

  it("lets an unmapped child take its parent's mapping", () => {
    const config = buildPersonaMappingConfig(scope, { tops }, tree);

    expect(resolvePersonaPaths(["polos"], config)).toEqual([expect.objectContaining({ key: "women:top:t-shirt" })]);
  });

  it("prefers a child's own mapping over its parent's", () => {
    const config = buildPersonaMappingConfig(scope, { tops, polos: jeans }, tree);

    expect(resolvePersonaPaths(["polos"], config)).toEqual([expect.objectContaining({ key: "women:bottom:jean" })]);
  });

  it("stops inheriting at an excluded child or ancestor", () => {
    const excludedChild = buildPersonaMappingConfig(scope, { tops, polos: { status: "excluded" } }, tree);
    expect(resolvePersonaPaths(["polos"], excludedChild)).toEqual([]);

    const excludedMiddle = buildPersonaMappingConfig(scope, { women: tops, tops: { status: "excluded" } }, tree);
    expect(resolvePersonaPaths(["polos"], excludedMiddle)).toEqual([]);
  });

  it("orders a product's paths with the most specific category first, whatever order it reports them in", () => {
    const config = buildPersonaMappingConfig(scope, { tops, bottoms: jeans, sale: tops }, tree);

    const forward = resolvePersonaPaths(["sale", "bottoms", "polos"], config).map((path) => path.key);
    const reverse = resolvePersonaPaths(["polos", "bottoms", "sale"], config).map((path) => path.key);

    expect(forward).toEqual(["women:top:t-shirt", "women:bottom:jean"]);
    expect(reverse).toEqual(forward);
  });

  it("breaks a depth tie by category id so the primary path never depends on platform order", () => {
    const config = buildPersonaMappingConfig(scope, { tops, bottoms: jeans }, tree);

    expect(resolvePersonaPaths(["tops", "bottoms"], config)[0]?.key).toBe("women:bottom:jean");
    expect(resolvePersonaPaths(["bottoms", "tops"], config)[0]?.key).toBe("women:bottom:jean");
  });

  it("names the ancestor an inherited mapping came from", () => {
    const config = buildPersonaMappingConfig(scope, { tops }, tree);

    expect(effectiveMappingFor("polos", config.mappings, config.hierarchy)).toMatchObject({ inheritedFrom: "tops" });
    expect(effectiveMappingFor("tops", config.mappings, config.hierarchy)).toMatchObject({ inheritedFrom: null });
    expect(effectiveMappingFor("sale", config.mappings, config.hierarchy)).toBeNull();
  });

  it("says which merchant category the primary path came from, and whose mapping it borrowed", () => {
    const config = buildPersonaMappingConfig(scope, { tops, bottoms: jeans }, tree);

    expect(resolvePersonaPaths(["polos"], config)[0]).toMatchObject({
      sourceCategoryId: "polos",
      inheritedFromCategoryId: "tops",
    });
    expect(resolvePersonaPaths(["bottoms"], config)[0]).toMatchObject({
      sourceCategoryId: "bottoms",
      inheritedFromCategoryId: null,
    });
  });
});

describe("storeCategoryTrail", () => {
  it("lists a merchant category's names from the root down", () => {
    const tree: StoreCategory[] = [
      { id: "women", name: "Women", productCount: 0, parentId: null },
      { id: "tops", name: "Tops", productCount: 0, parentId: "women" },
      { id: "polos", name: "Polos", productCount: 0, parentId: "tops" },
    ];
    expect(storeCategoryTrail("polos", tree)).toEqual(["Women", "Tops", "Polos"]);
    expect(storeCategoryTrail("missing", tree)).toEqual([]);
  });
});

describe("personaPathLabel", () => {
  it("reads a standard department, category and leaf as their display names, not their ids", () => {
    const config = buildPersonaMappingConfig(
      scope,
      { tees: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" } },
      categories,
    );
    const [path] = resolvePersonaPaths(["tees"], config);

    expect(personaPathLabel(path, config)).toBe("Women > Top > T-Shirts");
  });

  it("rejects a mapping that stops at the category with no leaf", () => {
    const config = buildPersonaMappingConfig(
      { ...scope, enabledLeafKeys: [] },
      { tees: { status: "mapped", departmentId: "women", categoryId: "top" } },
      categories,
    );
    expect(resolvePersonaPaths(["tees"], config)).toEqual([]);
    expect(config.mappings).toEqual({});
  });

  it("falls back to a merchant's own custom category and leaf names", () => {
    const customScope = {
      ...scope,
      customCategories: [{ id: "loungewear", deptId: "women", name: "Loungewear", sizingGroup: "tops" as const, isCustom: true as const }],
      customLeaves: [
        {
          id: "robe",
          deptId: "women",
          catId: "loungewear",
          subCategory: "robe",
          label: "Robes",
          isCustom: true as const,
        },
      ],
      enabledLeafKeys: ["women:loungewear:robe"],
    };
    const config = buildPersonaMappingConfig(
      customScope,
      { tees: { status: "mapped", departmentId: "women", categoryId: "loungewear", subCategory: "robe" } },
      categories,
    );
    const [path] = resolvePersonaPaths(["tees"], config);

    expect(personaPathLabel(path, config)).toBe("Women > Loungewear > Robes");
  });
});
