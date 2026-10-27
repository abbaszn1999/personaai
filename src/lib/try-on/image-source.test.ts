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

const BG = "#336699";

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: BG } }).png().toBuffer();
}

async function webp(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: BG } }).webp().toBuffer();
}

beforeEach(() => {
  fetchPublicImage.mockReset();
  getCachedProductImage.mockReset();
  isProductImageHostDown.mockReset().mockReturnValue(false);
  getCachedProductImage.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllEnvs());

describe("loadGarmentReference", () => {
  it("sends a store's own PNG as it is when it is already fine", async () => {
    const original = await png();
    fetchPublicImage.mockResolvedValue({ body: original, contentType: "image/png" });
    const out = await loadGarmentReference("https://shop.example/a.png");
    expect(out.mimeType).toBe("image/png");
    expect(out.data).toBe(original);
    expect(fetchPublicImage).toHaveBeenCalledWith(
      "https://shop.example/a.png",
      expect.objectContaining({ timeoutMs: expect.any(Number), maxBytes: expect.any(Number) })
    );
  });

  it("sends a store's WebP as it is, with its own type", async () => {
    const original = await webp();
    fetchPublicImage.mockResolvedValue({ body: original, contentType: "image/webp" });
    const out = await loadGarmentReference("https://shop.example/a.webp");
    expect(out.mimeType).toBe("image/webp");
    expect(out.data).toBe(original);
  });

  it("shrinks an oversized garment photo to a JPEG within 1600px", async () => {
    fetchPublicImage.mockResolvedValue({ body: await webp(2400, 1800), contentType: "image/webp" });
    const out = await loadGarmentReference("https://shop.example/big.webp");
    const meta = await sharp(out.data).metadata();
    expect(out.mimeType).toBe("image/jpeg");
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
  });

  it("rewrites a garment with transparency as a JPEG", async () => {
    const transparent = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 51, g: 102, b: 153, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    fetchPublicImage.mockResolvedValue({ body: transparent, contentType: "image/png" });
    const out = await loadGarmentReference("https://shop.example/cutout.png");
    expect(out.mimeType).toBe("image/jpeg");
    expect((await sharp(out.data).metadata()).format).toBe("jpeg");
  });

  it("rewrites a garment with an EXIF rotation so it is upright", async () => {
    const rotated = await sharp({ create: { width: 8, height: 4, channels: 3, background: BG } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    fetchPublicImage.mockResolvedValue({ body: rotated, contentType: "image/jpeg" });
    const out = await loadGarmentReference("https://shop.example/rotated.jpg");
    const meta = await sharp(out.data).metadata();
    expect(out.data).not.toBe(rotated);
    expect(meta.width).toBe(4);
    expect(meta.height).toBe(8);
  });

  it("reads a garment sent as a data URL", async () => {
    const original = await png();
    const out = await loadGarmentReference(`data:image/png;base64,${original.toString("base64")}`);
    expect(out.mimeType).toBe("image/png");
    expect(out.data.equals(original)).toBe(true);
    expect(fetchPublicImage).not.toHaveBeenCalled();
  });

  it("retries one failed fetch before giving up on the original", async () => {
    fetchPublicImage
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ body: await png(), contentType: "image/png" });
    const out = await loadGarmentReference("https://shop.example/a.png");
    expect(out.mimeType).toBe("image/png");
    expect(fetchPublicImage).toHaveBeenCalledTimes(2);
    expect(getCachedProductImage).not.toHaveBeenCalled();
  });

  it("falls back to the copy the widget already showed when the store's host is failing", async () => {
    fetchPublicImage.mockResolvedValue(null);
    const cached = Buffer.from("cached-jpeg");
    getCachedProductImage.mockResolvedValue({ body: cached, contentType: "image/jpeg" });
    await expect(loadGarmentReference("https://shop.example/a.png")).resolves.toEqual({
      data: cached,
      mimeType: "image/jpeg",
    });
  });

  it("skips the slow path entirely when the host is known to be down", async () => {
    isProductImageHostDown.mockReturnValue(true);
    const cached = Buffer.from("cached-jpeg");
    getCachedProductImage.mockResolvedValue({ body: cached, contentType: "image/jpeg" });
    await expect(loadGarmentReference("https://shop.example/a.png")).resolves.toEqual({
      data: cached,
      mimeType: "image/jpeg",
    });
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
    await expect(loadGarmentReference("https://shop.example/a.png")).resolves.toEqual({
      data: cached,
      mimeType: "image/jpeg",
    });
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
