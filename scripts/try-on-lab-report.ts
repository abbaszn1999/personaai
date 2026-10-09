/**
 * Builds one combined HTML report from every lab run so all approaches can be compared per case
 * on a single page. No API calls. Test-only.
 *
 *   npx tsx scripts/try-on-lab-report.ts
 *
 * Output goes to scripts/out/try-on-lab/compare/ (its own folder, served on its own port). That
 * folder holds index.html plus junctions to run/'s image folders; run/index.html is never touched.
 */
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN = path.resolve("scripts/out/try-on-lab/run");
const OUT = path.resolve("scripts/out/try-on-lab/compare");

type Slot = "top" | "trousers" | "jacket" | "shoes";
interface Garment {
  label: string;
  extra: string;
  slot: Slot;
}
const G: Record<string, Garment> = {
  POLO: { label: "Beige long-sleeved polo", extra: "photo also shows dark teal trousers", slot: "top" },
  TEE: { label: "Off-white long-sleeved t-shirt", extra: "photo also shows black trousers + shoes", slot: "top" },
  TROUSERS: { label: "Navy trousers", extra: "photo also shows navy blazer, white tee, brown shoes", slot: "trousers" },
  JACKET: { label: "Black jacket", extra: "photo also shows white tee, black trousers", slot: "jacket" },
  BOMBER: { label: "Navy coat / bomber", extra: "photo also shows tee, checked shirt, grey trousers", slot: "jacket" },
  SNEAKERS: { label: "Navy leather sneakers", extra: "photo also shows grey trousers", slot: "shoes" },
};
const CASES: { id: string; title: string; garments: string[] }[] = [
  { id: "S1", title: "Single top (model also wears trousers)", garments: ["POLO"] },
  { id: "S2", title: "Single top (full-body shot with trousers + shoes)", garments: ["TEE"] },
  { id: "S3", title: "Single trousers (model also wears blazer + tee)", garments: ["TROUSERS"] },
  { id: "S4", title: "Single jacket (model also wears tee + trousers)", garments: ["JACKET"] },
  { id: "S5", title: "Single sneakers (cropped legs photo)", garments: ["SNEAKERS"] },
  { id: "B1", title: "Bundle of 2: top + trousers", garments: ["TEE", "TROUSERS"] },
  { id: "B2", title: "Bundle of 3: jacket + top + trousers", garments: ["BOMBER", "TEE", "TROUSERS"] },
  { id: "B3", title: "Bundle of 3: top + trousers + shoes", garments: ["POLO", "TROUSERS", "SNEAKERS"] },
];

const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---- prompts (kept identical to the lab scripts) ----
const categoryPrompt = (slots: Slot[]) => `Dress the person in ${list(slots.map((s, i) => `the ${s} from image ${i + 1}`))}.`;
const strictTryOn = (slots: Slot[]) =>
  `Dress the person in only ${list(slots.map((s, i) => `the ${s} from image ${i + 1}`))}. Ignore everything else the model wears in the reference photos, and keep the rest of the person's outfit unchanged.`;
const isolationPrompt = (slot: Slot) => {
  const w = { top: "top (the upper-body garment)", trousers: "trousers", jacket: "jacket", shoes: "pair of shoes" }[slot];
  return `Show only the ${w} from this photo as a clean flat product image, centered on a plain white background. Remove the person and every other item of clothing. Keep the ${slot}'s exact color, fabric, pattern, logos and details unchanged.`;
};
const editV1 = (variant: "simple" | "strict" | "replace", slots: Slot[]) => {
  const from = list(slots.map((s, i) => `the ${s} from image ${i + 2}`));
  if (variant === "simple") return `Dress the person in image 1 in ${from}.`;
  if (variant === "replace") return `In image 1, replace the person's ${list(slots)} with ${from}. Keep everything else in image 1 unchanged.`;
  return `Edit image 1: put on the person only ${from}. Ignore everything else the people in the other images wear. Keep the person's face, body, pose and the magenta background exactly the same, and keep all their other clothes unchanged.`;
};
const editV2 = (variant: "structured" | "short", slots: Slot[]) => {
  const from = list(slots.map((s, i) => `the ${s} from image ${i + 2}`));
  if (variant === "short") {
    return [
      "Create a full-body studio image of the person in image 1, with their exact face, hair and body unchanged.",
      `Dress them in ${from}. Images 2 and up are only product references for those garments; ignore the people in them and everything else they wear. Anything not listed stays exactly as in image 1.`,
      "Same standing pose and framing as image 1, whole body visible. Background: flat uniform solid #FF00FF magenta.",
    ].join("\n");
  }
  const imgs = list(slots.map((_, i) => `image ${i + 2}`));
  const cap = imgs.charAt(0).toUpperCase() + imgs.slice(1);
  return [
    "Create a full-body studio image of the person in image 1.",
    "IDENTITY: image 1 is the person. Keep their exact face and facial structure, skin tone, hair and hairstyle, facial hair and body proportions identical, with no beautification. It must be recognisably the same person as image 1. Never use the face or body of anyone in the other images.",
    `OUTFIT: dress the person in ${from}. ${cap} ${slots.length === 1 ? "is a product photo" : "are product photos"} of a model wearing the garment: use ${slots.length === 1 ? "it" : "them"} ONLY as the source of the named garment, copying that garment's exact colour, fabric, pattern, cut and details. IGNORE the model in those photos: their face, body, pose, background and every other piece of clothing they wear. Every garment of the person in image 1 that is not listed stays exactly as it is in image 1.`,
    "POSE AND FRAMING: identical to image 1: standing upright and straight, facing the camera, arms hanging at the sides, the whole body from head to shoes, nothing cropped, centered.",
    "LIGHTING: soft, even, neutral white studio light with realistic texture, no colour cast.",
    "BACKGROUND: a single flat, uniform, seamless solid #FF00FF (pure magenta) covering 100% of the space around the subject, with no gradients, shadows, floor, props or texture.",
  ].join("\n");
};

interface Output {
  title: string;
  prompt: string | null;
  file: string;
}
interface Approach {
  name: string;
  blurb: string;
  outputs: (id: string, slots: Slot[]) => Output[];
}

const APPROACHES: Approach[] = [
  {
    name: "A. p-image-try-on on the merchant photos (what the app does today)",
    blurb: "Cheapest: one call. Prompts are the experimental `prompt` field, category words only.",
    outputs: (id, slots) => [
      { title: "No prompt (today)", prompt: null, file: `${id}/output-none.png` },
      { title: "Category prompt", prompt: categoryPrompt(slots), file: `${id}/output-category.png` },
      { title: "Category + ignore the rest", prompt: strictTryOn(slots), file: `${id}/output-strict.png` },
    ],
  },
  {
    name: "B. Isolate each garment with p-image-edit, then p-image-try-on",
    blurb: "Two steps. The isolated garments are shown in the inputs row (orange). Isolation can be cached per product.",
    outputs: (id, slots) => [
      { title: "Isolated garments, no prompt", prompt: null, file: `iso/${id}/output-iso-none.png` },
      { title: "Isolated garments + category prompt", prompt: categoryPrompt(slots), file: `iso/${id}/output-iso-category.png` },
    ],
  },
  {
    name: "C. p-image-edit only, weak one-line prompts (no try-on model)",
    blurb: "Images sent as [person, merchant photos...]. Aspect ratio = match input.",
    outputs: (id, slots) =>
      (["simple", "strict", "replace"] as const).map((v) => ({
        title: `p-image-edit: ${v}`,
        prompt: editV1(v, slots),
        file: `edit/${id}/output-${v}.png`,
      })),
  },
  {
    name: "D. p-image-edit only, avatar-style structured prompts (no try-on model)",
    blurb: "Same idea, sections like our avatar prompt, aspect ratio 3:4.",
    outputs: (id, slots) =>
      (["structured", "short"] as const).map((v) => ({
        title: `p-image-edit v2: ${v}`,
        prompt: editV2(v, slots),
        file: `edit2/${id}/output-${v}.png`,
      })),
  },
];

const img = (rel: string) =>
  existsSync(path.join(RUN, rel))
    ? `<a href="${rel}" target="_blank"><img loading="lazy" src="${rel}"></a>`
    : `<div class="missing">missing<br>${esc(rel)}</div>`;

const sections = CASES.map((c) => {
  const slots = c.garments.map((k) => G[k].slot);
  const inputs = [
    `<figure><figcaption><b>person_image</b></figcaption>${img(`${c.id}/person.png`)}</figure>`,
    ...c.garments.map(
      (k, i) =>
        `<figure><figcaption><b>image ${i + 1}</b>: merchant photo<br>${esc(G[k].label)}<br><i>${esc(G[k].extra)}</i></figcaption>${img(`${c.id}/garment-${i + 1}.jpg`)}</figure>`,
    ),
    ...c.garments.map(
      (k, i) =>
        `<figure class="iso"><figcaption><b>isolated ${i + 1}</b> (approach B)<br><span class="p">${esc(isolationPrompt(G[k].slot))}</span></figcaption>${img(`iso/isolated-${k}.png`)}</figure>`,
    ),
  ].join("");
  const approaches = APPROACHES.map((a) => {
    const cards = a
      .outputs(c.id, slots)
      .map(
        (o) =>
          `<figure class="out"><figcaption><b>${esc(o.title)}</b><pre>${o.prompt ? esc(o.prompt) : "(no prompt sent)"}</pre></figcaption>${img(o.file)}</figure>`,
      )
      .join("");
    return `<div class="approach"><h3>${esc(a.name)}</h3><p>${esc(a.blurb)}</p><div class="row">${cards}</div></div>`;
  }).join("");
  return `<section id="${c.id}"><h2>${c.id}: ${esc(c.title)}</h2><h3>Inputs</h3><div class="row">${inputs}</div>${approaches}</section>`;
}).join("");

const nav = CASES.map((c) => `<a href="#${c.id}">${c.id}</a>`).join(" ");
const html = `<!doctype html><meta charset="utf-8"><title>Try-on lab: all approaches</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#eee;color:#111}
header{position:sticky;top:0;background:#111;color:#fff;padding:10px 20px;z-index:5}header a{color:#7cf;margin-right:12px;font-weight:bold}
section{background:#fff;margin:20px;padding:16px 20px;border-radius:10px}
h2{margin:0 0 8px}h3{margin:18px 0 4px}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;width:300px;font-size:12px}figure img{width:300px;background:#ddd;display:block;margin-top:6px}
figure.iso figcaption{color:#a50}figure.out figcaption pre{white-space:pre-wrap;background:#fff8d6;padding:6px;margin:4px 0;font-size:11px;max-height:150px;overflow:auto}
.p{font-size:10px;color:#555}.approach{border-top:2px solid #ddd;margin-top:14px;padding-top:4px}.approach p{margin:0 0 8px;color:#555;font-size:13px}
.missing{width:300px;height:120px;background:#fdd;font-size:11px;padding:6px;box-sizing:border-box}
</style><header>Try-on lab: all approaches, seed 42. Jump to: ${nav} (click an image to open it full size)</header>${sections}`;

mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(RUN, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const link = path.join(OUT, entry.name);
  if (!existsSync(link)) symlinkSync(path.join(RUN, entry.name), link, "junction");
}
writeFileSync(path.join(OUT, "index.html"), html);
console.log("wrote", path.join(OUT, "index.html"));
