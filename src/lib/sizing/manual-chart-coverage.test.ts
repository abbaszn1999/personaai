import { describe, expect, it } from "vitest";
import { departmentLeaves, manualChartAudiences, manualChartLeaves, suggestChartName } from "./manual-chart-coverage";
import { emptyDraftRows } from "./chart-draft";

describe("departmentLeaves", () => {
  it("lists one entry per department in taxonomy order, with what is still open", () => {
    const groups = departmentLeaves(
      ["women:top:knit", "men:top:shirt", "women:top:t-shirt", "kids-girls:top:t-shirt", "men:top:shirt"],
      new Set(["women:top:t-shirt"]),
    );

    expect(groups).toEqual([
      { departmentId: "women", audience: "womens", leaves: ["women:top:t-shirt", "women:top:knit"], open: ["women:top:knit"] },
      { departmentId: "men", audience: "mens", leaves: ["men:top:shirt"], open: ["men:top:shirt"] },
      { departmentId: "kids-girls", audience: "girls", leaves: ["kids-girls:top:t-shirt"], open: ["kids-girls:top:t-shirt"] },
    ]);
  });

  it("drops category-level paths, which name no subcategory to chart", () => {
    expect(departmentLeaves(["men:top:", "not-a-leaf"], new Set())).toEqual([]);
  });
});

describe("emptyDraftRows", () => {
  it("seeds adult and kids grids with the labels each is usually sized in", () => {
    expect(emptyDraftRows("tops", "mens").map((row) => row.size)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(emptyDraftRows("tops", "boys").map((row) => row.size)).toEqual(["104", "110", "116", "122", "128"]);
    expect(emptyDraftRows("footwear", "girls").map((row) => row.size)).toEqual(["28", "29", "30", "31", "32"]);
    expect(emptyDraftRows("footwear").map((row) => row.size)).toEqual(["38", "39", "40", "41", "42"]);
  });
});

describe("suggestChartName", () => {
  it("names a chart after the department and the subcategories it covers", () => {
    expect(suggestChartName(["men:top:shirt", "men:top:polo-shirt"])).toBe("Men - Polos, Shirts");
  });

  it("summarises long lists and keeps departments apart", () => {
    const name = suggestChartName([
      "men:top:shirt",
      "men:top:polo-shirt",
      "men:top:t-shirt",
      "men:top:knit",
      "women:top:shirt",
    ]);
    expect(name).toContain("Men - ");
    expect(name).toContain("+1");
    expect(name).toContain(" / Women - Shirts & Blouses");
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
    categoryId: "men:top:knit",
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
      "men:top:knit",
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
      "men:top:knit",
      "women:top:polo-shirt",
    ]);
  });

  it("surfaces mixed audiences instead of choosing one implicitly", () => {
    expect(
      manualChartAudiences(["men:top:shirt", "women:top:t-shirt", "kids-boys:top:knit"]),
    ).toEqual(["mens", "womens", "boys"]);
  });
});
