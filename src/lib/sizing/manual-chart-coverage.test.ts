import { describe, expect, it } from "vitest";
import { manualChartAudiences, manualChartLeaves, suggestChartName } from "./manual-chart-coverage";

describe("suggestChartName", () => {
  it("names a chart after the department and the subcategories it covers", () => {
    expect(suggestChartName(["men:top:shirt", "men:top:polo-shirt"])).toBe("Men - Polo-Shirt, Shirt");
  });

  it("summarises long lists and keeps departments apart", () => {
    const name = suggestChartName([
      "men:top:shirt",
      "men:top:polo-shirt",
      "men:top:t-shirt",
      "men:top:sweater",
      "women:top:blouse",
    ]);
    expect(name).toContain("Men - ");
    expect(name).toContain("+1");
    expect(name).toContain(" / Women - Blouse");
  });

  it("returns an empty name when nothing is selected", () => {
    expect(suggestChartName([])).toBe("");
  });
});

const paths = [
  {
    brandKey: "private-label",
    sizingCategory: "tops",
    categoryId: "men:top:shirt",
  },
  {
    brandKey: "private-label",
    sizingCategory: "tops",
    categoryId: "men:top:sweater",
  },
  {
    brandKey: "private-label",
    sizingCategory: "bottoms",
    categoryId: "men:bottom:trouser",
  },
  {
    brandKey: "__no_brand__",
    sizingCategory: "tops",
    categoryId: "women:top:t-shirt",
  },
  {
    brandKey: "private-label",
    sizingCategory: "tops",
    categoryId: "women:top:polo-shirt",
  },
  {
    brandKey: "private-label",
    sizingCategory: "tops",
    categoryId: "men:top:",
  },
];

describe("manual chart leaf coverage", () => {
  it("uses only exact leaf paths for the requested brand and sizing group", () => {
    expect(manualChartLeaves(paths, "private-label", "tops")).toEqual([
      "men:top:shirt",
      "men:top:sweater",
      "women:top:polo-shirt",
    ]);
  });

  it("keeps no-brand paths isolated from named and private brands", () => {
    expect(manualChartLeaves(paths, "__no_brand__", "tops")).toEqual([
      "women:top:t-shirt",
    ]);
  });

  it("retains stored coverage while removing duplicates and category-level paths", () => {
    expect(
      manualChartLeaves(paths, "private-label", "tops", [
        "men:top:shirt",
        "kids-boys:top:t-shirt",
        "men:top:",
      ]),
    ).toEqual([
      "men:top:shirt",
      "kids-boys:top:t-shirt",
      "men:top:sweater",
      "women:top:polo-shirt",
    ]);
  });

  it("surfaces mixed audiences instead of choosing one implicitly", () => {
    expect(
      manualChartAudiences(["men:top:shirt", "women:top:t-shirt", "kids-boys:top:sweater"]),
    ).toEqual(["mens", "womens", "boys"]);
  });
});
