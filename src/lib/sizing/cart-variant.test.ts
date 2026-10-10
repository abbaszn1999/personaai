import { describe, expect, it } from "vitest";
import { pickSizedVariant, soldOutMessage, type VariantOption } from "./cart-variant";

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

describe("pickSizedVariant with the shopper's colour", () => {
  const pickIn = (variants: V[], sizes: string[], colors: string[]) =>
    pickSizedVariant(variants, sizes, (variant) => variant.options, (variant) => variant.stock, colors)?.id ?? null;
  const shirt = [
    v(1, true, ["Color", "White"], ["Size", "M"]),
    v(2, true, ["Color", "Navy"], ["Size", "S"]),
    v(3, true, ["Color", "Navy"], ["Size", "M"]),
    v(4, true, ["Color", "Navy"], ["Size", "L"]),
  ];

  it("adds the fitting size in the colour the shopper asked for, not the first colour in stock", () => {
    expect(pickIn(shirt, ["M", "L"], ["Navy"])).toBe(3);
  });

  it("reads the colour the way the catalog spells it", () => {
    expect(pickIn(shirt, ["M"], ["NAVY"])).toBe(3);
    expect(pickIn(shirt, ["M"], ["N.BLUE"])).toBe(3);
    expect(pickIn([v(1, true, ["Colour", "Light Grey"], ["Size", "M"])], ["M"], ["L.GRAY"])).toBe(1);
    expect(pickIn([v(1, true, ["Color", "White"], ["Size", "M"]), v(2, true, ["Color", "Light Blue"], ["Size", "M"])], ["M"], ["Blue"])).toBe(2);
  });

  it("moves to the next fitting size in that colour before ever changing the colour", () => {
    const soldOut = shirt.map((variant) => (variant.id === 3 ? { ...variant, stock: false } : variant));
    expect(pickIn(soldOut, ["M", "L"], ["Navy"])).toBe(4);
  });

  it("adds nothing rather than another colour when the colour has no fitting size left", () => {
    const soldOut = shirt.map((variant) => (variant.id === 3 || variant.id === 4 ? { ...variant, stock: false } : variant));
    expect(pickIn(soldOut, ["M", "L"], ["Navy"])).toBeNull();
  });

  it("narrows nothing when no colour option carries the colour", () => {
    expect(pickIn(shirt, ["M"], ["Red"])).toBe(1);
    expect(pickIn([v(1, true, ["Size", "S"]), v(2, true, ["Size", "M"])], ["M"], ["Navy"])).toBe(2);
  });

  it("never mistakes a word inside another colour for it", () => {
    expect(pickIn([v(1, true, ["Color", "Titanium"], ["Size", "M"]), v(2, true, ["Color", "Tan"], ["Size", "M"])], ["M"], ["Tan"])).toBe(2);
  });
});

describe("soldOutMessage", () => {
  it("names the sizes, and the colour when the shopper chose one", () => {
    expect(soldOutMessage(["M", "L"])).toBe("Size M / L just sold out for this item.");
    expect(soldOutMessage(["M"], ["Navy"])).toBe("Size M in Navy just sold out for this item.");
  });
});
