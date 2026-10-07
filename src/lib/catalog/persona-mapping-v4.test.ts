import { describe, expect, it } from "vitest";
import {
  buildPersonaMappingConfig,
  parsePersonaCategoryMap,
  parsePersonaScope,
  resolvePersonaPaths,
} from "./persona-mapping";
import type { StoreCategory } from "@/modules/store/types";

const categories: StoreCategory[] = [
  { id: "blouses", name: "Blouses", productCount: 4 },
  { id: "jeans", name: "Jeans", productCount: 9 },
  { id: "shorts", name: "Shorts", productCount: 6 },
];

describe("a mapping saved under taxonomy v3 is read in v4", () => {
  it("converts a removed leaf to the leaf it folded into, in the scope and in the mapping", () => {
    const scope = parsePersonaScope({
      configured: true,
      enabledDeptIds: ["women"],
      enabledLeafKeys: ["women:top:blouse", "women:top:shirt", "women:top:camisole"],
    });

    expect(scope.enabledLeafKeys).toEqual(["women:top:shirt", "women:top:t-shirt"]);

    const map = parsePersonaCategoryMap(
      { blouses: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "blouse", personaPath: "stale" } },
      categories,
    );
    expect(map.blouses).toMatchObject({ status: "mapped", subCategory: "shirt" });
    expect(map.blouses?.personaPath).toBeUndefined();
  });

  it("keeps a leaf that is still current exactly as it was", () => {
    const map = parsePersonaCategoryMap(
      { jeans: { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "jean", personaPath: "kept" } },
      categories,
    );
    expect(map.jeans).toMatchObject({ subCategory: "jean", personaPath: "kept" });
  });

  it("drops a standard leaf that never existed, and keeps a merchant's own custom leaf", () => {
    const customLeaves = [
      { deptId: "women", catId: "top", subCategory: "blouse" },
      { deptId: "women", catId: "loungewear", subCategory: "robe" },
    ];
    const map = parsePersonaCategoryMap(
      {
        blouses: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "blouse" },
        jeans: { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "not-a-leaf" },
        shorts: { status: "mapped", departmentId: "women", categoryId: "loungewear", subCategory: "robe" },
      },
      categories,
      customLeaves,
    );

    expect(map.blouses).toMatchObject({ subCategory: "blouse" });
    expect(map.jeans).toBeUndefined();
    expect(map.shorts).toMatchObject({ categoryId: "loungewear", subCategory: "robe" });
  });
});

describe("title evidence through the merge table", () => {
  const scope = {
    configured: true,
    enabledDeptIds: ["women", "kids-girls"],
    enabledLeafKeys: ["women:bottom:jean", "women:bottom:short", "kids-girls:bottom:trouser", "kids-girls:bottom:short"],
    customLeaves: [],
    customCategories: [],
  };

  it("reads a title naming jeans as the kids' trouser leaf, where jeans were folded into trousers", () => {
    const config = buildPersonaMappingConfig(
      scope,
      {
        shorts: { status: "mapped", departmentId: "kids-girls", categoryId: "bottom", subCategory: "short" },
        jeans: { status: "mapped", departmentId: "kids-girls", categoryId: "bottom", subCategory: "trouser" },
      },
      categories,
    );

    expect(resolvePersonaPaths(["shorts", "jeans"], config, { title: "Girls Skinny Jeans" })[0]?.key).toBe(
      "kids-girls:bottom:trouser",
    );
  });

  it("still reads a title naming jeans as the adult jeans leaf, which was not folded", () => {
    const config = buildPersonaMappingConfig(
      scope,
      {
        shorts: { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "short" },
        jeans: { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "jean" },
      },
      categories,
    );

    expect(resolvePersonaPaths(["shorts", "jeans"], config, { title: "High Rise Jeans" })[0]?.key).toBe(
      "women:bottom:jean",
    );
  });
});

describe("saved charts and the 155-leaf taxonomy", () => {
  it("the Mapping save rejects nothing the converted scope still holds", () => {
    const config = buildPersonaMappingConfig(
      { configured: true, enabledDeptIds: ["women"], enabledLeafKeys: ["women:top:blouse"], customLeaves: [], customCategories: [] },
      { blouses: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "blouse" } },
      categories,
    );

    expect(config.scope.enabledLeafKeys).toEqual(["women:top:shirt"]);
    expect(config.mappings.blouses).toMatchObject({ subCategory: "shirt" });
  });
});
