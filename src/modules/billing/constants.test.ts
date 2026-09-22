import { describe, expect, it } from "vitest";
import { getPlanTier } from "./constants";

describe("getPlanTier", () => {
  it("returns Trial for an unknown id", () => {
    expect(getPlanTier("fixed").id).toBe("trial");
    expect(getPlanTier("").id).toBe("trial");
  });

  it("matches the commercial include for each plan", () => {
    const trial = getPlanTier("trial");
    expect(trial.monthlySessionUnits).toBe(50_000);
    expect(trial.monthlyLiveTryOnSeconds).toBe(50 * 60);
    expect(trial.monthlyGarmentUnits).toBe(12_500);
    expect(trial.carriesBalance).toBe(false);

    const main = getPlanTier("main");
    expect(main.monthlySessionUnits).toBe(100_000);
    expect(main.carriesBalance).toBe(true);
    expect(main.monthlyLiveTryOnSeconds).toBe(100 * 60);
    expect(main.monthlyGarmentUnits).toBe(25_000);
  });
});
