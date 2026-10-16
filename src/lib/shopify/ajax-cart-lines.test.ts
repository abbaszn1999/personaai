import { describe, expect, it } from "vitest";
import { PERSONA_LINE_PROPERTY } from "@/lib/attribution/constants";
import { linesToRemove } from "./ajax-cart-client";
import { wooLineKeys } from "@/lib/woocommerce/store-api-client";

describe("linesToRemove (Shopify)", () => {
  it("removes only the lines Persona added when there are any", () => {
    const lines = [
      { key: "a", variant_id: 1, properties: { [PERSONA_LINE_PROPERTY]: "tag" } },
      { key: "b", variant_id: 1, properties: null },
      { key: "c", variant_id: 2, properties: { [PERSONA_LINE_PROPERTY]: "tag" } },
    ];
    expect(linesToRemove(lines, 1)).toEqual(["a"]);
  });

  it("removes every line of the variant when none carry the property", () => {
    const lines = [
      { key: "a", variant_id: 1 },
      { key: "b", variant_id: 1 },
      { key: "c", variant_id: 2 },
    ];
    expect(linesToRemove(lines, 1)).toEqual(["a", "b"]);
  });

  it("is empty for a variant that is not in the cart", () => {
    expect(linesToRemove([{ key: "a", variant_id: 1 }], 9)).toEqual([]);
  });
});

describe("wooLineKeys (WooCommerce)", () => {
  it("returns the keys of the lines holding the item", () => {
    const lines = [
      { key: "k1", id: 10 },
      { key: "k2", id: 11 },
      { key: "k3", id: 10 },
      { id: 10 },
    ];
    expect(wooLineKeys(lines, 10)).toEqual(["k1", "k3"]);
  });
});
