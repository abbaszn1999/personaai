import { describe, expect, it } from "vitest";
import { wooLineKeys } from "./store-api-client";

describe("wooLineKeys", () => {
  it("collects the line keys of the product, since the Store API removes by key", () => {
    expect(
      wooLineKeys(
        [
          { id: 5, key: "k5" },
          { id: 6, key: "k6" },
          { id: 5, key: "k5b" },
        ],
        5
      )
    ).toEqual(["k5", "k5b"]);
  });

  it("ignores lines without a key and returns nothing for an absent product", () => {
    expect(wooLineKeys([{ id: 5 }], 5)).toEqual([]);
    expect(wooLineKeys([{ id: 6, key: "k6" }], 5)).toEqual([]);
  });
});
