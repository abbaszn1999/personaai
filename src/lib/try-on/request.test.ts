import { describe, expect, it } from "vitest";
import { MAX_TRY_ON_GARMENTS } from "./image-generation";
import { parseTryOnGarments } from "./request";

describe("parseTryOnGarments", () => {
  it("reads garments with slot and leaf", () => {
    expect(
      parseTryOnGarments({ garments: [{ imageUrl: "https://x/a.jpg", slot: "top", leaf: "polo-shirt" }] })
    ).toEqual([{ name: "garment", slot: "top", leaf: "polo-shirt", imageUrl: "https://x/a.jpg" }]);
  });

  it("treats an invalid slot as other and drops an empty or oversized leaf", () => {
    const parsed = parseTryOnGarments({
      garments: [
        { imageUrl: "https://x/a.jpg", slot: "hat", leaf: "" },
        { imageUrl: "https://x/b.jpg", slot: "top", leaf: "x".repeat(61) },
      ],
    });

    expect(parsed?.map((g) => g.slot)).toEqual(["other", "top"]);
    expect(parsed?.every((g) => g.leaf === undefined)).toBe(true);
  });

  it("still accepts the older garmentImageUrls shape as unclassified garments", () => {
    expect(parseTryOnGarments({ garmentImageUrls: ["https://x/a.jpg"] })).toEqual([
      { name: "garment", slot: "other", imageUrl: "https://x/a.jpg" },
    ]);
  });

  it("returns null for a missing, empty or malformed garment list", () => {
    expect(parseTryOnGarments({})).toBeNull();
    expect(parseTryOnGarments(null)).toBeNull();
    expect(parseTryOnGarments({ garments: [] })).toBeNull();
    expect(parseTryOnGarments({ garments: [{ slot: "top" }] })).toBeNull();
    expect(parseTryOnGarments({ garmentImageUrls: [1] })).toBeNull();
  });

  it("caps the list at the render limit so the estimate and the render agree", () => {
    const urls = Array.from({ length: MAX_TRY_ON_GARMENTS + 4 }, (_, i) => `https://x/${i}.jpg`);

    expect(parseTryOnGarments({ garmentImageUrls: urls })).toHaveLength(MAX_TRY_ON_GARMENTS);
  });
});
