import { describe, expect, it } from "vitest";
import { LOOK_IMAGE_MAX_CHARS, parseLookRequest } from "./look-request";
import { LIVE_TRYON_PROMPT_MAX_CHARS, sanitizeDescribedLookPrompt } from "@/modules/wearable-agent/utils/live-tryon-prompt";

describe("parseLookRequest", () => {
  const image = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("reads a picture and the item titles", () => {
    expect(parseLookRequest({ image, itemNames: ["Navy Hoodie", "  Chinos  "] })).toEqual({
      mimeType: "image/jpeg",
      data: "/9j/4AAQSkZJRg==",
      itemNames: ["Navy Hoodie", "Chinos"],
    });
  });

  it("accepts png and webp, and no titles at all", () => {
    expect(parseLookRequest({ image: "data:image/webp;base64,AAAA" })?.itemNames).toEqual([]);
    expect(parseLookRequest({ image: "data:image/png;base64,AAAA" })?.mimeType).toBe("image/png");
  });

  it("refuses anything that is not a small base64 image", () => {
    expect(parseLookRequest(null)).toBeNull();
    expect(parseLookRequest({})).toBeNull();
    expect(parseLookRequest({ image: "https://example.com/a.jpg" })).toBeNull();
    expect(parseLookRequest({ image: "data:image/svg+xml;base64,AAAA" })).toBeNull();
    expect(parseLookRequest({ image: "data:text/html;base64,AAAA" })).toBeNull();
    expect(parseLookRequest({ image: `data:image/jpeg;base64,${"A".repeat(LOOK_IMAGE_MAX_CHARS)}` })).toBeNull();
  });

  it("keeps titles to a sane count and length and drops junk", () => {
    const parsed = parseLookRequest({
      image,
      itemNames: [...Array.from({ length: 30 }, (_, i) => `Item ${i}`), 42, "", "x".repeat(500)],
    });
    expect(parsed?.itemNames).toHaveLength(12);
    expect(parseLookRequest({ image, itemNames: ["x".repeat(500)] })?.itemNames[0]).toHaveLength(120);
  });
});

describe("sanitizeDescribedLookPrompt", () => {
  const good =
    "Substitute the outfit with a navy hooded sweatshirt in a relaxed fit with a kangaroo pocket, slim beige chinos and white low-top leather sneakers.";

  it("passes a clean garment sentence through", () => {
    expect(sanitizeDescribedLookPrompt(good)).toBe(good);
  });

  it("tidies whitespace, quotes and markdown, and adds the closing full stop", () => {
    expect(sanitizeDescribedLookPrompt(`  "**Substitute the outfit with** a red dress"\n`)).toBe(
      "Substitute the outfit with a red dress."
    );
  });

  it("refuses a reply that does not follow the pattern", () => {
    expect(sanitizeDescribedLookPrompt(undefined)).toBeNull();
    expect(sanitizeDescribedLookPrompt("")).toBeNull();
    expect(sanitizeDescribedLookPrompt("Substitute the outfit with")).toBeNull();
    expect(sanitizeDescribedLookPrompt("Add a black beanie to the outfit.")).toBeNull();
    expect(sanitizeDescribedLookPrompt("A navy hoodie and beige chinos.")).toBeNull();
  });

  it("refuses a second sentence, where a stray instruction would hide", () => {
    expect(sanitizeDescribedLookPrompt(`${good} Keep the same pose.`)).toBeNull();
  });

  it("refuses requests about anything but garments", () => {
    expect(sanitizeDescribedLookPrompt("Substitute the outfit with a red dress and keep the same face")).toBeNull();
    expect(sanitizeDescribedLookPrompt("Substitute the outfit with a red dress on a white background")).toBeNull();
    expect(sanitizeDescribedLookPrompt("Substitute the outfit with a red dress, preserve identity")).toBeNull();
  });

  it("refuses a reply too long for Decart rather than cutting a garment off", () => {
    const long = `Substitute the outfit with ${"a very long garment description, ".repeat(30)}and shoes`;
    expect(long.length).toBeGreaterThan(LIVE_TRYON_PROMPT_MAX_CHARS);
    expect(sanitizeDescribedLookPrompt(long)).toBeNull();
  });
});
