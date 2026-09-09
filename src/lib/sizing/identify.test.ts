import { describe, expect, it, vi } from "vitest";
import { parseIdentification } from "./identify";

// The parser is the whole risk surface here: the call itself is a schema-constrained request, but a
// response that lines up wrongly would brand every product with its neighbour's name and look
// entirely successful doing it.
describe("parseIdentification", () => {
  it("reads brands into their indexed positions", () => {
    const text = JSON.stringify({
      products: [
        { index: 1, brand: "Nike" },
        { index: 2, brand: "Levi's" },
      ],
    });

    expect(parseIdentification(text, 2)).toEqual(["Nike", "Levi's"]);
  });

  it("places brands by index rather than by arrival order", () => {
    // A reordered response must not shift every brand onto the wrong product.
    const text = JSON.stringify({
      products: [
        { index: 3, brand: "Zara" },
        { index: 1, brand: "Nike" },
      ],
    });

    expect(parseIdentification(text, 3)).toEqual(["Nike", null, "Zara"]);
  });

  it("leaves a product unbranded when the model returns an empty answer", () => {
    // The schema asks for "" rather than a string/null union, which Gemini's structured output does
    // not accept reliably. A literal null is still tolerated in case the model sends one anyway.
    const text = JSON.stringify({
      products: [
        { index: 1, brand: "" },
        { index: 2, brand: "Adidas" },
        { index: 3, brand: null },
      ],
    });

    expect(parseIdentification(text, 3)).toEqual([null, "Adidas", null]);
  });

  it("treats null-ish strings as no brand", () => {
    // A brand literally named "unknown" would otherwise become a coverage row and a paid chart
    // request for a company that does not exist.
    const text = JSON.stringify({
      products: [
        { index: 1, brand: "null" },
        { index: 2, brand: "N/A" },
        { index: 3, brand: "Unbranded" },
        { index: 4, brand: "   " },
      ],
    });

    expect(parseIdentification(text, 4)).toEqual([null, null, null, null]);
  });

  it("trims surrounding whitespace so the same brand keys together", () => {
    const text = JSON.stringify({ products: [{ index: 1, brand: "  Uniqlo  " }] });
    expect(parseIdentification(text, 1)).toEqual(["Uniqlo"]);
  });

  it("ignores entries outside the batch", () => {
    const text = JSON.stringify({
      products: [
        { index: 0, brand: "Ghost" },
        { index: 5, brand: "Ghost" },
        { index: 1, brand: "Real" },
      ],
    });

    expect(parseIdentification(text, 2)).toEqual(["Real", null]);
  });

  it("returns all nulls for unusable responses rather than throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(parseIdentification("not json", 3)).toEqual([null, null, null]);
    expect(parseIdentification(JSON.stringify({ nope: [] }), 2)).toEqual([null, null]);

    spy.mockRestore();
  });

  it("keeps the good half of a partly malformed response", () => {
    const text = JSON.stringify({
      products: [{ index: 1, brand: "Nike" }, { index: 2 }, { brand: "Orphan" }, { index: 3, brand: 42 }],
    });

    expect(parseIdentification(text, 3)).toEqual(["Nike", null, null]);
  });
});
