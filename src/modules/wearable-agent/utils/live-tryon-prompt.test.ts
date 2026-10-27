import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/commerce/types";
import { LIVE_TRYON_PROMPT_MAX_CHARS, buildLookTryOnPrompt, lookUsageName } from "./live-tryon-prompt";
import { sessionSeconds } from "./live-session-seconds";
import {
  REFERENCE_IMAGE_MAX_BYTES,
  fitWithin,
  hasTranslucentPixels,
  needsPreparation,
} from "./reference-image";

let counter = 0;
const product = (name: string): Product =>
  ({ id: `p${++counter}`, name, description: "", imageUrl: "https://example.com/a.jpg" }) as Product;

describe("buildLookTryOnPrompt", () => {
  it("names a single item", () => {
    expect(buildLookTryOnPrompt([product("Navy Hoodie")])).toBe("Substitute the outfit with Navy Hoodie.");
  });

  it("joins two and three items the way a person would", () => {
    expect(buildLookTryOnPrompt([product("Navy Hoodie"), product("Chinos")])).toBe(
      "Substitute the outfit with Navy Hoodie and Chinos."
    );
    expect(buildLookTryOnPrompt([product("Navy Hoodie"), product("Chinos"), product("White Sneakers")])).toBe(
      "Substitute the outfit with Navy Hoodie, Chinos and White Sneakers."
    );
  });

  it("returns an empty prompt for a look with nothing nameable", () => {
    expect(buildLookTryOnPrompt([])).toBe("");
    expect(buildLookTryOnPrompt([product("   "), product("<b></b>")])).toBe("");
  });

  it("strips markup and entities from names and skips repeats", () => {
    const prompt = buildLookTryOnPrompt([
      product("<b>Wool &amp; Cashmere Coat</b>"),
      product("wool & cashmere coat"),
      product("Slim Jeans."),
    ]);
    expect(prompt).toBe("Substitute the outfit with Wool & Cashmere Coat and Slim Jeans.");
    expect(prompt).not.toMatch(/<|&amp;/);
  });

  it("asks for one thing only and does not tell the model to preserve the person", () => {
    const prompt = buildLookTryOnPrompt([product("Navy Hoodie"), product("Chinos")]);
    expect(prompt).not.toMatch(/preserve|identity|pose|surroundings/i);
    expect(prompt.match(/Substitute|Add /g)).toHaveLength(1);
  });

  it("stays under Decart's roughly 750 character limit with many or very long names", () => {
    const long = "word ".repeat(400);
    const longOnes = buildLookTryOnPrompt([product(long), product(`${long}x`), product(`${long}y`)]);
    expect(longOnes.length).toBeLessThanOrEqual(LIVE_TRYON_PROMPT_MAX_CHARS);
    expect(longOnes.endsWith(".")).toBe(true);

    const many = buildLookTryOnPrompt(
      Array.from({ length: 40 }, (_, i) => product(`Linen Overshirt In Sage Green Number ${i + 1}`))
    );
    expect(many.length).toBeLessThanOrEqual(LIVE_TRYON_PROMPT_MAX_CHARS);
    expect(many.startsWith("Substitute the outfit with Linen Overshirt In Sage Green Number 1,")).toBe(true);
    expect(many.endsWith(".")).toBe(true);
  });
});

describe("buildLookTryOnPrompt visible details", () => {
  const detailed = (name: string, extra: Partial<Product>): Product => ({ ...product(name), ...extra }) as Product;

  it("adds the visible details the catalog records, in a stable order", () => {
    const hoodie = detailed("Navy Hoodie", {
      attributes: { fit: ["relaxed"], material: ["Cotton fleece"], collar: ["Hooded"] },
    });
    expect(buildLookTryOnPrompt([hoodie])).toBe(
      "Substitute the outfit with Navy Hoodie (cotton fleece, relaxed fit, hooded)."
    );
  });

  it("names the garment type from its leaf only when the title leaves it out", () => {
    expect(buildLookTryOnPrompt([detailed("Aero Classic", { garmentLeaf: "polo-shirt" })])).toBe(
      "Substitute the outfit with Aero Classic (polo shirt)."
    );
    expect(buildLookTryOnPrompt([detailed("Classic Polo Shirt", { garmentLeaf: "polo-shirt" })])).toBe(
      "Substitute the outfit with Classic Polo Shirt."
    );
    expect(buildLookTryOnPrompt([detailed("Classic Tee", { garmentLeaf: "other" })])).toBe(
      "Substitute the outfit with Classic Tee."
    );
  });

  it("skips a detail the title already says", () => {
    const tee = detailed("Navy Cotton Tee", { attributes: { color: ["Navy"], material: ["Cotton"], fit: ["Slim"] } });
    expect(buildLookTryOnPrompt([tee])).toBe("Substitute the outfit with Navy Cotton Tee (slim fit).");
  });

  it("ignores an attribute with several values, since nothing says which one is in the picture", () => {
    const tee = detailed("Everyday Tee", { attributes: { color: ["Red", "Blue", "Black"], material: ["Linen"] } });
    expect(buildLookTryOnPrompt([tee])).toBe("Substitute the outfit with Everyday Tee (linen).");
  });

  it("never reads internal or non-visual catalog keys as a detail", () => {
    const tee = detailed("Everyday Tee", {
      attributes: {
        merchant_id: ["abc123"],
        fit_rows: ["row-1"],
        fit_chest_cm: ["102"],
        size: ["M"],
        persona_publish_id: ["run-9"],
        opt_collar_type: ["Crew neck"],
      },
    });
    expect(buildLookTryOnPrompt([tee])).toBe("Substitute the outfit with Everyday Tee (crew neck).");
  });

  it("drops details from the last items first, then whole items, to stay within the limit", () => {
    const wide = (i: number) =>
      detailed(`Garment ${i} ${"x".repeat(60)}`, {
        attributes: { material: ["m".repeat(28)], fit: ["f".repeat(28)], collar: ["c".repeat(28)] },
      });
    const prompt = buildLookTryOnPrompt([wide(1), wide(2), wide(3), wide(4)]);
    expect(prompt.length).toBeLessThanOrEqual(LIVE_TRYON_PROMPT_MAX_CHARS);
    expect(prompt.endsWith(".")).toBe(true);
    // Every item is still named; only the trailing details were given up.
    expect(prompt.match(/Garment \d/g)).toHaveLength(4);
    expect(prompt).toContain("Garment 1");
    expect(prompt.indexOf("(")).toBeGreaterThan(-1);
    expect(prompt.lastIndexOf("(")).toBeLessThan(prompt.indexOf("Garment 4"));
  });

  it("keeps asking for one thing only", () => {
    const prompt = buildLookTryOnPrompt([
      detailed("Navy Hoodie", { attributes: { fit: ["relaxed"] } }),
      detailed("Chinos", { attributes: { color: ["Beige"] } }),
    ]);
    expect(prompt).toBe("Substitute the outfit with Navy Hoodie (relaxed fit) and Chinos (beige).");
    expect(prompt).not.toMatch(/preserve|identity|pose|surroundings/i);
    expect(prompt.match(/Substitute|Add /g)).toHaveLength(1);
  });
});

describe("lookUsageName", () => {
  it("lists the items and stays a sane length", () => {
    expect(lookUsageName([product("Hoodie"), product("Chinos")])).toBe("Look: Hoodie, Chinos");
    expect(lookUsageName([])).toBe("Look");
    expect(lookUsageName(Array.from({ length: 60 }, () => product("A Very Long Garment Name"))).length).toBeLessThanOrEqual(200);
  });
});

describe("sessionSeconds", () => {
  it("adds the seconds carried over from earlier connections", () => {
    expect(sessionSeconds(0, 25)).toBe(25);
    expect(sessionSeconds(60, 20)).toBe(80);
  });

  it("does not lose time when the tick restarts after a camera flip", () => {
    const beforeFlip = sessionSeconds(0, 60);
    const afterFlip = sessionSeconds(beforeFlip, 0);
    expect(afterFlip).toBe(60);
    expect(sessionSeconds(beforeFlip, 30)).toBe(90);
  });

  it("ignores junk input", () => {
    expect(sessionSeconds(Number.NaN, 10)).toBe(10);
    expect(sessionSeconds(-5, 10)).toBe(10);
    expect(sessionSeconds(10, Number.NaN)).toBe(10);
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

  it("flattens a transparent cut-out even when it is otherwise in spec", () => {
    const ok = { type: "image/png", size: 400_000, width: 1200, height: 1600 };
    expect(needsPreparation({ ...ok, transparent: true })).toBe(true);
    expect(needsPreparation({ ...ok, transparent: false })).toBe(false);
  });

  it("detects see-through pixels", () => {
    const opaque = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const cutout = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0]);
    expect(hasTranslucentPixels(opaque)).toBe(false);
    expect(hasTranslucentPixels(cutout)).toBe(true);
  });
});
