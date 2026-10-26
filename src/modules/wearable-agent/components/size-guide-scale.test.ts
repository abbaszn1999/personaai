import { describe, expect, it } from "vitest";
import { hasListedSizes, sizeScaleFor } from "./size-guide-modal";

const product = (size?: string[], variantLabels: string[] = []) =>
  ({
    variants: variantLabels.map((label) => ({ type: "size", label })),
    attributes: size ? { size } : undefined,
  }) as unknown as Parameters<typeof sizeScaleFor>[0];

describe("sizeScaleFor", () => {
  it("lays out the product's own numeric sizes in order, not the letter scale", () => {
    expect(sizeScaleFor(product(["28", "31", "36", "29", "30", "32"]), "36")).toEqual(["28", "29", "30", "31", "32", "36"]);
  });

  it("orders letter sizes from small to large", () => {
    expect(sizeScaleFor(product(["XL", "S", "2XL", "M", "L"]), "M")).toEqual(["S", "M", "L", "XL", "2XL"]);
  });

  it("prefers variant labels when there are any", () => {
    expect(sizeScaleFor(product(["S"], ["M", "L"]), "M")).toEqual(["M", "L"]);
  });

  it("lets sizes be picked only when the product lists its own", () => {
    expect(hasListedSizes(product(["S", "M"]))).toBe(true);
    expect(hasListedSizes(product(undefined, ["M"]))).toBe(true);
    expect(hasListedSizes(product())).toBe(false);
  });

  it("falls back to the letter scale only for a letter recommendation", () => {
    expect(sizeScaleFor(product(), "M")).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(sizeScaleFor(product(), "36")).toEqual(["36"]);
  });
});
