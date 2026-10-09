/**
 * Try-on lab, p-image-edit only (no p-image-try-on, no garment isolation).
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab-edit3.ts [S1 B2 ...]   # run round 3, then rebuild report
 *   npx tsx scripts/try-on-lab-edit3.ts --report-only                       # rebuild report only
 *
 * Round 3 tries new image orders, prompt structures and a second seed. The report folder
 * scripts/out/try-on-lab/edit-only/ (its own port) also shows the two earlier p-image-edit rounds.
 * Reads person/garment inputs from run/<case>/. Never touches run/index.html. Test-only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { editPrunaImage, uploadPrunaFile } from "../src/lib/ai/pruna";

const RUN = path.resolve("scripts/out/try-on-lab/run");
const OUT3 = path.join(RUN, "edit3");
const REPORT = path.resolve("scripts/out/try-on-lab/edit-only");

type Slot = "top" | "trousers" | "jacket" | "shoes";
const CASES: { id: string; title: string; slots: Slot[]; labels: string[] }[] = [
  { id: "S1", title: "Single top (model also wears trousers)", slots: ["top"], labels: ["Beige long-sleeved polo (photo also shows dark trousers)"] },
  { id: "S2", title: "Single top (full-body shot with trousers + shoes)", slots: ["top"], labels: ["Off-white long-sleeved t-shirt (photo also shows black trousers + shoes)"] },
  { id: "S3", title: "Single trousers (model also wears blazer + tee)", slots: ["trousers"], labels: ["Navy trousers (photo also shows navy blazer, white tee, brown shoes)"] },
  { id: "S4", title: "Single jacket (model also wears tee + trousers)", slots: ["jacket"], labels: ["Black jacket (photo also shows white tee, black trousers)"] },
  { id: "S5", title: "Single sneakers (cropped legs photo)", slots: ["shoes"], labels: ["Navy leather sneakers (photo also shows grey trousers)"] },
  { id: "B1", title: "Bundle of 2: top + trousers", slots: ["top", "trousers"], labels: ["Off-white long-sleeved t-shirt (photo also shows black trousers + shoes)", "Navy trousers (photo also shows blazer, tee, shoes)"] },
  { id: "B2", title: "Bundle of 3: jacket + top + trousers", slots: ["jacket", "top", "trousers"], labels: ["Navy coat / bomber (photo also shows tee, checked shirt, grey trousers)", "Off-white long-sleeved t-shirt (photo also shows black trousers + shoes)", "Navy trousers (photo also shows blazer, tee, shoes)"] },
  { id: "B3", title: "Bundle of 3: top + trousers + shoes", slots: ["top", "trousers", "shoes"], labels: ["Beige long-sleeved polo (photo also shows dark trousers)", "Navy trousers (photo also shows blazer, tee, shoes)", "Navy leather sneakers (photo also shows grey trousers)"] },
];

const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---------------- earlier rounds (prompts identical to scripts/try-on-lab-edit.ts / -edit2.ts) ----------------
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

// ---------------- round 3 ----------------
type V3 = "labelled" | "person-last" | "output-spec" | "negative-first" | "labelled-seed7";
const V3S: V3[] = ["labelled", "person-last", "output-spec", "negative-first", "labelled-seed7"];
const V3_INFO: Record<V3, { title: string; order: string; seed: number }> = {
  labelled: { title: "Labelled roles: person = image to edit, others = clothing references", order: "person first", seed: 42 },
  "person-last": { title: "Person image sent LAST, garment photos first", order: "person last", seed: 42 },
  "output-spec": { title: "Describe the required output first", order: "person first", seed: 42 },
  "negative-first": { title: "Start with what NOT to return", order: "person first", seed: 42 },
  "labelled-seed7": { title: "Same as 'Labelled roles' with a different seed (7), to see variance", order: "person first", seed: 7 },
};

function prompt3(v: V3, slots: Slot[]): string {
  const n = slots.length;
  if (v === "person-last") {
    const person = `image ${n + 1}`;
    const from = list(slots.map((s, i) => `the ${s} from image ${i + 1}`));
    const refs = list(slots.map((_, i) => `image ${i + 1}`));
    return `${person[0].toUpperCase()}${person.slice(1)} (the last image) is the person on a magenta background. It is the image to edit: the output must be this exact person (same face, body, pose and framing) on the same magenta background. ${refs[0].toUpperCase()}${refs.slice(1)} ${n === 1 ? "is a photo of another model" : "are photos of other models"} wearing clothes, used only as clothing references. Change only the person's ${list(slots)} so they match ${from}. Do not use the face, body, pose or background of the other photos, and do not copy any other garment from them. Everything else in ${person} stays unchanged.`;
  }
  const from = list(slots.map((s, i) => `the ${s} from image ${i + 2}`));
  const refs = list(slots.map((_, i) => `image ${i + 2}`));
  const Refs = refs.charAt(0).toUpperCase() + refs.slice(1);
  if (v === "output-spec") {
    return `Output the same picture as image 1: the same person with the same face, body, pose and framing, on the same flat magenta background. The only difference: the person's ${list(slots)} are replaced by ${from}. Images 2 and up are clothing references only; never reproduce their people, poses or backgrounds.`;
  }
  if (v === "negative-first") {
    return `Do not return any of the product photos, and do not use any face except the person in image 1. Edit image 1 (the person on the magenta background): replace only their ${list(slots)} with ${from}. Keep image 1's face, body, pose, framing and magenta background exactly as they are.`;
  }
  return `Image 1 is the person on a magenta background. It is the image to edit: the output must be this exact person (same face, body, pose and framing) on the same magenta background. ${Refs} ${n === 1 ? "is a photo of another model" : "are photos of other models"} wearing clothes, used only as clothing references. Change only the person's ${list(slots)} so they match ${from}. Do not use the face, body, pose or background of the other photos, and do not copy any other garment from them. Everything else in image 1 stays unchanged.`;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function runRound3(cases: typeof CASES) {
  mkdirSync(OUT3, { recursive: true });
  const person = await uploadPrunaFile(readFileSync(path.join(RUN, "S1", "person.png")), "lab-person.png", "image/png");
  const urls = new Map<string, string[]>();
  for (const c of cases) {
    const list: string[] = [];
    for (let i = 1; existsSync(path.join(RUN, c.id, `garment-${i}.jpg`)); i++) {
      list.push(await uploadPrunaFile(readFileSync(path.join(RUN, c.id, `garment-${i}.jpg`)), `e3-${c.id}-${i}.jpg`, "image/jpeg"));
    }
    urls.set(c.id, list);
  }
  const jobs = cases.flatMap((c) => V3S.map((v) => ({ c, v })));
  await mapLimit(jobs, 3, async ({ c, v }) => {
    const dir = path.join(OUT3, c.id);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `output-${v}.png`);
    if (existsSync(file)) return;
    const garments = urls.get(c.id) ?? [];
    try {
      const { image } = await editPrunaImage({
        prompt: prompt3(v, c.slots),
        imageUrls: v === "person-last" ? [...garments, person] : [person, ...garments],
        aspectRatio: "3:4",
        seed: V3_INFO[v].seed,
      });
      writeFileSync(file, image);
      console.log(`ok   ${c.id} ${v}`);
    } catch (e) {
      console.log(`FAIL ${c.id} ${v}: ${e instanceof Error ? e.message : e}`);
    }
  });
}

// ---------------- report ----------------
interface Card {
  title: string;
  sub?: string;
  prompt: string;
  file: string;
}
function buildReport() {
  mkdirSync(REPORT, { recursive: true });
  for (const entry of readdirSync(RUN, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const link = path.join(REPORT, entry.name);
    if (!existsSync(link)) symlinkSync(path.join(RUN, entry.name), link, "junction");
  }
  const img = (rel: string) =>
    existsSync(path.join(RUN, rel))
      ? `<a href="${rel}" target="_blank"><img loading="lazy" src="${rel}"></a>`
      : `<div class="missing">missing<br>${esc(rel)}</div>`;
  const group = (name: string, blurb: string, cards: Card[]) =>
    `<div class="approach"><h3>${esc(name)}</h3><p>${esc(blurb)}</p><div class="row">${cards
      .map(
        (k) => `<figure class="out"><figcaption><b>${esc(k.title)}</b>${k.sub ? `<br><span class="p">${esc(k.sub)}</span>` : ""}<pre>${esc(k.prompt)}</pre></figcaption>${img(k.file)}</figure>`,
      )
      .join("")}</div></div>`;

  const sections = CASES.map((c) => {
    const inputs = [
      `<figure><figcaption><b>person image</b> (magenta plate, 3:4)</figcaption>${img(`${c.id}/person.png`)}</figure>`,
      ...c.labels.map((l, i) => `<figure><figcaption><b>merchant photo ${i + 1}</b><br>${esc(l)}</figcaption>${img(`${c.id}/garment-${i + 1}.jpg`)}</figure>`),
    ].join("");
    const r1 = (["simple", "strict", "replace"] as const).map((v) => ({
      title: `Round 1: ${v}`,
      sub: "images: [person, photos...], aspect = match input",
      prompt: editV1(v, c.slots),
      file: `edit/${c.id}/output-${v}.png`,
    }));
    const r2 = (["structured", "short"] as const).map((v) => ({
      title: `Round 2: ${v}`,
      sub: "images: [person, photos...], aspect 3:4",
      prompt: editV2(v, c.slots),
      file: `edit2/${c.id}/output-${v}.png`,
    }));
    const r3 = V3S.map((v) => ({
      title: `Round 3: ${V3_INFO[v].title}`,
      sub: `images: ${V3_INFO[v].order}, aspect 3:4, seed ${V3_INFO[v].seed}`,
      prompt: prompt3(v, c.slots),
      file: `edit3/${c.id}/output-${v}.png`,
    }));
    return `<section id="${c.id}"><h2>${c.id}: ${esc(c.title)}</h2><h3>Inputs</h3><div class="row">${inputs}</div>${group("Round 3 (new): p-image-edit, new image orders and prompt structures", "All use p-image-edit only. No try-on model, no isolation.", r3)}${group("Round 2: p-image-edit, avatar-style prompts", "Earlier run, kept for comparison.", r2)}${group("Round 1: p-image-edit, one-line prompts", "Earlier run, kept for comparison.", r1)}</section>`;
  }).join("");

  const nav = CASES.map((c) => `<a href="#${c.id}">${c.id}</a>`).join(" ");
  const html = `<!doctype html><meta charset="utf-8"><title>p-image-edit only</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#eee;color:#111}
header{position:sticky;top:0;background:#111;color:#fff;padding:10px 20px;z-index:5}header a{color:#7cf;margin-right:12px;font-weight:bold}
section{background:#fff;margin:20px;padding:16px 20px;border-radius:10px}
h2{margin:0 0 8px}h3{margin:18px 0 4px}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;width:300px;font-size:12px}figure img{width:300px;background:#ddd;display:block;margin-top:6px}
figure.out figcaption pre{white-space:pre-wrap;background:#fff8d6;padding:6px;margin:4px 0;font-size:11px;max-height:170px;overflow:auto}
.p{font-size:10px;color:#555}.approach{border-top:2px solid #ddd;margin-top:14px;padding-top:4px}.approach p{margin:0 0 8px;color:#555;font-size:13px}
.missing{width:300px;height:120px;background:#fdd;font-size:11px;padding:6px;box-sizing:border-box}
</style><header>p-image-edit only (no try-on model, no isolation). Jump to: ${nav} (click an image to open it full size)</header>${sections}`;
  writeFileSync(path.join(REPORT, "index.html"), html);
  console.log("report:", path.join(REPORT, "index.html"));
}

async function main() {
  const args = process.argv.slice(2);
  const wanted = args.filter((a) => !a.startsWith("--"));
  if (!args.includes("--report-only")) {
    await runRound3(CASES.filter((c) => wanted.length === 0 || wanted.includes(c.id)));
  }
  buildReport();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
