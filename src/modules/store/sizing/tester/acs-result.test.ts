import { describe, expect, it } from "vitest";
import type { FitSearchProductDto } from "@/lib/catalog/acs/fit-search";
import { summarizeSearch, testerSearchParams, type TesterMeasurements } from "./acs-result";
import type { MultiSystemRow, TesterBrand } from "./options";

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

function row(sizeLabel: string, chest: [number, number]): MultiSystemRow {
  return { sizeLabel, chestMin: chest[0], chestMax: chest[1] } as MultiSystemRow;
}

function product(id: string, fitSizes: string[]): FitSearchProductDto {
  return {
    id, title: id, brand: null, sku: null, image: null, price: null, currency: null,
    sizes: fitSizes, fitSizes, availability: "IN_STOCK", uri: null, category: null,
  };
}

describe("testerSearchParams", () => {
  it("sends only the measurements that apply to the garment group", () => {
    const tops = testerSearchParams({
      brand, group: "tops", audience: "mens", chartVariant: "Men Tops", persona: "men", measurements,
    });
    expect(tops.getAll("brand")).toEqual(["tom tailor", "Tom Tailor"]);
    expect(tops.get("fitGroup")).toBe("tops");
    expect(tops.get("chest")).toBe("95");
    expect(tops.get("waist")).toBe("84");
    expect(tops.has("hip")).toBe(false);
    expect(tops.has("footLength")).toBe(false);

    const bottoms = testerSearchParams({
      brand, group: "bottoms", audience: "mens", chartVariant: "Men Jeans", persona: "men", measurements,
    });
    expect(bottoms.get("waist")).toBe("84");
    expect(bottoms.get("hip")).toBe("99");
    expect(bottoms.has("chest")).toBe(false);

    const shoes = testerSearchParams({
      brand, group: "footwear", audience: "mens", chartVariant: "Men Shoes", persona: "men", measurements,
    });
    expect(shoes.get("footLength")).toBe("27");
    expect(shoes.has("chest")).toBe(false);
  });

  it("sends a kid's height and the explicit no-brand selection", () => {
    const params = testerSearchParams({
      brand: { coverageType: "none", sourceBrandNames: [] } as unknown as TesterBrand,
      group: "tops", audience: "boys", chartVariant: "Boys Tops", persona: "kid", measurements,
    });
    expect(params.get("brand")).toBe("__none__");
    expect(params.get("height")).toBe("124");
  });
});

describe("summarizeSearch", () => {
  const rows = [row("XXS", [80, 83]), row("XS", [84, 87]), row("S", [88, 92]), row("M", [93, 97])];

  it("counts, per chart row, the ACS products with that size within tolerance", () => {
    const { counts } = summarizeSearch(rows, "tops", "mens", { chest: 95 }, [
      product("a", ["M"]),
      product("b", ["M", "S"]),
      product("c", []),
    ]);
    expect(counts).toEqual([0, 0, 1, 2]);
  });

  it("matches size labels across their written forms", () => {
    const { counts } = summarizeSearch(rows, "tops", "mens", { chest: 95 }, [product("a", ["m"])]);
    expect(counts[3]).toBe(1);
  });

  it("picks the best row only among rows ACS produced products for", () => {
    const products = [product("a", ["S"]), product("b", ["M"])];
    expect(summarizeSearch(rows, "tops", "mens", { chest: 95 }, products).bestIndex).toBe(3);
    expect(summarizeSearch(rows, "tops", "mens", { chest: 95 }, [product("a", ["S"])]).bestIndex).toBe(2);
    expect(summarizeSearch(rows, "tops", "mens", { chest: 95 }, []).bestIndex).toBe(-1);
  });

  it("sends a tie between two neighbouring rows to the bigger size", () => {
    const tied = [row("XS", [84, 87]), row("S", [88, 91])];
    const products = [product("a", ["XS", "S"])];
    expect(summarizeSearch(tied, "tops", "mens", { chest: 87.5 }, products).bestIndex).toBe(1);
  });
});
