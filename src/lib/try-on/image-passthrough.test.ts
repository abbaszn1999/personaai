import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareAvatarForTryOn, preparePhotoForAvatar } from "./image-passthrough";

const RED = { r: 200, g: 40, b: 40 };

function base(width = 120, height = 160, channels: 3 | 4 = 3) {
  return sharp({ create: { width, height, channels, background: channels === 4 ? { ...RED, alpha: 0.5 } : RED } });
}

const jpeg = (width?: number, height?: number) => base(width, height).jpeg().toBuffer();
const png = (width?: number, height?: number) => base(width, height).png().toBuffer();
const webp = (width?: number, height?: number) => base(width, height).webp().toBuffer();

async function describe_(bytes: Buffer) {
  const meta = await sharp(bytes).metadata();
  return { format: meta.format, width: meta.width, height: meta.height };
}

describe("prepareAvatarForTryOn", () => {
  it("sends a stored PNG, JPEG or WebP exactly as it is, with its own type", async () => {
    for (const [make, mime] of [
      [png, "image/png"],
      [jpeg, "image/jpeg"],
      [webp, "image/webp"],
    ] as const) {
      const bytes = await make();
      const out = await prepareAvatarForTryOn(bytes);
      expect(out.mimeType).toBe(mime);
      expect(out.data).toBe(bytes);
    }
  });

  it("straightens a picture that carries an EXIF rotation, as an upright PNG", async () => {
    const bytes = await base(120, 160).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await prepareAvatarForTryOn(bytes);
    expect(out.mimeType).toBe("image/png");
    expect(out.data).not.toBe(bytes);
    // Rotated a quarter turn, so the portrait becomes a landscape.
    expect(await describe_(out.data)).toMatchObject({ format: "png", width: 160, height: 120 });
  });

  it("converts a format the model does not read, and a CMYK picture, to PNG", async () => {
    const gif = await base(40, 40).gif().toBuffer();
    const fromGif = await prepareAvatarForTryOn(gif);
    expect(fromGif.mimeType).toBe("image/png");
    expect((await describe_(fromGif.data)).format).toBe("png");

    const cmyk = await base().toColourspace("cmyk").jpeg().toBuffer();
    const fromCmyk = await prepareAvatarForTryOn(cmyk);
    expect(fromCmyk.mimeType).toBe("image/png");
  });

  it("does not reject a transparent picture: it is sent as it is", async () => {
    const bytes = await base(120, 160, 4).png().toBuffer();
    const out = await prepareAvatarForTryOn(bytes);
    expect(out.data).toBe(bytes);
  });
});

describe("preparePhotoForAvatar", () => {
  it("sends a fine photo untouched", async () => {
    for (const [make, mime] of [
      [jpeg, "image/jpeg"],
      [png, "image/png"],
      [webp, "image/webp"],
    ] as const) {
      const bytes = await make(400, 600);
      const out = await preparePhotoForAvatar(bytes);
      expect(out.mimeType).toBe(mime);
      expect(out.data).toBe(bytes);
    }
  });

  it("brings an oversized photo down to the cap as a JPEG", async () => {
    const bytes = await jpeg(2000, 3000);
    const out = await preparePhotoForAvatar(bytes);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.data).not.toBe(bytes);
    const { width, height } = await describe_(out.data);
    expect(Math.max(width ?? 0, height ?? 0)).toBe(1536);
  });

  it("rewrites a photo that is too heavy even when its dimensions are fine", async () => {
    const bytes = await jpeg(400, 600);
    const out = await preparePhotoForAvatar(bytes, { maxBytes: bytes.length - 1 });
    expect(out.data).not.toBe(bytes);
    expect(out.mimeType).toBe("image/jpeg");
  });

  it("uprights a rotated phone photo", async () => {
    const bytes = await base(300, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await preparePhotoForAvatar(bytes);
    expect(out.data).not.toBe(bytes);
    expect(await describe_(out.data)).toMatchObject({ format: "jpeg", width: 200, height: 300 });
  });

  it("rewrites a transparent picture, a CMYK picture and a format the model does not read", async () => {
    const withAlpha = await base(200, 200, 4).png().toBuffer();
    expect((await preparePhotoForAvatar(withAlpha)).mimeType).toBe("image/jpeg");

    const cmyk = await base(200, 200).toColourspace("cmyk").jpeg().toBuffer();
    const fromCmyk = await preparePhotoForAvatar(cmyk);
    expect(fromCmyk.data).not.toBe(cmyk);

    const gif = await base(50, 50).gif().toBuffer();
    expect((await preparePhotoForAvatar(gif)).mimeType).toBe("image/jpeg");
  });

  it("fails on bytes that are not a picture, so the caller can say it could not read the photo", async () => {
    await expect(preparePhotoForAvatar(Buffer.from("not an image"))).rejects.toThrow();
  });
});
