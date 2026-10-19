import { describe, expect, it } from "vitest";
import { PERSONA_LINE_PROPERTY } from "@/lib/attribution/constants";
import { linesToRemove } from "./ajax-cart-client";

describe("linesToRemove", () => {
  it("returns only the lines of the variant", () => {
    const keys = linesToRemove(
      [
        { key: "a:1", variant_id: 10 },
        { key: "b:2", variant_id: 11 },
      ],
      10
    );
    expect(keys).toEqual(["a:1"]);
  });

  it("prefers the line Persona added over one the shopper added themselves", () => {
    const keys = linesToRemove(
      [
        { key: "own:1", variant_id: 10 },
        { key: "ours:2", variant_id: 10, properties: { [PERSONA_LINE_PROPERTY]: "x" } },
      ],
      10
    );
    expect(keys).toEqual(["ours:2"]);
  });

  it("returns nothing when the variant is already out of the cart", () => {
    expect(linesToRemove([{ key: "a:1", variant_id: 10 }], 99)).toEqual([]);
  });
});
