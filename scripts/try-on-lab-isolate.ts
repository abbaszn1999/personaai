/**
 * Try-on lab, round 2: isolate each garment from its merchant photo with p-image-edit, then feed
 * the isolated garment to p-image-try-on. Only the garment category is ever sent as text.
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab-isolate.ts [S1 B2 ...]
 *
 * Reads the person / garment inputs written by scripts/try-on-lab.ts (run/<case>/), writes
 * run/iso/** and run/iso-<case>.png comparison sheets. Test-only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { editPrunaImage, prunaTryOn, uploadPrunaFile } from "../src/lib/ai/pruna";

const RUN = path.resolve("scripts/out/try-on-lab/run");
const ISO = path.join(RUN, "iso");
const SEED = 42;

type Slot = "top" | "trousers" | "jacket" | "shoes";
interface Source {
  key: string;
  /** garment file inside candidates/ */
  file: string;
  slot: Slot;
}

const SRC: Record<string, Source> = {
  POLO: { key: "POLO", file: "15420250489074-1.jpg", slot: "top" },
  TEE: { key: "TEE", file: "15407811297522-2.jpg", slot: "top" },
  TROUSERS: { key: "TROUSERS", file: "15407814410482-1.jpg", slot: "trousers" },
  JACKET: { key: "JACKET", file: "15407815360754-2.jpg", slot: "jacket" },
  BOMBER: { key: "BOMBER", file: "15407816409330-2.jpg", slot: "jacket" },
  SNEAKERS: { key: "SNEAKERS", file: "10313039413490-1.jpg", slot: "shoes" },
};

const CASES: { id: string; garments: string[] }[] = [
  { id: "S1", garments: ["POLO"] },
  { id: "S2", garments: ["TEE"] },
  { id: "S3", garments: ["TROUSERS"] },
  { id: "S4", garments: ["JACKET"] },
  { id: "S5", garments: ["SNEAKERS"] },
  { id: "B1", garments: ["TEE", "TROUSERS"] },
  { id: "B2", garments: ["BOMBER", "TEE", "TROUSERS"] },
  { id: "B3", garments: ["POLO", "TROUSERS", "SNEAKERS"] },
];

const SLOT_WORD: Record<Slot, string> = {
  top: "top (the upper-body garment)",
  trousers: "trousers",
  jacket: "jacket",
  shoes: "pair of shoes",
};

function isolationPrompt(slot: Slot): string {
  const w = SLOT_WORD[slot];
  return `Show only the ${w} from this photo as a clean flat product image, centered on a plain white background. Remove the person and every other item of clothing. Keep the ${slot === "shoes" ? "shoes" : slot}'s exact color, fabric, pattern, logos and details unchanged.`;
}

function categoryPrompt(slots: Slot[]): string {
  const parts = slots.map((s, i) => `the ${s} from image ${i + 1}`);
  const list = parts.length <= 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Dress the person in ${list}.`;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const cases = CASES.filter((c) => wanted.length === 0 || wanted.includes(c.id));
  mkdirSync(ISO, { recursive: true });

  // 1. Isolate each distinct source photo once.
  const keys = [...new Set(cases.flatMap((c) => c.garments))];
  const isoPath = (k: string) => path.join(ISO, `isolated-${k}.png`);
  const isoUrl = new Map<string, string>();
  const isoError = new Map<string, string>();
  await mapLimit(keys, 3, async (k) => {
    const s = SRC[k];
    try {
      if (!existsSync(isoPath(k))) {
        const jpeg = await sharp(readFileSync(path.resolve("scripts/out/try-on-lab/candidates", s.file)))
          .rotate()
          .jpeg({ quality: 92 })
          .toBuffer();
        const url = await uploadPrunaFile(jpeg, `iso-src-${k}.jpg`, "image/jpeg");
        const { image } = await editPrunaImage({ prompt: isolationPrompt(s.slot), imageUrls: [url], seed: SEED });
        writeFileSync(isoPath(k), image);
        console.log(`isolated ${k}`);
      }
      const png = await sharp(readFileSync(isoPath(k))).flatten({ background: "#fff" }).jpeg({ quality: 92 }).toBuffer();
      isoUrl.set(k, await uploadPrunaFile(png, `iso-${k}.jpg`, "image/jpeg"));
    } catch (e) {
      isoError.set(k, e instanceof Error ? e.message : String(e));
      console.log(`FAIL isolate ${k}: ${isoError.get(k)}`);
    }
  });

  // 2. Try-on with the isolated garments.
  const person = await uploadPrunaFile(readFileSync(path.join(RUN, "S1", "person.png")), "lab-person.png", "image/png");
  const jobs = cases.flatMap((c) => (["iso-none", "iso-category"] as const).map((mode) => ({ c, mode })));
  const results: Record<string, { prompt: string | null; error?: string }> = {};
  await mapLimit(jobs, 3, async ({ c, mode }) => {
    const slots = c.garments.map((g) => SRC[g].slot);
    const prompt = mode === "iso-category" ? categoryPrompt(slots) : undefined;
    const urls = c.garments.map((g) => isoUrl.get(g));
    const dir = path.join(ISO, c.id);
    mkdirSync(dir, { recursive: true });
    const id = `${c.id}/${mode}`;
    if (urls.some((u) => !u)) {
      results[id] = { prompt: prompt ?? null, error: "isolation failed" };
      return;
    }
    try {
      const { image } = await prunaTryOn({ personImageUrl: person, garmentImageUrls: urls as string[], prompt, seed: SEED });
      writeFileSync(path.join(dir, `output-${mode}.png`), image);
      results[id] = { prompt: prompt ?? null };
      console.log(`ok   ${id}`);
    } catch (e) {
      results[id] = { prompt: prompt ?? null, error: e instanceof Error ? e.message : String(e) };
      console.log(`FAIL ${id}: ${results[id].error}`);
    }
  });
  writeFileSync(path.join(ISO, "results.json"), JSON.stringify({ isolationErrors: [...isoError], results }, null, 2));

  // 3. Comparison sheets.
  const H = 520;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const wrap = (text: string, max: number) => {
    const lines: string[] = [];
    let cur = "";
    for (const w of text.split(" ")) {
      if ((cur + " " + w).trim().length > max) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const label = (t: string, w: number, bg: string) =>
    Buffer.from(`<svg width="${w}" height="28" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${bg}"/><text x="6" y="19" font-size="15" fill="#fff" font-family="Arial" font-weight="bold">${esc(t)}</text></svg>`);
  const textBox = (t: string, w: number, h: number) =>
    Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff8d6"/>${wrap(t, Math.floor(w / 7.2)).map((l, i) => `<text x="6" y="${18 + i * 18}" font-size="13" font-family="Arial">${esc(l)}</text>`).join("")}</svg>`);

  for (const c of cases) {
    for (const part of ["inputs", "outputs"] as const) {
      const tiles: sharp.OverlayOptions[] = [];
      let x = 0;
      let withText = false;
      const add = async (file: string, name: string, bg: string, prompt?: string | null) => {
        if (!existsSync(file)) return;
        const buf = await sharp(file).rotate().flatten({ background: "#ccc" }).resize({ height: H }).png().toBuffer();
        const w = Math.max((await sharp(buf).metadata()).width!, prompt !== undefined ? 340 : 0);
        tiles.push({ input: buf, left: x, top: 28 }, { input: label(name, w, bg), left: x, top: 0 });
        if (prompt !== undefined) {
          withText = true;
          tiles.push({ input: textBox(prompt ? `PROMPT: ${prompt}` : "PROMPT: (none sent)", w, 110), left: x, top: 28 + H });
        }
        x += w + 8;
      };
      if (part === "inputs") {
        await add(path.join(RUN, c.id, "person.png"), "INPUT: person", "#222");
        for (const [i, g] of c.garments.entries()) {
          await add(path.join(RUN, c.id, `garment-${i + 1}.jpg`), `INPUT: merchant photo ${i + 1}`, "#222");
        }
        for (const [i, g] of c.garments.entries()) {
          await add(isoPath(g), `ISOLATED ${i + 1} (${SRC[g].slot}) by p-image-edit`, "#a50", isolationPrompt(SRC[g].slot));
        }
      } else {
        await add(path.join(RUN, c.id, "output-none.png"), "TODAY: merchant photos, no prompt", "#a00", "");
        await add(path.join(ISO, c.id, "output-iso-none.png"), "ISOLATED garments, no prompt", "#0a5", "");
        const slots = c.garments.map((g) => SRC[g].slot);
        await add(path.join(ISO, c.id, "output-iso-category.png"), "ISOLATED garments + category prompt", "#0a5", categoryPrompt(slots));
      }
      void withText;
      await sharp({ create: { width: x, height: 28 + H + 110, channels: 3, background: "#fff" } })
        .composite(tiles)
        .png()
        .toFile(path.join(RUN, `iso-${part}-${c.id}.png`));
    }
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
