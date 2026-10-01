import { describe, expect, it } from "vitest";
import { parseTypedBudget } from "./typed-budget";

describe("parseTypedBudget", () => {
  it("reads a bare amount in the ways shoppers type it", () => {
    expect(parseTypedBudget("200")).toBe(200);
    expect(parseTypedBudget("$150")).toBe(150);
    expect(parseTypedBudget("200 aed")).toBe(200);
    expect(parseTypedBudget("my budget is 300")).toBe(300);
    expect(parseTypedBudget("99.5")).toBe(99.5);
    expect(parseTypedBudget("under 250 dollars")).toBe(250);
    expect(parseTypedBudget("AED 400")).toBe(400);
  });

  it("reads a no-limit answer as null", () => {
    expect(parseTypedBudget("no limit")).toBeNull();
    expect(parseTypedBudget("No budget.")).toBeNull();
  });

  it("leaves real messages to the agents", () => {
    expect(parseTypedBudget("show me black jeans")).toBeUndefined();
    expect(parseTypedBudget("size 42 shoes")).toBeUndefined();
    expect(parseTypedBudget("0")).toBeUndefined();
  });
});
