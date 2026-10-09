/**
 * End-to-end check of the production try-on path (generateTryOnImage -> Gemini -> chroma strip ->
 * real cost) using the lab's person and merchant photos. Prints the prompt, the usage Google
 * returned, the computed cost, latency, and how much of the output became transparent.
 *
 *   npx tsx --env-file=.env.local scripts/try-on-verify-real.ts [N1 N7 N9 ...]
 *
 * Writes PNGs to scripts/out/try-on-lab/verify/. Test-only; makes real (paid) Gemini calls.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { generateTryOnImage, type TryOnGarmentRef } from "../src/lib/try-on/image-generation";
import { buildTryOnPrompt } from "../src/lib/try-on/prompt";
import { estimateTryOnCostNanos } from "../src/lib/billing/pricing";

const SRC = path.resolve("scripts/out/try-on-lab/seeds");
const OUT = path.resolve("scripts/out/try-on-lab/verify");
mkdirSync(OUT, { recursive: true });

const dataUrl = (file: string, mime: string) => `data:${mime};base64,${readFileSync(file).toString("base64")}`;

const G: Record<string, Omit<TryOnGarmentRef, "imageUrl">> = {
  BLUE_POLO: { name: "polo", slot: "top", leaf: "polo-shirt" },
  OLIVE_POLO: { name: "polo", slot: "top", leaf: "polo-shirt" },
  OFFWHITE_TROUSERS: { name: "trousers", slot: "bottom", leaf: "trouser" },
  OLIVE_CARGO: { name: "cargo", slot: "bottom", leaf: "trouser" },
  BEIGE_COAT: { name: "coat", slot: "outerwear", leaf: "coat" },
  NAVY_PUFFER: { name: "puffer", slot: "outerwear", leaf: "jacket" },
  NAVY_SHOES: { name: "shoes", slot: "shoes", leaf: "dress-shoe" },
};

const CASES: Record<string, string[]> = {
  N1: ["BLUE_POLO"],
  N3: ["OLIVE_CARGO"],
  N5: ["NAVY_SHOES"],
  N7: ["BLUE_POLO", "OLIVE_CARGO", "NAVY_PUFFER"],
  N9: ["BEIGE_COAT", "BLUE_POLO", "OLIVE_CARGO", "NAVY_SHOES"],
};

async function main() {
  const wanted = process.argv.slice(2).filter((a) => a in CASES);
  const ids = wanted.length > 0 ? wanted : Object.keys(CASES);
  const avatar = dataUrl(path.join(SRC, "person.png"), "image/png");

  for (const id of ids) {
    const added: TryOnGarmentRef[] = CASES[id].map((key) => ({
      ...G[key],
      imageUrl: dataUrl(path.join(SRC, `photo-${key}.jpg`), "image/jpeg"),
    }));
    console.log(`\n=== ${id} ===`);
    console.log("prompt:", buildTryOnPrompt(added.map((g) => ({ slot: g.slot, leaf: g.leaf }))));

    const t0 = Date.now();
    const result = await generateTryOnImage({ avatarImageUrl: avatar, kept: [], added });
    const ms = Date.now() - t0;

    const base64 = result.imageUrl.split(",")[1];
    const png = Buffer.from(base64, "base64");
    writeFileSync(path.join(OUT, `${id}.png`), png);

    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 10) transparent++;
    const share = (transparent / (info.width * info.height)) * 100;

    console.log(
      `garments=${result.garmentCount} cost=${result.costNanos} nanos ($${(result.costNanos / 1e9).toFixed(4)}) ` +
        `estimate=${estimateTryOnCostNanos(result.garmentCount)} units=${Math.floor(result.costNanos / 10_000_000)} ` +
        `latency=${(ms / 1000).toFixed(1)}s size=${info.width}x${info.height} transparent=${share.toFixed(1)}%`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
