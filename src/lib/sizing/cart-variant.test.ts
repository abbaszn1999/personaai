import { describe, expect, it } from "vitest";
import { pickSizedVariant, type VariantOption } from "./cart-variant";

interface V {
  id: number;
  options: VariantOption[];
  stock: boolean;
}

const v = (id: number, stock: boolean, ...options: Array<[string, string]>): V => ({
  id,
  stock,
  options: options.map(([name, value]) => ({ name, value })),
});

const pick = (variants: V[], sizes: string[]) =>
  pickSizedVariant(variants, sizes, (variant) => variant.options, (variant) => variant.stock)?.id ?? null;

describe("pickSizedVariant", () => {
  it("picks the fitted size, not the first in-stock variant", () => {
    const variants = [v(1, true, ["Size", "S"]), v(2, true, ["Size", "M"]), v(3, true, ["Size", "L"])];
    expect(pick(variants, ["M"])).toBe(2);
  });

  it("matches the store's own spelling of the chart label", () => {
    expect(pick([v(1, true, ["Size", "Small"]), v(2, true, ["Size", "Medium"])], ["M"])).toBe(2);
    expect(pick([v(1, true, ["Size", "M (38)"])], ["M"])).toBe(1);
    expect(pick([v(1, true, ["Waist", "30"]), v(2, true, ["Size", "32"])], ["32"])).toBe(2);
  });

  it("falls to the next fitting size when the first sold out, and never to a non-fitting one", () => {
    const variants = [v(1, true, ["Size", "S"]), v(2, false, ["Size", "M"]), v(3, true, ["Size", "L"])];
    expect(pick(variants, ["M", "L"])).toBe(3);
    expect(pick(variants, ["M"])).toBeNull();
  });

  it("ignores colour options when a size option exists", () => {
    const variants = [v(1, true, ["Color", "M"], ["Size", "S"]), v(2, true, ["Color", "Blue"], ["Size", "M"])];
    expect(pick(variants, ["M"])).toBe(2);
  });

  it("compares every option when none is named like a size", () => {
    expect(pick([v(1, true, ["Title", "S"]), v(2, true, ["Title", "M"])], ["M"])).toBe(2);
  });
});
