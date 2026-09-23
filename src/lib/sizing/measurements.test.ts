import { describe, expect, it } from "vitest";
import { requiredMeasurementsFor, SIZING_GROUP_KEYS } from "./measurements";
import { AUDIENCES } from "./keys";

/**
 * `requiredMeasurementsFor` is what the exclusion filter compares and what a chart's Req column
 * marks. Getting the audience half wrong is silent both ways: a kids chart held to the adult
 * required set rejects real charts whose chest is a pinned point rather than a range, and an adult
 * chart accidentally given the child override would compare shoppers on height when the brand's
 * guide keys on chest.
 */
describe("requiredMeasurementsFor", () => {
  it("requires chest for adult tops and outerwear, waist for adult bottoms", () => {
    for (const audience of ["mens", "womens", "unisex"] as const) {
      expect(requiredMeasurementsFor("tops", audience)).toEqual(["chest"]);
      expect(requiredMeasurementsFor("outerwear", audience)).toEqual(["chest"]);
      expect(requiredMeasurementsFor("bottoms", audience)).toEqual(["waist"]);
      expect(requiredMeasurementsFor("dresses", audience)).toEqual(["chest"]);
    }
  });

  it("requires height instead, for every child audience", () => {
    for (const audience of ["boys", "girls", "kids"] as const) {
      expect(requiredMeasurementsFor("tops", audience)).toEqual(["height"]);
      expect(requiredMeasurementsFor("outerwear", audience)).toEqual(["height"]);
      expect(requiredMeasurementsFor("bottoms", audience)).toEqual(["height"]);
      expect(requiredMeasurementsFor("dresses", audience)).toEqual(["height"]);
    }
  });

  it("never overrides footwear, for any audience", () => {
    for (const audience of AUDIENCES) {
      expect(requiredMeasurementsFor("footwear", audience)).toEqual(["foot_length"]);
    }
  });

  it("defaults to the adult set when no audience is given", () => {
    for (const group of SIZING_GROUP_KEYS) {
      expect(requiredMeasurementsFor(group)).toEqual(requiredMeasurementsFor(group, "unisex"));
    }
  });
});
