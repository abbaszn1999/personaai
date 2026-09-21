import { describe, expect, it } from "vitest";
import { resolveCategoryIds } from "@/lib/catalog/resolve-category";
import { buildQueryFallbackChain } from "@/lib/catalog/query-helpers";
import { buildShopifyCollectionFilter } from "@/lib/shopify/client";
import { parseBudgetMax } from "@/lib/recommendations/parse-budget";
import { rankProducts } from "@/lib/recommendations/rank-products";
import { selectBundleItems } from "@/lib/recommendations/select-bundle";
import { recommendSizeForProduct } from "@/lib/recommendations/size-for-product";
import type { Product } from "@/modules/commerce/types";
import type { WearableChatProfileContext } from "@/lib/agents/wearable/persona/types";

function makeProduct(overrides: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    description: "",
    price: 50,
    currency: "USD",
    imageUrl: "https://example.com/p.jpg",
    categoryId: "1",
    tags: [],
    variants: [],
    rating: 0,
    reviewCount: 0,
    inStock: true,
    ...overrides,
  };
}

const profile: WearableChatProfileContext = {
  heightCm: 180,
  weightKg: 75,
  chestCm: 100,
  waistCm: 80,
  shoeSizeEu: 42,
  photoBase64: null,
  photoMimeType: null,
  avatarUrl: null,
  isCustomAvatar: false,
};

describe("resolveCategoryIds", () => {
  const categories = [
    { id: "42", name: "Jackets", productCount: 4 },
    { id: "27", name: "Jackets", productCount: 4 },
    { id: "34", name: "Men", productCount: 10 },
    { id: "52", name: "Women", productCount: 10 },
  ];

  it("returns all ids for a duplicate category name", () => {
    expect(resolveCategoryIds(categories, "Jackets", "")).toEqual(["42", "27"]);
  });

  it("does not match Women against Men", () => {
    expect(resolveCategoryIds(categories, "Women", "")).toEqual(["52"]);
    expect(resolveCategoryIds(categories, "Men", "")).toEqual(["34"]);
  });

  it("resolves category names mentioned in free-text queries", () => {
    expect(resolveCategoryIds(categories, undefined, "show me jackets please")).toEqual(["42", "27"]);
  });

  it("resolves possessive category names like Men's/Women's against plain-text queries", () => {
    const possessiveCategories = [
      { id: "1", name: "Men's", productCount: 260 },
      { id: "2", name: "Women's", productCount: 682 },
    ];
    expect(resolveCategoryIds(possessiveCategories, undefined, "i need men cloth")).toEqual(["1"]);
    expect(resolveCategoryIds(possessiveCategories, undefined, "i need a women dress")).toEqual(["2"]);
    expect(resolveCategoryIds(possessiveCategories, "Men's", "")).toEqual(["1"]);
  });
});

describe("buildQueryFallbackChain", () => {
  it("strips filler words and keeps significant keywords", () => {
    const chain = buildQueryFallbackChain("show me products in jackets category");
    expect(chain[0]).toBe("show me products in jackets category");
    expect(chain).toContain("jackets");
    // Fallback variants after the original phrase should not keep stopwords like "category".
    expect(chain.slice(1).every((q) => !q.split(/\s+/).includes("category"))).toBe(true);
  });
});

describe("buildShopifyCollectionFilter", () => {
  it("builds OR filters for multiple collection ids", () => {
    expect(buildShopifyCollectionFilter("42,27")).toBe("(collection_id:42 OR collection_id:27)");
  });

  it("keeps a single collection id simple", () => {
    expect(buildShopifyCollectionFilter("42")).toBe("collection_id:42");
  });
});

describe("parseBudgetMax", () => {
  it("parses under/max/range budgets", () => {
    expect(parseBudgetMax("Under $300")).toBe(300);
    expect(parseBudgetMax("$300 – $600")).toBe(600);
    expect(parseBudgetMax("No limit")).toBeNull();
  });
});

describe("rankProducts", () => {
  it("ranks in-stock query matches above unrelated out-of-stock items", () => {
    const products = [
      makeProduct({ id: "b", name: "Random belt", inStock: false, price: 20 }),
      makeProduct({ id: "a", name: "Leather jacket", inStock: true, price: 120, tags: ["leather"] }),
      makeProduct({ id: "c", name: "Denim jacket", inStock: true, price: 90 }),
    ];

    const ranked = rankProducts(products, {
      profile,
      intake: { style: "classic", budget: "Under $200" },
      query: "leather jacket",
      matchType: "exact",
      categories: [],
    });

    expect(ranked[0].product.id).toBe("a");
    expect(ranked.map((r) => r.product.id)).toEqual(["a", "c", "b"]);
  });

  it("is deterministic for equal scores", () => {
    const products = [
      makeProduct({ id: "z", name: "Item Z" }),
      makeProduct({ id: "a", name: "Item A" }),
    ];
    const ranked = rankProducts(products, {
      profile,
      intake: {},
      query: "",
      matchType: "broad",
      categories: [],
    });
    expect(ranked.map((r) => r.product.id)).toEqual(["a", "z"]);
  });
});

describe("selectBundleItems", () => {
  it("picks one item per search bucket and never stacks two jackets", () => {
    const jackets = [
      makeProduct({ id: "j1", name: "Sherpa jacket", price: 120 }),
      makeProduct({ id: "j2", name: "Cotton/Lyocell jacktet", price: 95 }),
    ];
    const shoes = [
      makeProduct({ id: "s1", name: "Leather derby shoes", price: 110 }),
      makeProduct({ id: "s2", name: "Chunky trainers", price: 60 }),
    ];

    const picked = selectBundleItems([jackets, shoes], {
      profile,
      intake: { budget: "Under $400", style: "classic" },
      categories: [],
    });

    expect(picked).toHaveLength(2);
    expect(picked.filter((p) => /jacket|jacktet/i.test(p.name))).toHaveLength(1);
    expect(picked.filter((p) => /shoe|trainer|derby/i.test(p.name))).toHaveLength(1);
  });

  it("never fills a bundle slot with a non-wearable item like a fragrance", () => {
    const jackets = [makeProduct({ id: "j1", name: "Tailored Jacket", price: 120 })];
    const shirts = [makeProduct({ id: "t1", name: "Oxford Shirt", price: 50 })];
    const fragrances = [makeProduct({ id: "f1", name: "Zippo Original Blue Turquoise EDT", price: 29 })];

    const picked = selectBundleItems([jackets, shirts, fragrances], {
      profile,
      intake: { budget: "Under $400", style: "classic" },
      categories: [],
    });

    expect(picked.map((p) => p.id)).toEqual(["j1", "t1"]);
  });

  it("keeps outerwear, a shirt, and shoes as three distinct bundle slots", () => {
    const jackets = [makeProduct({ id: "j1", name: "Tailored Jacket", price: 120 })];
    const shirts = [makeProduct({ id: "t1", name: "Oxford Shirt", price: 50 })];
    const shoes = [makeProduct({ id: "s1", name: "Leather Derby Shoes", price: 100 })];

    const picked = selectBundleItems([jackets, shirts, shoes], {
      profile,
      intake: { budget: "Under $400", style: "classic" },
      categories: [],
    });

    expect(picked.map((p) => p.id)).toEqual(["j1", "t1", "s1"]);
  });
});

describe("recommendSizeForProduct", () => {
  it("uses EU shoe size for shoes and letter size for apparel", () => {
    expect(recommendSizeForProduct(profile, makeProduct({ id: "1", name: "Running Shoes" }))).toBe("EU 42");
    expect(recommendSizeForProduct(profile, makeProduct({ id: "2", name: "Oxford Shirt" }))).toMatch(/^(XS|S|M|L|XL)$/);
  });
});
