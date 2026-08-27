import { describe, expect, it } from "vitest";
import { matchCategoryWords, matchesFullOutfitPhrase } from "./category-keywords";

describe("matchCategoryWords", () => {
  it("finds every distinct category named in the message", () => {
    expect(matchCategoryWords("I need a shirt and some pants")).toEqual(["tops", "bottoms"]);
  });

  it("returns nothing for a message naming no garment category", () => {
    expect(matchCategoryWords("something nice for a wedding")).toEqual([]);
  });

  it("matches whole words only", () => {
    // "cap" must not match inside "capable" or similar.
    expect(matchCategoryWords("I need something capable of handling rain")).toEqual([]);
  });

  it("dedupes repeated mentions of the same category", () => {
    expect(matchCategoryWords("a shirt, maybe a tee, or a polo")).toEqual(["tops"]);
  });

  it("does not treat 'outfit'/'bundle' words as a garment", () => {
    // These are handled by matchesFullOutfitPhrase, not as a category name themselves.
    expect(matchCategoryWords("build me a full outfit bundle")).toEqual([]);
  });
});

describe("matchesFullOutfitPhrase", () => {
  it("recognises 'full outfit', the app's own quick-reply chip label", () => {
    expect(matchesFullOutfitPhrase("A full outfit")).toBe(true);
  });

  it("recognises a bare request to build a bundle", () => {
    expect(matchesFullOutfitPhrase("Can you build me a bundle?")).toBe(true);
  });

  it("recognises 'look' and 'set' phrasing", () => {
    expect(matchesFullOutfitPhrase("put together a whole look for me")).toBe(true);
    expect(matchesFullOutfitPhrase("do the full set")).toBe(true);
  });

  it("returns false for a message naming specific garments only", () => {
    expect(matchesFullOutfitPhrase("I need a shirt and some pants")).toBe(false);
  });

  it("returns false for an unrelated occasion word", () => {
    expect(matchesFullOutfitPhrase("Work")).toBe(false);
  });
});
