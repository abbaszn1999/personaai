import { describe, expect, it } from "vitest";
import { fitGroupClause, fitRowSizes } from "@/lib/agents/shared/fit";
import {
  FIT_INDEX,
  FIT_INDEXED_MEASUREMENTS,
  fitValueAttribute,
  fitValueField,
  isFitIndexed,
  rowValues,
  shopperValues,
} from "./fit-index";

describe("rowValues", () => {
  it("lists every whole cm a ranged row covers", () => {
    expect(rowValues("chest", 93, 98)).toEqual(["93", "94", "95", "96", "97", "98"]);
  });

  it("rounds a bound outward so a row never lists too little", () => {
    expect(rowValues("chest", 92.4, 97.6)).toEqual(["92", "93", "94", "95", "96", "97", "98"]);
  });

  it("lists a one-number size as a single value", () => {
    expect(rowValues("chest", 97, 97)).toEqual(["97"]);
  });

  it("steps foot length by 0.1 cm without float drift", () => {
    expect(rowValues("foot_length", 25.3, 25.6)).toEqual(["25.3", "25.4", "25.5", "25.6"]);
  });

  it("runs an open end to the edge of the measurement's domain", () => {
    const values = rowValues("chest", 114, null);
    expect(values[0]).toBe("114");
    expect(values.at(-1)).toBe("200");
    expect(rowValues("chest", null, 40)[0]).toBe("30");
  });

  it("clamps to the domain and is empty when the row lies wholly outside it", () => {
    expect(rowValues("chest", 20, 32)).toEqual(["30", "31", "32"]);
    expect(rowValues("chest", 250, 260)).toEqual([]);
  });

  it("stays under the ACS cap of 400 values per attribute, even fully open", () => {
    for (const measurement of FIT_INDEXED_MEASUREMENTS) {
      expect(rowValues(measurement, null, null).length).toBeLessThanOrEqual(400);
    }
  });
});

describe("shopperValues", () => {
  it("asks for every value within tolerance of the shopper", () => {
    expect(shopperValues("chest", 100)).toEqual(["98", "99", "100", "101", "102"]);
  });

  it("rounds the window outward to whole steps", () => {
    expect(shopperValues("chest", 100.5)).toEqual(["98", "99", "100", "101", "102", "103"]);
  });

  it("uses the 0.3 cm foot tolerance at 0.1 cm steps", () => {
    expect(shopperValues("foot_length", 26)).toEqual(["25.7", "25.8", "25.9", "26.0", "26.1", "26.2", "26.3"]);
  });

  it("uses the kids' height tolerance", () => {
    expect(shopperValues("height", 124)).toHaveLength(11);
  });

  it("is empty when the shopper is outside the domain", () => {
    expect(shopperValues("chest", 400)).toEqual([]);
  });
});

describe("field names", () => {
  it("names the published attribute and the filter path from one place", () => {
    expect(fitValueAttribute("chest")).toBe("fit_chest_cm");
    expect(fitValueField("foot_length")).toBe("attributes.fit_foot_length_cm");
    expect(isFitIndexed("chest")).toBe(true);
    expect(isFitIndexed("hip")).toBe(false);
    expect(Object.values(FIT_INDEX).map((spec) => spec.attribute)).toHaveLength(4);
  });
});

describe("no false negatives", () => {
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
  }

  it("never drops a row that the exact fit check accepts", () => {
    const random = seeded(42);
    const cases: Array<{
      group: "tops" | "bottoms" | "footwear";
      measurement: "chest" | "waist" | "foot_length";
      lo: number;
      hi: number;
      decimals: number;
    }> = [
      { group: "tops", measurement: "chest", lo: 70, hi: 150, decimals: 1 },
      { group: "bottoms", measurement: "waist", lo: 55, hi: 130, decimals: 1 },
      { group: "footwear", measurement: "foot_length", lo: 14, hi: 32, decimals: 1 },
    ];
    let accepted = 0;
    for (const { group, measurement, lo, hi, decimals } of cases) {
      for (let i = 0; i < 1500; i += 1) {
        const scale = 10 ** decimals;
        const min = Math.round((lo + random() * (hi - lo)) * scale) / scale;
        const open = random() < 0.1;
        const width = random() < 0.2 ? 0 : Math.round(random() * 8 * scale) / scale;
        const max = open ? null : Math.round((min + width) * scale) / scale;
        const value = Math.round((lo + random() * (hi - lo)) * scale) / scale;
        const row = JSON.stringify({ s: "X", [measurement]: [min, max] });

        const exactFit = fitRowSizes([row], group, { [measurement]: value }, false).length > 0;
        if (!exactFit) continue;
        accepted += 1;

        const listed = new Set(rowValues(measurement, min, max));
        expect(
          shopperValues(measurement, value).some((entry) => listed.has(entry)),
          `${measurement} ${min}-${max} for ${value}`,
        ).toBe(true);
      }
    }
    expect(accepted).toBeGreaterThan(500);
  });
});

describe("fitGroupClause", () => {
  it("is a values clause on the required measurement only", () => {
    expect(fitGroupClause("tops", { chest: 100, waist: 80 }, false)).toBe(
      '(attributes.fit_group: ANY("tops") AND attributes.fit_chest_cm: ANY("98", "99", "100", "101", "102"))',
    );
  });
});
