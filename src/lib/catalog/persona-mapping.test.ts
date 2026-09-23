import { describe, expect, it } from "vitest";
import {
  buildPersonaMappingConfig,
  mappedSourceCategoryIds,
  personaPathLabel,
  resolvePersonaPaths,
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
