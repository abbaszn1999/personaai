import { describe, expect, it } from "vitest";
import type { AnchorState } from "@/lib/retrieval/types";
import { buildSystemPrompt } from "./prompt";
import type { WearableChatContext } from "./types";

function context(overrides: Partial<WearableChatContext> = {}): WearableChatContext {
  return {
    userId: "user-1",
    geminiApiKey: "key",
    creditsRemaining: 10,
    categoryScope: ["12"],
    profile: {
      heightCm: null,
      weightKg: null,
      chestCm: null,
      waistCm: null,
      shoeSizeEu: null,
      photoBase64: null,
      photoMimeType: null,
      avatarUrl: null,
      isCustomAvatar: false,
    },
    outfitItems: [],
    knownProducts: [],
    intake: {},
    storeProductCount: 100,
    categories: [],
    connection: null,
    catalogReady: true,
    facets: { categories: [], brands: [], priceRange: null },
    hardRules: [],
    styleGuide: null,
    recentTurns: [],
    anchor: null,
    anchorPinned: false,
    bundleState: null,
    discussedBundleItems: [],
    shownProductIds: [],
    visitorId: "visitor-1",
    ...overrides,
  };
}

function anchor(overrides: Partial<AnchorState> = {}): AnchorState {
  return {
    externalId: "p1",
    productGroupId: null,
    title: "Field Jacket",
    brand: "Acme",
    category: "Men",
    subcategory: "Jackets",
    enrichedDescription: null,
    garmentCategory: null,
    ...overrides,
  };
}

describe("buildSystemPrompt — anchor context", () => {
  it("omits the anchor block entirely when nothing is pinned or discussed", () => {
    const prompt = buildSystemPrompt(context());
    expect(prompt).not.toContain("Title:");
  });

  it("includes title and brand even when there is no description or attributes", () => {
    const prompt = buildSystemPrompt(context({ anchor: anchor() }));
    expect(prompt).toContain("Title: Field Jacket");
    expect(prompt).toContain("Brand: Acme");
  });

  it("includes price when the anchor is also in knownProducts", () => {
    const prompt = buildSystemPrompt(
      context({
        anchor: anchor(),
        knownProducts: [
          {
            id: "p1",
            name: "Field Jacket",
            description: "",
            price: 129,
            currency: "USD",
            imageUrl: "https://cdn.example.com/jacket.jpg",
            categoryId: "jackets",
            tags: [],
            variants: [],
            rating: 0,
            reviewCount: 0,
            inStock: true,
          },
        ],
      })
    );
    expect(prompt).toContain("Price: USD 129");
  });

  it("renders whatever description and store-specific attribute keys the anchor actually has", () => {
    const prompt = buildSystemPrompt(
      context({
        anchor: anchor({
          enrichedDescription: "A rugged shell built for wet-weather commutes.",
          // Deliberately not colour/size, to prove nothing here assumes a fixed attribute list.
          attributes: { collar_type: ["Mandarin"], inseam: ["30in", "32in"] },
        }),
      })
    );

    expect(prompt).toContain("Description: A rugged shell built for wet-weather commutes.");
    expect(prompt).toContain("collar_type: Mandarin");
    expect(prompt).toContain("inseam: 30in, 32in");
  });

  it("skips an attribute key whose values are empty", () => {
    const prompt = buildSystemPrompt(context({ anchor: anchor({ attributes: { fit: [] } }) }));
    expect(prompt).not.toContain("fit:");
  });
});
