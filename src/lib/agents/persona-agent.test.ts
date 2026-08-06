import { describe, expect, it } from "vitest";
import { buildTryOnPrompt, type TryOnGarmentRef } from "./persona-agent";

function ref(name: string, slot: TryOnGarmentRef["slot"]): TryOnGarmentRef {
  return { name, slot, imageUrl: "https://example.com/garment.jpg" };
}

describe("buildTryOnPrompt", () => {
  it("dresses fully from reference images when nothing was previously worn", () => {
    const prompt = buildTryOnPrompt([], [ref("Tailored Jacket", "outerwear")]);

    expect(prompt).toContain("Dress the person in the exact garment(s) shown in the reference image(s)");
    expect(prompt).not.toContain("Replace ONLY");
  });

  it("names exactly what stays and what gets replaced when there is a real diff", () => {
    const kept = [ref("Oxford Shirt", "top"), ref("Chino Pants", "bottom")];
    const added = [ref("Leather Derby Shoes", "shoes")];

    const prompt = buildTryOnPrompt(kept, added);

    expect(prompt).toContain("currently wearing: Oxford Shirt (top), Chino Pants (bottom)");
    expect(prompt).toContain("Replace ONLY the shoes");
    expect(prompt).toContain("Leather Derby Shoes (shoes)");
    expect(prompt).toContain("Keep Oxford Shirt (top), Chino Pants (bottom) and everything else exactly as shown in the avatar photo, unchanged.");
  });

  it("asks for an unchanged render when nothing new was added", () => {
    const kept = [ref("Oxford Shirt", "top")];

    const prompt = buildTryOnPrompt(kept, []);

    expect(prompt).toContain("Render the person exactly as they currently appear in the avatar photo, wearing Oxford Shirt (top), unchanged.");
    expect(prompt).not.toContain("Replace ONLY");
  });

  it("collapses duplicate slots into one replace clause when multiple items share a slot", () => {
    const added = [ref("New Blazer", "outerwear"), ref("New Coat", "outerwear")];

    const prompt = buildTryOnPrompt([ref("Jeans", "bottom")], added);

    expect(prompt).toContain("Replace ONLY the outerwear with");
  });
});
