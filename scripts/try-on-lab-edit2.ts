/**
 * Try-on lab, round 3: skip p-image-try-on and dress the person with p-image-edit directly,
 * passing [person, merchant photos...] and a prompt that only carries garment categories.
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab-edit.ts [S1 B2 ...]
 *
 * Reuses run/<case>/person.png and run/<case>/garment-N.jpg from scripts/try-on-lab.ts.
 * Writes run/edit/<case>/output-<variant>.png, run/edit-inputs-<case>.png,
 * run/edit-outputs-<case>.png and run/edit.html. Test-only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { editPrunaImage, uploadPrunaFile } from "../src/lib/ai/pruna";

const RUN = path.resolve("scripts/out/try-on-lab/run");
const OUT = path.join(RUN, "edit2");
const SEED = 42;

type Slot = "top" | "trousers" | "jacket" | "shoes";
const CASES: { id: string; title: string; slots: Slot[] }[] = [
  { id: "S1", title: "Single top (photo also shows trousers)", slots: ["top"] },
  { id: "S2", title: "Single top (photo also shows trousers + shoes)", slots: ["top"] },
  { id: "S3", title: "Single trousers (photo also shows blazer + tee)", slots: ["trousers"] },
  { id: "S4", title: "Single jacket (photo also shows tee + trousers)", slots: ["jacket"] },
  { id: "S5", title: "Single sneakers", slots: ["shoes"] },
  { id: "B1", title: "Bundle: top + trousers", slots: ["top", "trousers"] },
  { id: "B2", title: "Bundle: jacket + top + trousers", slots: ["jacket", "top", "trousers"] },
  { id: "B3", title: "Bundle: top + trousers + shoes", slots: ["top", "trousers", "shoes"] },
];

type Variant = "structured" | "short";
const VARIANTS: Variant[] = ["structured", "short"];
const VARIANT_NAME: Record<Variant, string> = {
  structured: "EDIT v2: structured prompt (avatar style)",
  short: "EDIT v2: short prompt",
};

const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

function prompt(variant: Variant, slots: Slot[]): string {
  const fromImages = list(slots.map((s, i) => `the ${s} from image ${i + 2}`));
  const garmentImages = list(slots.map((_, i) => `image ${i + 2}`));
  if (variant === "short") {
    return [
      "Create a full-body studio image of the person in image 1, with their exact face, hair and body unchanged.",
      `Dress them in ${fromImages}. Images 2 and up are only product references for those garments; ignore the people in them and everything else they wear. Anything not listed stays exactly as in image 1.`,
      "Same standing pose and framing as image 1, whole body visible. Background: flat uniform solid #FF00FF magenta.",
    ].join("\n\n");
  }
  return [
    "Create a full-body studio image of the person in image 1.",
    "IDENTITY: image 1 is the person. Keep their exact face and facial structure, skin tone, hair and hairstyle, facial hair and body proportions identical, with no beautification. It must be recognisably the same person as image 1. Never use the face or body of anyone in the other images.",
    `OUTFIT: dress the person in ${fromImages}. ${garmentImages[0] === undefined ? "" : `${garmentImages.charAt(0).toUpperCase()}${garmentImages.slice(1)} ${slots.length === 1 ? "is a product photo" : "are product photos"} of a model wearing the garment: use ${slots.length === 1 ? "it" : "them"} ONLY as the source of the named garment, copying that garment's exact colour, fabric, pattern, cut and details.`} IGNORE the model in those photos: their face, body, pose, background and every other piece of clothing they wear. Every garment of the person in image 1 that is not listed stays exactly as it is in image 1.`,
    "POSE AND FRAMING: identical to image 1: standing upright and straight, facing the camera, arms hanging at the sides, the whole body from head to shoes, nothing cropped, centered.",
    "LIGHTING: soft, even, neutral white studio light with realistic texture, no colour cast.",
    "BACKGROUND: a single flat, uniform, seamless solid #FF00FF (pure magenta) covering 100% of the space around the subject, with no gradients, shadows, floor, props or texture.",
  ].join("\n\n");
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
  mkdirSync(OUT, { recursive: true });

  const person = await uploadPrunaFile(readFileSync(path.join(RUN, "S1", "person.png")), "lab-person.png", "image/png");
  const garmentUrls = new Map<string, string[]>();
  for (const c of cases) {
    const urls: string[] = [];
    for (let i = 1; existsSync(path.join(RUN, c.id, `garment-${i}.jpg`)); i++) {
      urls.push(await uploadPrunaFile(readFileSync(path.join(RUN, c.id, `garment-${i}.jpg`)), `edit-${c.id}-${i}.jpg`, "image/jpeg"));
    }
    garmentUrls.set(c.id, urls);
  }

  const jobs = cases.flatMap((c) => VARIANTS.map((variant) => ({ c, variant })));
  await mapLimit(jobs, 3, async ({ c, variant }) => {
    const dir = path.join(OUT, c.id);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `output-${variant}.png`);
    if (existsSync(file)) return;
    try {
      const { image } = await editPrunaImage({
        prompt: prompt(variant, c.slots),
        imageUrls: [person, ...(garmentUrls.get(c.id) ?? [])],
        aspectRatio: "3:4",
        seed: SEED,
      });
      writeFileSync(file, image);
      console.log(`ok   ${c.id} ${variant}`);
    } catch (e) {
      console.log(`FAIL ${c.id} ${variant}: ${e instanceof Error ? e.message : e}`);
    }
  });

  // Sheets
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
    Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff8d6"/>${wrap(t, Math.floor(w / 6.6)).map((l, i) => `<text x="6" y="${18 + i * 18}" font-size="13" font-family="Arial">${esc(l)}</text>`).join("")}</svg>`);

  for (const c of cases) {
    for (const part of ["inputs", "outputs"] as const) {
      const tiles: sharp.OverlayOptions[] = [];
      let x = 0;
      const add = async (file: string, name: string, bg: string, text?: string) => {
        if (!existsSync(file)) return;
        const buf = await sharp(file).rotate().flatten({ background: "#ccc" }).resize({ height: H }).png().toBuffer();
        const w = Math.max((await sharp(buf).metadata()).width!, text !== undefined ? 340 : 0);
        tiles.push({ input: buf, left: x, top: 28 }, { input: label(name, w, bg), left: x, top: 0 });
        if (text !== undefined) tiles.push({ input: textBox(text, w, 520), left: x, top: 28 + H });
        x += w + 8;
      };
      if (part === "inputs") {
        await add(path.join(RUN, c.id, "person.png"), "image 1: person", "#222");
        let i = 1;
        while (existsSync(path.join(RUN, c.id, `garment-${i}.jpg`))) {
          await add(path.join(RUN, c.id, `garment-${i}.jpg`), `image ${i + 1}: merchant photo`, "#222");
          i++;
        }
      } else {
        await add(path.join(RUN, c.id, "output-none.png"), "TODAY: p-image-try-on, no prompt", "#a00", "PROMPT: (none sent)");
        for (const v of VARIANTS) {
          await add(path.join(OUT, c.id, `output-${v}.png`), VARIANT_NAME[v], "#0a5", `PROMPT: ${prompt(v, c.slots)}`);
        }
      }
      await sharp({ create: { width: x, height: 28 + H + (part === "outputs" ? 520 : 0), channels: 3, background: "#fff" } })
        .composite(tiles)
        .png()
        .toFile(path.join(RUN, `edit2-${part}-${c.id}.png`));
    }
  }

  const html = `<!doctype html><meta charset="utf-8"><title>p-image-edit try-on lab</title><body style="font-family:system-ui;background:#eee;margin:20px">
<h1>p-image-edit as the try-on (seed ${SEED})</h1>${CASES.map((c) => `<section style="background:#fff;padding:12px;margin:0 0 20px"><h2>${c.id}: ${c.title}</h2><div style="overflow-x:auto"><img src="edit-inputs-${c.id}.png"><br><img src="edit-outputs-${c.id}.png"></div></section>`).join("")}</body>`;
  writeFileSync(path.join(RUN, "edit2.html"), html);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
