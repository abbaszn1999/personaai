import { describe, expect, it } from "vitest";
import { catalogProgressView } from "./catalog-progress";

describe("catalogProgressView", () => {
  it("shows a normal percentage mid-run", () => {
    expect(catalogProgressView(2205, 2985)).toEqual({ percent: 74, finalizing: false });
  });

  it("never reports 100% while the catalog is still indexing", () => {
    expect(catalogProgressView(2985, 2985)).toEqual({ percent: 99, finalizing: true });
    expect(catalogProgressView(2984, 2985)).toEqual({ percent: 99, finalizing: false });
  });

  it("treats an over-counted tally as finalizing, not as more than done", () => {
    expect(catalogProgressView(3200, 2985)).toEqual({ percent: 99, finalizing: true });
  });

  it("handles an unknown total", () => {
    expect(catalogProgressView(0, 0)).toEqual({ percent: 0, finalizing: false });
  });
});
