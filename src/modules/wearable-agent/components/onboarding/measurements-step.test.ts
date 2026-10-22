import { describe, expect, it } from "vitest";
import { entryReadyToAdvance } from "./measurements-step";

describe("entryReadyToAdvance", () => {
  const height = { min: 120, max: 220 };
  const weight = { min: 30, max: 180 };
  const chest = { min: 60, max: 160 };
  const shoe = { min: 20, max: 52 };
  const age = { min: 0, max: 17 };

  it("waits while a height is still short of three digits", () => {
    expect(entryReadyToAdvance("1", height.min, height.max)).toBe(false);
    expect(entryReadyToAdvance("18", height.min, height.max)).toBe(false);
    expect(entryReadyToAdvance("180", height.min, height.max)).toBe(true);
  });

  it("moves on from a two-digit weight or chest that cannot take another digit", () => {
    expect(entryReadyToAdvance("6", weight.min, weight.max)).toBe(false);
    expect(entryReadyToAdvance("65", weight.min, weight.max)).toBe(true);
    expect(entryReadyToAdvance("15", weight.min, weight.max)).toBe(false);
    expect(entryReadyToAdvance("150", weight.min, weight.max)).toBe(true);
    expect(entryReadyToAdvance("9", chest.min, chest.max)).toBe(false);
    expect(entryReadyToAdvance("90", chest.min, chest.max)).toBe(true);
    expect(entryReadyToAdvance("15", chest.min, chest.max)).toBe(false);
  });

  it("moves on from a two-digit shoe size and a single-digit age", () => {
    expect(entryReadyToAdvance("4", shoe.min, shoe.max)).toBe(false);
    expect(entryReadyToAdvance("42", shoe.min, shoe.max)).toBe(true);
    expect(entryReadyToAdvance("1", age.min, age.max)).toBe(false);
    expect(entryReadyToAdvance("6", age.min, age.max)).toBe(true);
    expect(entryReadyToAdvance("12", age.min, age.max)).toBe(true);
  });
});
