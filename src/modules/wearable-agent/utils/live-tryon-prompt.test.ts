import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/commerce/types";
import { LIVE_TRYON_PROMPT_MAX_CHARS, buildLiveTryOnPrompt } from "./live-tryon-prompt";
import { REFERENCE_IMAGE_MAX_BYTES, fitWithin, needsPreparation } from "./reference-image";

const product = (partial: Partial<Product> & Pick<Product, "name">): Product =>
  ({ id: "p1", description: "", imageUrl: "https://example.com/a.jpg", ...partial }) as Product;

describe("buildLiveTryOnPrompt", () => {
  it("uses the region wording from Decart's prompting guide", () => {
    expect(buildLiveTryOnPrompt(product({ name: "Navy Hoodie", garmentSlot: "top" }))).toBe(
      "Substitute the upper body garment with Navy Hoodie."
    );
    expect(buildLiveTryOnPrompt(product({ name: "Bomber Jacket", garmentSlot: "outerwear" }))).toMatch(
      /^Substitute the upper body garment with /
    );
    expect(buildLiveTryOnPrompt(product({ name: "Chinos", garmentSlot: "bottom" }))).toMatch(
      /^Substitute the lower body garment with /
    );
    expect(buildLiveTryOnPrompt(product({ name: "White Sneakers", garmentSlot: "shoes" }))).toMatch(
      /^Substitute the footwear with /
    );
  });

  it("replaces the whole outfit for a dress, not just the top", () => {
    expect(buildLiveTryOnPrompt(product({ name: "Red Midi Dress", garmentSlot: "dress" }))).toBe(
      "Substitute the outfit with Red Midi Dress."
    );
  });

  it("substitutes hats and necklaces but adds other accessories on top", () => {
    expect(buildLiveTryOnPrompt(product({ name: "Knit Beanie", garmentSlot: "other" }))).toMatch(
      /^Substitute the hat with /
    );
    expect(buildLiveTryOnPrompt(product({ name: "Gold Pendant Necklace", garmentSlot: "other" }))).toMatch(
      /^Substitute the necklace with /
    );
    expect(buildLiveTryOnPrompt(product({ name: "Leather Shoulder Bag", garmentSlot: "other" }))).toBe(
      "Add Leather Shoulder Bag to the outfit."
    );
  });

  it("asks for one thing only and no longer tells the model to preserve the person", () => {
    const prompt = buildLiveTryOnPrompt(product({ name: "Navy Hoodie", garmentSlot: "top" }));
    expect(prompt).not.toMatch(/preserve|identity|pose|surroundings/i);
    expect(prompt.match(/Substitute|Add /g)).toHaveLength(1);
  });

  it("keeps only the opening sentence of the description, as plain text", () => {
    const prompt = buildLiveTryOnPrompt(
      product({
        name: "Grey Sweatshirt",
        garmentSlot: "top",
        description:
          "<p>A soft crewneck sweatshirt &amp; relaxed fit.</p><p>Free shipping on orders over $50. Machine wash cold.</p>",
      })
    );
    expect(prompt).toBe("Substitute the upper body garment with Grey Sweatshirt, A soft crewneck sweatshirt & relaxed fit.");
    expect(prompt).not.toMatch(/shipping|wash|<|&amp;/);
  });

  it("stays well under Decart's roughly 750 character limit however long the text is", () => {
    const long = "word ".repeat(400);
    for (const slot of ["top", "dress", "other"] as const) {
      const prompt = buildLiveTryOnPrompt(product({ name: long, description: long, garmentSlot: slot }));
      expect(prompt.length).toBeLessThanOrEqual(LIVE_TRYON_PROMPT_MAX_CHARS);
      expect(prompt.endsWith(".")).toBe(true);
    }
    const withLongDescription = buildLiveTryOnPrompt(
      product({ name: "Wool Coat", garmentSlot: "outerwear", description: `${"very ".repeat(200)}warm.` })
    );
    expect(withLongDescription.length).toBeLessThanOrEqual(LIVE_TRYON_PROMPT_MAX_CHARS);
    expect(withLongDescription.startsWith("Substitute the upper body garment with Wool Coat, very")).toBe(true);
  });
});

describe("reference image preparation", () => {
  it("scales a large picture down to 2048 px and never scales one up", () => {
    expect(fitWithin(4096, 2048)).toEqual({ width: 2048, height: 1024, scaled: true });
    expect(fitWithin(1500, 3000)).toEqual({ width: 1024, height: 2048, scaled: true });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(2048, 2048).scaled).toBe(false);
  });

  it("leaves an in-spec picture alone and flags the rest", () => {
    const ok = { type: "image/jpeg", size: 400_000, width: 1200, height: 1600 };
    expect(needsPreparation(ok)).toBe(false);
    expect(needsPreparation({ ...ok, type: "image/png" })).toBe(false);
    expect(needsPreparation({ ...ok, type: "image/webp" })).toBe(false);
    expect(needsPreparation({ ...ok, type: "image/avif" })).toBe(true);
    expect(needsPreparation({ ...ok, type: "image/gif" })).toBe(true);
    expect(needsPreparation({ ...ok, size: REFERENCE_IMAGE_MAX_BYTES + 1 })).toBe(true);
    expect(needsPreparation({ ...ok, width: 3000 })).toBe(true);
  });
});
