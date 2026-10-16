import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublicImage = vi.fn();
const getCachedProductImage = vi.fn();
const isProductImageHostDown = vi.fn();

vi.mock("@/lib/images/product-image", () => ({
  fetchPublicImage: (...args: unknown[]) => fetchPublicImage(...args),
  getCachedProductImage: (...args: unknown[]) => getCachedProductImage(...args),
  isProductImageHostDown: (...args: unknown[]) => isProductImageHostDown(...args),
}));

import { loadGarmentReference, readImageBytes } from "./image-source";
import { PersonaAgentError } from "./errors";

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).png().toBuffer();
}

beforeEach(() => {
  fetchPublicImage.mockReset();
  getCachedProductImage.mockReset();
  isProductImageHostDown.mockReset().mockReturnValue(false);
  getCachedProductImage.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllEnvs());

describe("loadGarmentReference", () => {
  it("transcodes the original to JPEG", async () => {
    fetchPublicImage.mockResolvedValue({ body: await png(), contentType: "image/png" });
    const out = await loadGarmentReference("https://shop.example/a.png");
    expect((await sharp(out).metadata()).format).toBe("jpeg");
    expect(fetchPublicImage).toHaveBeenCalledWith(
      "https://shop.example/a.png",
      expect.objectContaining({ timeoutMs: expect.any(Number), maxBytes: expect.any(Number) })
    );
  });

  it("retries one failed fetch before giving up on the original", async () => {
    fetchPublicImage
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ body: await png(), contentType: "image/png" });
    const out = await loadGarmentReference("https://shop.example/a.png");
    expect((await sharp(out).metadata()).format).toBe("jpeg");
    expect(fetchPublicImage).toHaveBeenCalledTimes(2);
    expect(getCachedProductImage).not.toHaveBeenCalled();
  });

  it("falls back to the copy the widget already showed when the store's host is failing", async () => {
    fetchPublicImage.mockResolvedValue(null);
    const cached = Buffer.from("cached-jpeg");
    getCachedProductImage.mockResolvedValue({ body: cached, contentType: "image/jpeg" });
    await expect(loadGarmentReference("https://shop.example/a.png")).resolves.toBe(cached);
  });

  it("skips the slow path entirely when the host is known to be down", async () => {
    isProductImageHostDown.mockReturnValue(true);
    const cached = Buffer.from("cached-jpeg");
    getCachedProductImage.mockResolvedValue({ body: cached, contentType: "image/jpeg" });
    await expect(loadGarmentReference("https://shop.example/a.png")).resolves.toBe(cached);
    expect(fetchPublicImage).not.toHaveBeenCalled();
  });

  it("fails with a retryable garment error when nothing can be loaded", async () => {
    fetchPublicImage.mockResolvedValue(null);
    const error = (await loadGarmentReference("https://shop.example/a.png").catch((e) => e)) as PersonaAgentError;
    expect(error).toBeInstanceOf(PersonaAgentError);
    expect(error.code).toBe("garment_image");
  });

  it("falls back to the cached copy when the original cannot be decoded", async () => {
    fetchPublicImage.mockResolvedValue({ body: Buffer.from("not an image"), contentType: "image/png" });
    const cached = Buffer.from("cached-jpeg");
    getCachedProductImage.mockResolvedValue({ body: cached, contentType: "image/jpeg" });
    await expect(loadGarmentReference("https://shop.example/a.png")).resolves.toBe(cached);
  });
});

describe("readImageBytes", () => {
  it("decodes a data URL without touching the network", async () => {
    const bytes = await readImageBytes(`data:image/png;base64,${Buffer.from("abc").toString("base64")}`);
    expect(bytes.toString()).toBe("abc");
    expect(fetchPublicImage).not.toHaveBeenCalled();
  });

  it("raises an avatar error when the picture cannot be fetched", async () => {
    fetchPublicImage.mockResolvedValue(null);
    const error = (await readImageBytes("https://cdn.example/avatar.png").catch((e) => e)) as PersonaAgentError;
    expect(error.code).toBe("avatar_image");
  });
});
