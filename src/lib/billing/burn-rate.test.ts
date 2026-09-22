import { describe, expect, it } from "vitest";
import { projectUsage } from "./burn-rate";

const DAY = 86_400_000;

describe("projectUsage", () => {
  it("projects the cycle from usage so far and the elapsed fraction", () => {
    const projection = projectUsage({
      used: 100,
      elapsedMs: 10 * DAY,
      cycleLengthMs: 30 * DAY,
      remaining: 50,
    });
    expect(projection.dailyBurn).toBe(10);
    expect(projection.projectedCycleTotal).toBe(300);
    expect(projection.daysOfBalance).toBe(5);
  });

  it("does not invent a burn before any usage or elapsed time", () => {
    expect(projectUsage({ used: 0, elapsedMs: 10 * DAY, cycleLengthMs: 30 * DAY, remaining: 100 })).toEqual({
      dailyBurn: 0,
      projectedCycleTotal: 0,
      daysOfBalance: null,
    });
    expect(projectUsage({ used: 40, elapsedMs: 0, cycleLengthMs: 30 * DAY, remaining: 10 })).toEqual({
      dailyBurn: 0,
      projectedCycleTotal: 40,
      daysOfBalance: null,
    });
  });
});
