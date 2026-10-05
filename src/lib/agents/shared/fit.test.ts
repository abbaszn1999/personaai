import { describe, expect, it } from "vitest";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import {
  analyzeFit,
  bodyMeasurements,
  fitFilterClause,
  fitGroupClause,
  fitRowSizes,
  fittingSizes,
  footLengthFromEu,
  parseShopperMeasurements,
  sizingGroupOfRows,
  summarizeLookFit,
} from "./fit";

function candidate(rows: object[], group = "tops"): CatalogCandidate {
  return {
    externalId: "p1",
    productGroupId: null,
    title: "Tee",
    brand: null,
    categoryPaths: [],
    price: 20,
    currency: "USD",
    inStock: true,
    productUrl: null,
    imageUrl: null,
    enrichedDescription: null,
    attributes: { fit_group: [group], fit_rows: rows.map((row) => JSON.stringify(row)) },
    garmentCategory: null,
    garmentSubcategory: null,
  };
}

const ranged = [
  { s: "S", chest: [88, 92], waist: [76, 80] },
  { s: "M", chest: [93, 98], waist: [81, 86] },
  { s: "L", chest: [99, 104], waist: [87, 92] },
];

const points = [
  { s: "S", chest: [97, 97], waist: [80, 80] },
  { s: "M", chest: [101, 101], waist: [84, 84] },
  { s: "L", chest: [105, 105], waist: [88, 88] },
];

describe("parseShopperMeasurements", () => {
  it("keeps plausible numbers and drops the rest", () => {
    expect(parseShopperMeasurements({ heightCm: 180, chestCm: "100", waistCm: 5, hipsCm: null, shoeSizeEu: 43 })).toEqual({
      heightCm: 180,
      chestCm: 100,
      waistCm: null,
      hipsCm: null,
      shoeSizeEu: 43,
    });
  });

  it("is null when nothing usable was sent", () => {
    expect(parseShopperMeasurements({ chestCm: null })).toBeNull();
    expect(parseShopperMeasurements(undefined)).toBeNull();
  });
});

describe("bodyMeasurements", () => {
  it("maps profile fields to chart measurements, EU shoe size to foot length", () => {
    expect(footLengthFromEu(42)).toBe(26.5);
    expect(bodyMeasurements({ heightCm: 180, chestCm: 100, waistCm: 84, hipsCm: 98, shoeSizeEu: 42 })).toEqual({
      height: 180,
      chest: 100,
      waist: 84,
      hip: 98,
      foot_length: 26.5,
    });
  });
});

describe("fitGroupClause", () => {
  it("sends one required measurement per group, widened by its fixed tolerance", () => {
    const body = { chest: 95, waist: 84, hip: 99, foot_length: 27 };
    expect(fitGroupClause("tops", body, false)).toBe(
      '(attributes.fit_group: ANY("tops") AND attributes.fit_chest_min: IN(*, 97i) AND attributes.fit_chest_max: IN(93i, *))'
    );
    expect(fitGroupClause("bottoms", body, false)).toBe(
      '(attributes.fit_group: ANY("bottoms") AND attributes.fit_waist_min: IN(*, 86i) AND attributes.fit_waist_max: IN(82i, *))'
    );
    expect(fitGroupClause("footwear", body, false)).toBe(
      '(attributes.fit_group: ANY("footwear") AND attributes.fit_foot_length_min: IN(*, 27.3i) AND attributes.fit_foot_length_max: IN(26.7i, *))'
    );
  });

  it("never sends hips or the optional waist", () => {
    const clause = fitGroupClause("bottoms", { waist: 84, hip: 99 }, false)!;
    expect(clause).not.toContain("fit_hip");
    expect(fitGroupClause("tops", { chest: 95, waist: 84 }, false)).not.toContain("fit_waist");
  });

  it("is null without the required measurement or an indexed field", () => {
    expect(fitGroupClause("tops", { waist: 84 }, false)).toBeNull();
    expect(fitGroupClause("tops", { chest: 95 }, false, new Set(["attributes.fit_chest_max"]))).toBeNull();
  });
});

describe("fitFilterClause", () => {
  const body = { chest: 100, waist: 84, foot_length: 27 };

  it("adds one branch per group on its required measurement", () => {
    const clause = fitFilterClause(body, false);
    expect(clause).toContain(
      '(attributes.fit_group: ANY("tops") AND attributes.fit_chest_min: IN(*, 102i) AND attributes.fit_chest_max: IN(98i, *))'
    );
    expect(clause).toContain(
      '(attributes.fit_group: ANY("bottoms") AND attributes.fit_waist_min: IN(*, 86i) AND attributes.fit_waist_max: IN(82i, *))'
    );
    expect(clause).toContain('attributes.fit_group: ANY("footwear") AND attributes.fit_foot_length_min: IN(*, 27.3i)');
    expect(clause.split(" OR ")).toHaveLength(5);
  });

  it("uses height for every kids' group", () => {
    const clause = fitFilterClause({ height: 120, chest: 60 }, true);
    expect(clause).toContain('(attributes.fit_group: ANY("tops") AND attributes.fit_height_min: IN(*, 125i)');
    expect(clause).not.toContain("fit_chest");
  });

  it("drops a group whose required measurement is missing or not indexed", () => {
    expect(fitFilterClause({ chest: 100 }, false)).not.toContain('"bottoms"');
    expect(fitFilterClause(body, false, new Set(["attributes.fit_foot_length_min"]))).not.toContain('"footwear"');
    expect(fitFilterClause({}, false)).toBe("");
  });
});

describe("fittingSizes", () => {
  it("accepts every ranged size within tolerance of the shopper, the one containing them first", () => {
    expect(fittingSizes(candidate(ranged), { chest: 100 })).toEqual(["L", "M"]);
    expect(fittingSizes(candidate(ranged), { chest: 95 })).toEqual(["M"]);
    expect(fittingSizes(candidate(ranged), { chest: 99 })).toEqual(["L", "M"]);
    expect(fittingSizes(candidate(ranged), { chest: 106 })).toEqual(["L"]);
    expect(fittingSizes(candidate(ranged), { chest: 106.1 })).toEqual([]);
    expect(fittingSizes(candidate(ranged), { chest: 86 })).toEqual(["S"]);
    expect(fittingSizes(candidate(ranged), { chest: 85.9 })).toEqual([]);
  });

  it("treats a one-number size as a range of one point, so chest 95 reaches 93 to 97", () => {
    expect(fittingSizes(candidate(points), { chest: 95 })).toEqual(["S"]);
    expect(fittingSizes(candidate(points), { chest: 94.9 })).toEqual([]);
    expect(fittingSizes(candidate(points), { chest: 107 })).toEqual(["L"]);
    expect(fittingSizes(candidate(points), { chest: 107.1 })).toEqual([]);
  });

  it("sends a tie between two one-number sizes to the bigger one", () => {
    expect(fittingSizes(candidate(points), { chest: 99 })).toEqual(["M", "S"]);
    expect(fittingSizes(candidate(points), { chest: 100 })).toEqual(["M"]);
  });

  it("does not match a size that is not in stock", () => {
    const gapped = [
      { s: "S", chest: [97, 97] },
      { s: "XXL", chest: [113, 113] },
    ];
    expect(fittingSizes(candidate(gapped), { chest: 105 })).toEqual([]);
  });

  it("ranks by the optional measurement when the required one cannot tell sizes apart", () => {
    const overlapping = [
      { s: "A", chest: [92, 100], waist: [80, 86] },
      { s: "B", chest: [96, 104], waist: [87, 92] },
    ];
    expect(fittingSizes(candidate(overlapping), { chest: 98, waist: 90 })).toEqual(["B", "A"]);
    expect(fittingSizes(candidate(overlapping), { chest: 98, waist: 82 })).toEqual(["A", "B"]);
    // The optional measurement never removes a size.
    expect(fittingSizes(candidate(overlapping), { chest: 98, waist: 120 })).toHaveLength(2);
  });

  it("decides a bottom on waist, using hips only to rank", () => {
    const trousers = [
      { s: "32", waist: [81, 85], hip: [96, 100] },
      { s: "34", waist: [85, 89], hip: [101, 105] },
    ];
    expect(fittingSizes(candidate(trousers, "bottoms"), { waist: 85 })).toEqual(["34", "32"]);
    expect(fittingSizes(candidate(trousers, "bottoms"), { waist: 85, hip: 98 })).toEqual(["32", "34"]);
    expect(fittingSizes(candidate(trousers, "bottoms"), { chest: 85 })).toEqual([]);
  });

  it("decides footwear on foot length within 0.3 cm", () => {
    const shoes = [
      { s: "42", foot_length: [26.5, 26.9] },
      { s: "43", foot_length: [27.2, 27.6] },
    ];
    expect(fittingSizes(candidate(shoes, "footwear"), { foot_length: 27 })).toEqual(["42", "43"]);
    expect(fittingSizes(candidate(shoes, "footwear"), { foot_length: 27.6 })).toEqual(["43"]);
    expect(fittingSizes(candidate(shoes, "footwear"), { foot_length: 28 })).toEqual([]);
  });

  it("decides every kids' group on height", () => {
    const kids = [{ s: "6-7Y", height: [116, 122] }];
    expect(fittingSizes(candidate(kids), { height: 126 }, [], true)).toEqual(["6-7Y"]);
    expect(fittingSizes(candidate(kids), { height: 126 }, [], false)).toEqual([]);
  });

  it("needs the required measurement on the row", () => {
    expect(fittingSizes(candidate([{ s: "M", waist: [81, 86] }]), { chest: 95, waist: 84 })).toEqual([]);
    expect(fittingSizes(candidate([{ s: "M", chest: [93, 98] }]), { waist: 84 })).toEqual([]);
  });

  it("narrows to a size the shopper named", () => {
    const wide = [{ s: "M", chest: [90, 105] }, { s: "L", chest: [95, 110] }];
    expect(fittingSizes(candidate(wide), { chest: 100 }, ["l"])).toEqual(["L"]);
    expect(fittingSizes(candidate(wide), { chest: 100 }, ["XL"])).toEqual([]);
  });

  it("has nothing to confirm without a chart", () => {
    expect(fittingSizes({ ...candidate([]), attributes: {} }, { chest: 100 })).toEqual([]);
    expect(fittingSizes({ ...candidate([{ s: "M" }]), attributes: {} }, { chest: 100 })).toEqual([]);
  });

  // ACS does not return `fit_group` on search results, so the group comes from the rows.
  it("reads the sizing group off the rows when the search result does not carry it", () => {
    const rows = (list: object[]) => ({ fit_rows: list.map((row) => JSON.stringify(row)) });
    const bare = (list: object[]): CatalogCandidate => ({ ...candidate([]), attributes: rows(list) });
    expect(fittingSizes(bare(ranged), { chest: 100 })).toEqual(["L", "M"]);
    expect(fittingSizes(bare(ranged), { chest: 120 })).toEqual([]);
    const trousers = [
      { s: "32", waist: [80, 84], hip: [96, 100] },
      { s: "34", waist: [85, 89], hip: [101, 105] },
    ];
    expect(fittingSizes(bare(trousers), { waist: 85 })).toEqual(["34", "32"]);
    expect(fittingSizes(bare(trousers), { chest: 85 })).toEqual([]);
    const shoes = [{ s: "42", foot_length: [26.5, 27.1] }];
    expect(fittingSizes(bare(shoes), { foot_length: 27 })).toEqual(["42"]);
    const kids = [{ s: "6-7Y", height: [120, 130], chest: [60, 64] }];
    expect(fittingSizes(bare(kids), { height: 126 }, [], true)).toEqual(["6-7Y"]);
  });
});

describe("sizingGroupOfRows", () => {
  const toRows = (list: object[]) => list.map((row) => JSON.stringify(row));

  it("prefers an explicit group", () => {
    expect(sizingGroupOfRows(toRows(ranged), false, "outerwear")).toBe("outerwear");
    expect(sizingGroupOfRows(toRows(ranged), false, "nonsense")).toBe("tops");
  });

  it("infers the deciding measurement's group and gives up on rows with no measurements", () => {
    expect(sizingGroupOfRows(toRows(ranged))).toBe("tops");
    expect(sizingGroupOfRows(toRows([{ s: "32", waist: [80, 84], inseam: [80, 82] }]))).toBe("bottoms");
    expect(sizingGroupOfRows(toRows([{ s: "42", foot_length: [26, 27] }]))).toBe("footwear");
    expect(sizingGroupOfRows(toRows([{ s: "6Y", height: [120, 126] }]), true)).toBe("tops");
    expect(sizingGroupOfRows(toRows([{ s: "M" }]))).toBeNull();
    expect(sizingGroupOfRows([])).toBeNull();
    expect(sizingGroupOfRows(["not json"])).toBeNull();
  });
});

describe("fitRowSizes", () => {
  it("is the same rule on raw rows, for callers that have no candidate", () => {
    expect(fitRowSizes(ranged.map((row) => JSON.stringify(row)), "tops", { chest: 95 })).toEqual(["M"]);
  });
});

describe("analyzeFit", () => {
  const rows = ranged.map((row) => JSON.stringify(row));

  it("scores published measurements from the exact recommended size row", () => {
    const result = analyzeFit(rows, "tops", "M", { chest: 95, waist: 84 });
    expect(result.score).toBe(100);
    expect(result.label).toBe("Excellent Fit");
    expect(result.metrics).toEqual([
      expect.objectContaining({ measurement: "chest", shopperValue: 95, min: 93, max: 98, direction: "inside", score: 100 }),
      expect.objectContaining({ measurement: "waist", shopperValue: 84, min: 81, max: 86, direction: "inside", score: 100 }),
    ]);
  });

  it("scores distance outside the range and gives an actionable direction", () => {
    const result = analyzeFit(rows, "tops", "M", { chest: 101, waist: 79 });
    expect(result.metrics).toEqual([
      expect.objectContaining({ measurement: "chest", outside: 3, direction: "size_up", score: 50 }),
      expect.objectContaining({ measurement: "waist", outside: 2, direction: "size_down", score: 67 }),
    ]);
    expect(result.score).toBe(59);
    expect(result.label).toBe("Check fit · mixed measurements");
  });

  it("shows published measurements the shopper did not provide without scoring them", () => {
    const result = analyzeFit(rows, "tops", "M", { chest: 95 });
    expect(result.score).toBe(100);
    expect(result.metrics[1]).toEqual(expect.objectContaining({ measurement: "waist", shopperValue: null, score: null }));
  });

  it("returns honest empty states for no chart, missing size, and no comparable measurements", () => {
    expect(analyzeFit([], "tops", "M", { chest: 95 }).reason).toBe("no_chart");
    expect(analyzeFit(rows, "tops", "XL", { chest: 95 }).reason).toBe("size_not_found");
    expect(analyzeFit(rows, "tops", "M", {}).reason).toBe("no_measurements");
  });

  it("uses height rather than chest for a kids chart", () => {
    const result = analyzeFit(
      [JSON.stringify({ s: "6-7Y", height: [116, 122], chest: [60, 60] })],
      "tops",
      "6-7Y",
      { height: 124, chest: 60 },
      true
    );
    expect(result.metrics.map((metric) => metric.measurement)).toEqual(["height"]);
    expect(result.metrics.find((metric) => metric.measurement === "height")).toEqual(
      expect.objectContaining({ outside: 2, direction: "size_up", score: 83 })
    );
  });

  it("averages only items that have real chart scores", () => {
    const complete = { productId: "a", productName: "Tee", ...analyzeFit(rows, "tops", "M", { chest: 95 }) };
    const missing = { productId: "b", productName: "Coat", ...analyzeFit([], "outerwear", "M", { chest: 95 }) };
    expect(summarizeLookFit([complete, missing])).toEqual(
      expect.objectContaining({ score: 100, label: "Excellent Fit", items: [complete, missing] })
    );
  });
});
