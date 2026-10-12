/**
 * Renders the three studio backdrops that are sent to Gemini as the second reference image when an
 * avatar is generated (see src/lib/try-on/avatar-backgrounds.ts). Sending the real backdrop, rather
 * than describing a colour in words, is what makes the colour come out right.
 *
 *   npx tsx scripts/build-avatar-backgrounds.ts
 *
 * Writes src/lib/try-on/backgrounds/{magenta,sage,studio-grey}.jpg (768x1024, 3:4 like the avatar).
 * The files are committed; re-run this only to change how a backdrop looks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 768;
const HEIGHT = 1024;
const OUT_DIR = path.join(process.cwd(), "src", "lib", "try-on", "backgrounds");

type Rgb = [number, number, number];

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Linear interpolation through [position, value] stops, clamped at both ends. */
function profile(stops: readonly (readonly [number, number])[], position: number): number {
  if (position <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (position <= stops[i][0]) {
      const [p0, v0] = stops[i - 1];
      const [p1, v1] = stops[i];
      return v0 + ((v1 - v0) * (position - p0)) / (p1 - p0);
    }
  }
  return stops[stops.length - 1][1];
}

/** Tiny deterministic noise so the gradients dither instead of banding after JPEG compression. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 3;
}

async function render(file: string, shade: (x: number, y: number) => Rgb) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let py = 0; py < HEIGHT; py++) {
    for (let px = 0; px < WIDTH; px++) {
      const [r, g, b] = shade(px / (WIDTH - 1), py / (HEIGHT - 1));
      const n = noise(px, py);
      const o = (py * WIDTH + px) * 3;
      pixels[o] = Math.max(0, Math.min(255, Math.round(r + n)));
      pixels[o + 1] = Math.max(0, Math.min(255, Math.round(g + n)));
      pixels[o + 2] = Math.max(0, Math.min(255, Math.round(b + n)));
    }
  }
  const jpeg = await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: 93, chromaSubsampling: "4:4:4" })
    .toBuffer();
  writeFileSync(path.join(OUT_DIR, file), jpeg);
  console.log(`${file}: ${(jpeg.length / 1024).toFixed(0)} KB`);
}

/** A seamless coloured sweep: the colour in the middle, a gentle light falloff to the corners and
 *  a barely lighter floor, so it reads as a photographed backdrop but never as a texture. */
function colourSweep(base: Rgb) {
  return (x: number, y: number): Rgb => {
    const dx = (x - 0.5) / 0.75;
    const dy = (y - 0.38) / 0.95;
    const falloff = 1 - 0.14 * Math.min(1, dx * dx + dy * dy);
    const floor = smoothstep(0.78, 0.9, y);
    const light = falloff * (1 + 0.035 * floor);
    return [base[0] * light, base[1] * light, base[2] * light];
  };
}

/**
 * The warm grey studio the shopper picked from a reference photo: lit from the left, so it is
 * brightest left of centre, falls off steadily to the right and into the top corners, and meets a
 * lighter floor in the bottom fifth. Luminance stops were measured off that photo.
 */
function studioGrey(x: number, y: number): Rgb {
  const wall = profile(
    [[0, 125], [0.06, 132], [0.2, 154], [0.35, 148], [0.5, 130], [0.65, 115], [0.8, 98], [0.94, 78], [1, 70]],
    x
  );
  const top = 0.8 + 0.2 * smoothstep(0, 0.4, y);
  const bottomRight = 1 - 0.3 * smoothstep(0.5, 0.78, y) * smoothstep(0.5, 1, x);
  const floorLuma = profile([[0, 178], [0.5, 157], [1, 142]], x);
  const floor = smoothstep(0.72, 0.92, y);
  const raw = (wall * top * bottomRight) * (1 - floor) + floorLuma * floor;
  // The measured falloff is harsher than a backdrop that has to flatter every outfit, so keep the
  // same shape at about two thirds of the contrast.
  const luma = 128 + (raw - 128) * 0.65;
  return [luma * 1.04, luma, luma * 0.958];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await render("magenta.jpg", colourSweep([214, 64, 159]));
  await render("sage.jpg", colourSweep([150, 183, 134]));
  await render("studio-grey.jpg", studioGrey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
