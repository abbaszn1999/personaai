import { describe, expect, it } from "vitest";
import { mergeOutfitGarments, type TryOnGarmentRef } from "./persona-agent";

function ref(name: string, slot: TryOnGarmentRef["slot"]): TryOnGarmentRef {
  return { name, slot, imageUrl: `https://example.com/${name}.jpg` };
}

const names = (garments: TryOnGarmentRef[]) => garments.map((g) => g.name);

describe("mergeOutfitGarments", () => {
  it("dresses from the added items alone when nothing was previously worn", () => {
    expect(names(mergeOutfitGarments([], [ref("Tailored Jacket", "outerwear")]))).toEqual(["Tailored Jacket"]);
  });

  it("keeps unrelated slots on and appends the new item", () => {
    const merged = mergeOutfitGarments(
      [ref("Oxford Shirt", "top"), ref("Chino Pants", "bottom")],
      [ref("Leather Derby Shoes", "shoes")]
    );

    expect(names(merged)).toEqual(["Oxford Shirt", "Chino Pants", "Leather Derby Shoes"]);
  });

  it("drops the kept item whose slot is being replaced, so no category is sent twice", () => {
    const merged = mergeOutfitGarments(
      [ref("Old Sneakers", "shoes"), ref("Oxford Shirt", "top")],
      [ref("New Boots", "shoes")]
    );

    expect(names(merged)).toEqual(["Oxford Shirt", "New Boots"]);
  });

  it("renders the current outfit unchanged when nothing new was added", () => {
    expect(names(mergeOutfitGarments([ref("Oxford Shirt", "top")], []))).toEqual(["Oxford Shirt"]);
  });

  it("returns nothing to render when both sides are empty", () => {
    expect(mergeOutfitGarments([], [])).toEqual([]);
  });

  it("caps the outfit at the number of garment references try-on accepts", () => {
    const many = Array.from({ length: 14 }, (_, i) => ref(`Item ${i}`, "other"));

    expect(mergeOutfitGarments([], many)).toHaveLength(11);
  });
});
