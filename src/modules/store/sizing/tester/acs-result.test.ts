import { describe, expect, it } from "vitest";
import type { FitSearchProductDto } from "@/lib/catalog/acs/fit-search";
import type { SizeChartRow } from "@/lib/sizing/chart-schema";
import {
  assignChart,
  brandCategoriesFor,
  categoryBody,
  categoryFilterPreview,
  chartRowFits,
  fittingRowIndexes,
  groupBySubcategory,
  matchProductRows,
  measurementRole,
  summarizeChart,
  testerSearchParams,
  type AssignedProduct,
  type TesterMeasurements,
} from "./acs-result";
import { chartRowToMultiSystemRow, type BrandSubCategory, type MultiSystemRow, type TesterBrand } from "./options";

const measurements: TesterMeasurements = {
  adultChest: 95,
  adultWaist: 84,
  adultHips: 99,
  adultFootLength: 27,
  kidHeight: 124,
  kidChest: 63,
  kidWaist: 58,
  kidHips: 66,
  kidFootLength: 19.8,
};

const brand = { coverageType: "global", sourceBrandNames: ["tom tailor", "Tom Tailor"] } as TesterBrand;

function row(size: string, bounds: Partial<SizeChartRow> = {}): MultiSystemRow {
  return chartRowToMultiSystemRow({ size, ...bounds } as SizeChartRow);
}

function chest(size: string, min: number, max: number, extra: Partial<SizeChartRow> = {}): MultiSystemRow {
  return row(size, { chest_min: min, chest_max: max, ...extra });
}

function chart(id: string, rows: MultiSystemRow[], overrides: Partial<BrandSubCategory> = {}): BrandSubCategory {
  return {
    id,
    name: id,
    fitType: "True to Size",
    fitDescription: "",
    rowsByPersona: { men: rows },
    chartId: id,
    audience: "mens",
    confidence: 100,
    sourceTitle: "",
    sourceUrl: null,
    coversLeaves: ["men:top:t-shirt"],
    chartRows: rows.map((entry) => entry.chartRow),
    ...overrides,
  };
}

function fitRow(size: string, bounds: Record<string, [number | null, number | null]>): string {
  return JSON.stringify({ s: size, ...bounds });
}

function product(id: string, fitSizes: string[], fitRows: string[] = [], leafKey: string | null = "men:top:t-shirt"): FitSearchProductDto {
  return {
    id, title: id, brand: null, sku: null, image: null, price: null, currency: null,
    sizes: fitSizes, fitSizes, fitRows, availability: "IN_STOCK", uri: null, leafKey,
    personaPath: leafKey ? `persona > ${leafKey.replaceAll(":", " > ")}` : null,
  };
}

const MEN = [chest("S", 88, 92, { waist_min: 76, waist_max: 80 }), chest("M", 93, 98, { waist_min: 81, waist_max: 86 }), chest("L", 99, 104, { waist_min: 87, waist_max: 92 })];
const PLUS = [chest("XXL", 111, 116), chest("3XL", 117, 122)];

describe("testerSearchParams", () => {
  it("sends the target and only the measurements the category can use", () => {
    const tops = testerSearchParams({ brand, group: "tops", target: "men", measurements });
    expect(tops.get("target")).toBe("men");
    expect(tops.getAll("brand")).toEqual(["tom tailor", "Tom Tailor"]);
    expect(tops.get("fitGroup")).toBe("tops");
    expect(tops.get("chest")).toBe("95");
    expect(tops.get("waist")).toBe("84");
    expect(tops.has("hip")).toBe(false);
    expect(tops.has("footLength")).toBe(false);
    expect(tops.has("height")).toBe(false);

    const bottoms = testerSearchParams({ brand, group: "bottoms", target: "women", measurements });
    expect(bottoms.get("waist")).toBe("84");
    expect(bottoms.get("hip")).toBe("99");
    expect(bottoms.has("chest")).toBe(false);

    const shoes = testerSearchParams({ brand, group: "footwear", target: "men", measurements });
    expect(shoes.get("footLength")).toBe("27");
    expect(shoes.has("chest")).toBe(false);
  });

  it("sends a kid's height and the explicit no-brand selection", () => {
    const params = testerSearchParams({
      brand: { coverageType: "none", sourceBrandNames: [] } as unknown as TesterBrand,
      group: "tops", target: "kid", measurements,
    });
    expect(params.get("brand")).toBe("__none__");
    expect(params.get("height")).toBe("124");
    expect(params.get("chest")).toBe("63");
    expect(params.has("hip")).toBe(false);
  });

  it("previews each category's filtering measurement with its tolerance", () => {
    expect(categoryFilterPreview("tops", "men", measurements)).toEqual([{ measurement: "chest", value: 95, tolerance: 2 }]);
    expect(categoryFilterPreview("bottoms", "men", measurements)).toEqual([{ measurement: "waist", value: 84, tolerance: 2 }]);
    expect(categoryFilterPreview("footwear", "kid", measurements)).toEqual([{ measurement: "foot_length", value: 19.8, tolerance: 0.3 }]);
    expect(categoryFilterPreview("dresses", "kid", measurements)).toEqual([{ measurement: "height", value: 124, tolerance: 5 }]);
    expect(categoryBody("dresses", "women", measurements)).toEqual({ chest: 95, waist: 84, hip: 99 });
  });
});

describe("measurementRole", () => {
  it("says which categories a measurement filters and which it only ranks", () => {
    expect(measurementRole("chest", "men", ["tops", "bottoms", "dresses"])).toEqual({ filters: ["tops", "dresses"], ranks: [] });
    expect(measurementRole("waist", "men", ["tops", "bottoms"])).toEqual({ filters: ["bottoms"], ranks: ["tops"] });
    expect(measurementRole("hip", "men", ["tops"])).toEqual({ filters: [], ranks: [] });
    expect(measurementRole("height", "kid", ["tops", "footwear"])).toEqual({ filters: ["tops"], ranks: [] });
  });
});

describe("brandCategoriesFor", () => {
  it("asks only the categories with a chart for the target", () => {
    const brandWithCharts = {
      categories: [
        { key: "tops", label: "Tops", skuCount: 3, subcategories: [chart("men-tops", MEN)] },
        { key: "bottoms", label: "Bottoms", skuCount: 2, subcategories: [chart("women-bottoms", MEN, { rowsByPersona: { women: MEN } })] },
      ],
    } as unknown as TesterBrand;
    expect(brandCategoriesFor(brandWithCharts, "men").map((plan) => plan.category.key)).toEqual(["tops"]);
    expect(brandCategoriesFor(brandWithCharts, "women").map((plan) => plan.category.key)).toEqual(["bottoms"]);
    expect(brandCategoriesFor(brandWithCharts, "kid")).toEqual([]);
  });
});

describe("chartRowFits", () => {
  it("marks the chart row containing the value and the rows within tolerance, stock or not", () => {
    const blazers = [chest("50", 98, 101), chest("52", 102, 105), chest("54", 106, 109), chest("56", 110, 113)];
    const tolerances = [{ measurement: "chest" as const, value: 104, tolerance: 2 }];
    expect(chartRowFits(blazers, "outerwear", "mens", tolerances)).toEqual([null, "inside", "near", null]);
    expect(chartRowFits(blazers, "outerwear", "mens", [])).toEqual([null, null, null, null]);
  });
});

describe("matchProductRows / assignChart", () => {
  const regular = chart("regular", MEN);
  const plus = chart("plus", PLUS, { coversLeaves: ["men:top:t-shirt"] });

  it("locates each indexed row in the chart by its exact bounds, whatever its label", () => {
    const rows = [fitRow("M", { chest: [93, 98], waist: [81, 86] }), fitRow("L", { chest: [99, 104] })];
    expect([...matchProductRows({ fitRows: rows }, MEN)]).toEqual([["M", 1], ["L", 2]]);
    // An EU-labelled index row still lands on its chart row.
    expect([...matchProductRows({ fitRows: [fitRow("48", { chest: [93, 98] })] }, MEN)]).toEqual([["48", 1]]);
    expect(matchProductRows({ fitRows: [fitRow("M", { chest: [93, 97] })] }, MEN).size).toBe(0);
  });

  it("assigns the chart that holds all of the product's rows", () => {
    const tee = product("tee", ["M"], [fitRow("M", { chest: [93, 98] }), fitRow("L", { chest: [99, 104] })]);
    expect(assignChart(tee, [plus, regular], "men")?.chartId).toBe("regular");

    const big = product("big", [], [fitRow("XXL", { chest: [111, 116] }), fitRow("3XL", { chest: [117, 122] })]);
    expect(assignChart(big, [regular, plus], "men")?.chartId).toBe("plus");

    expect(assignChart(product("none", [], [fitRow("M", { chest: [1, 2] })]), [regular, plus], "men")).toBeNull();
  });

  it("prefers the chart covering the product's leaf when two hold the same rows", () => {
    const shirts = chart("shirts", MEN, { coversLeaves: ["men:top:shirt"] });
    const tee = product("tee", ["M"], [fitRow("M", { chest: [93, 98] })]);
    expect(assignChart(tee, [shirts, regular], "men")?.chartId).toBe("regular");
    expect(assignChart({ ...tee, leafKey: "men:top:shirt" }, [regular, shirts], "men")?.chartId).toBe("shirts");
  });
});

describe("summarizeChart", () => {
  const rows = [chest("XXS", 80, 83), chest("XS", 84, 87), chest("S", 88, 92), chest("M", 93, 97)];
  const assigned = (id: string, fitSizes: string[]): AssignedProduct => ({
    product: product(id, fitSizes),
    assignment: {
      chartId: "c",
      rowBySize: new Map(fitSizes.map((size) => [size, rows.findIndex((entry) => entry.sizeLabel === size)])),
    },
  });

  it("counts, per chart row, the products with that size in stock and within tolerance", () => {
    const { counts } = summarizeChart(rows, "tops", "mens", { chest: 95 }, [
      assigned("a", ["M"]),
      assigned("b", ["M", "S"]),
      { product: product("c", []), assignment: null },
    ]);
    expect(counts).toEqual([0, 0, 1, 2]);
    expect([...fittingRowIndexes(assigned("b", ["M", "S"]))]).toEqual([3, 2]);
  });

  it("picks the best row only among rows ACS produced products for", () => {
    expect(summarizeChart(rows, "tops", "mens", { chest: 95 }, [assigned("a", ["S"]), assigned("b", ["M"])]).bestIndex).toBe(3);
    expect(summarizeChart(rows, "tops", "mens", { chest: 95 }, [assigned("a", ["S"])]).bestIndex).toBe(2);
    expect(summarizeChart(rows, "tops", "mens", { chest: 95 }, []).bestIndex).toBe(-1);
  });

  it("sends a tie between two neighbouring rows to the bigger size", () => {
    const tied = [chest("XS", 84, 87), chest("S", 88, 91)];
    const both: AssignedProduct = {
      product: product("a", ["XS", "S"]),
      assignment: { chartId: "c", rowBySize: new Map([["XS", 0], ["S", 1]]) },
    };
    expect(summarizeChart(tied, "tops", "mens", { chest: 87.5 }, [both]).bestIndex).toBe(1);
  });

  it("breaks a tie on the filtering measurement with the ranking measurements, like each product's own sizes", () => {
    // Chest 98 sits on the M/L boundary; waist 90 is inside L only.
    const shirts = [chest("M", 94, 98, { waist_min: 80, waist_max: 85 }), chest("L", 98, 102, { waist_min: 86, waist_max: 91 })];
    const both: AssignedProduct = {
      product: product("a", ["L", "M"]),
      assignment: { chartId: "c", rowBySize: new Map([["M", 0], ["L", 1]]) },
    };
    expect(summarizeChart(shirts, "tops", "mens", { chest: 98, waist: 82 }, [both]).bestIndex).toBe(0);
    expect(summarizeChart(shirts, "tops", "mens", { chest: 98, waist: 90 }, [both]).bestIndex).toBe(1);
  });
});

describe("groupBySubcategory", () => {
  it("groups ACS's products by Persona leaf, biggest first, naming departments when they differ", () => {
    const groups = groupBySubcategory([
      product("a", [], [], "men:top:t-shirt"),
      product("b", [], [], "men:top:t-shirt"),
      product("c", [], [], "unisex:top:t-shirt"),
      product("d", [], [], null),
    ]);
    expect(groups.map((group) => [group.leafKey, group.label, group.products.length])).toEqual([
      ["men:top:t-shirt", "T-Shirts & Tops · Men", 2],
      [null, "Other", 1],
      ["unisex:top:t-shirt", "T-Shirts & Tops · Unisex", 1],
    ]);
    expect(groupBySubcategory([product("a", [], [], "men:top:shirt")])[0]?.label).toBe("Shirts");
  });
});
