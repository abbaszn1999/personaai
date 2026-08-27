import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.PRODUCT_IMAGE_PROXY_SECRET = "product-image-test-secret";
});

describe("signed product image previews", () => {
  it("accepts the exact source URL it signed and rejects tampering", async () => {
    const { isValidProductImageSignature, productImageProxyUrl } = await import("./product-image");
    const source = "https://shop.example.com/wp-content/uploads/item.webp";
    const proxy = new URL(productImageProxyUrl(source), "https://app.example.com");
    const signedUrl = proxy.searchParams.get("url") ?? "";
    const signature = proxy.searchParams.get("sig") ?? "";

    expect(signedUrl).toBe(source);
    expect(isValidProductImageSignature(signedUrl, signature)).toBe(true);
    expect(isValidProductImageSignature(`${signedUrl}?changed=1`, signature)).toBe(false);
    expect(isValidProductImageSignature(signedUrl, "invalid")).toBe(false);
  });

  it("returns an empty preview for products without an image", async () => {
    const { productImageProxyUrl } = await import("./product-image");
    expect(productImageProxyUrl(null)).toBe("");
    expect(productImageProxyUrl("")).toBe("");
  });

  it("degrades to no preview when no signing secret is configured", async () => {
    // This runs inside `toProduct`, so throwing on a missing optional env var would take down
    // every rendered product rather than just its proxied fallback.
    const { productImageProxyUrl, isValidProductImageSignature } = await import("./product-image");
    const secrets = [
      "PRODUCT_IMAGE_PROXY_SECRET",
      "OPENAI_KEY_ENCRYPTION_SECRET",
      "INTERNAL_JOB_SECRET",
      "SUPABASE_SECRET_KEY",
    ];
    const saved = secrets.map((key) => [key, process.env[key]] as const);
    for (const key of secrets) delete process.env[key];

    try {
      expect(productImageProxyUrl("https://shop.example.com/item.webp")).toBe("");
      expect(isValidProductImageSignature("https://shop.example.com/item.webp", "anything")).toBe(false);
    } finally {
      for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
    }
  });
});
