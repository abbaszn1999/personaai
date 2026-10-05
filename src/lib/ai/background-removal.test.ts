import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { stripBackgroundToTransparent } from "./background-removal";

const SIZE = 80;
const FROM = 24;
const TO = 56; // subject occupies [FROM, TO)

/** A pale-grey subject on a magenta plate, with the two kinds of contamination a real render has:
 *  a one-pixel ring that is half backdrop, and a few pixels of pink bounce light inside it. */
async function renderFixture(): Promise<string> {
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      let rgb: [number, number, number] = [255, 0, 255];
      const inside = x >= FROM && x < TO && y >= FROM && y < TO;
      if (inside) {
        const depth = Math.min(x - FROM, TO - 1 - x, y - FROM, TO - 1 - y);
        if (depth === 0) rgb = [242, 118, 242]; // 50/50 mix of (230,236,230) and magenta
        else if (depth <= 3) rgb = [240, 215, 240]; // pink spill on pale fabric
        else rgb = [230, 230, 230];
      }
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
    }
  }
  const png = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer();
  return png.toString("base64");
}

async function decode(base64: string) {
  const { data, info } = await sharp(Buffer.from(base64, "base64")).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  return { at, width: info.width };
}

describe("stripBackgroundToTransparent", () => {
  it("makes the backdrop fully transparent and leaves the subject core untouched", async () => {
    const out = await decode((await stripBackgroundToTransparent(await renderFixture(), "image/png")).imageBase64);
    expect(out.at(5, 5).a).toBe(0);
    expect(out.at(FROM - 1, 40).a).toBe(0); // no outward halo
    expect(out.at(40, 40)).toMatchObject({ r: 230, g: 230, b: 230, a: 255 });
  });

  it("leaves no magenta/pink tint on the silhouette or in the light fabric next to it", async () => {
    const out = await decode((await stripBackgroundToTransparent(await renderFixture(), "image/png")).imageBase64);
    for (let x = FROM; x < FROM + 6; x++) {
      const px = out.at(x, 40);
      if (px.a === 0) continue;
      // Red and blue must not stand out above green: that excess is what reads as pink/purple.
      expect(Math.min(px.r, px.b) - px.g).toBeLessThanOrEqual(6);
    }
  });
});
