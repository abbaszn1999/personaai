/**
 * Try-on lab: real Pruna calls that show how p-image-try-on behaves when the merchant photo is a
 * model wearing a whole outfit, with and without the experimental `prompt`.
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab.ts            # run everything
 *   npx tsx --env-file=.env.local scripts/try-on-lab.ts S1 B2      # only those cases
 *   npx tsx --env-file=.env.local scripts/try-on-lab.ts --dry      # write the report, no API calls
 *
 * Test-only: nothing here touches production code, the database or billing.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { flattenOntoChromaKey } from "../src/lib/ai/background-removal";
import { prunaTryOn, uploadPrunaFile } from "../src/lib/ai/pruna";

const LAB = path.resolve("scripts/out/try-on-lab");
const CANDIDATES = path.join(LAB, "candidates");
const SEED = 42;
const CONCURRENCY = 3;

const AVATAR = path.join(LAB, "avatar-1.png");

interface Garment {
  /** File in candidates/. */
  file: string;
  /** What the merchant listed this image as (for the report only, never sent). */
  label: string;
  /** What else is visible in the photo (for the report only). */
  extra: string;
}

type Mode = "none" | "category" | "strict";

export interface Case {
  id: string;
  title: string;
  note: string;
  garments: Garment[];
  prompts: Record<Mode, string | undefined>;
}

const POLO: Garment = {
  file: "15420250489074-1.jpg",
  label: "Beige long-sleeved polo",
  extra: "also shows dark teal trousers",
};
const TEE_FULL: Garment = {
  file: "15407811297522-2.jpg",
  label: "Off-white long-sleeved t-shirt",
  extra: "also shows black trousers + black shoes",
};
const TROUSERS: Garment = {
  file: "15407814410482-1.jpg",
  label: "Navy cotton trousers",
  extra: "also shows navy blazer, white tee, brown shoes",
};
const JACKET: Garment = {
  file: "15407815360754-2.jpg",
  label: "Black cotton jacket",
  extra: "also shows white tee, black trousers, black shoes",
};
const BOMBER: Garment = {
  file: "15407816409330-2.jpg",
  label: "Navy coat / bomber",
  extra: "also shows white tee + checked shirt, grey trousers",
};
const SNEAKERS: Garment = {
  file: "10313039413490-1.jpg",
  label: "Navy leather low-top sneakers",
  extra: "also shows grey trousers",
};

/** Only the garment category is ever sent: production has no vision step that could name a colour. */
type Slot = "top" | "trousers" | "jacket" | "shoes";

const ORDINAL = (i: number) => `image ${i + 1}`;

function categoryPrompt(slots: Slot[]): string {
  const parts = slots.map((s, i) => `the ${s} from ${ORDINAL(i)}`);
  return `Dress the person in ${joinList(parts)}.`;
}

function strictPrompt(slots: Slot[]): string {
  const parts = slots.map((s, i) => `the ${s} from ${ORDINAL(i)}`);
  const only = slots.length === 1 ? "only " : "only ";
  return `Dress the person in ${only}${joinList(parts)}. Ignore everything else the model wears in the reference photos, and keep the rest of the person's outfit unchanged.`;
}

function joinList(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function def(id: string, title: string, note: string, garments: Garment[], slots: Slot[]): Case {
  return {
    id,
    title,
    note,
    garments,
    prompts: { none: undefined, category: categoryPrompt(slots), strict: strictPrompt(slots) },
  };
}

export const CASES: Case[] = [
  def("S1", "Single top, model also wears trousers", "Avatar trousers are light blue-grey; the polo photo has dark teal trousers.", [POLO], ["top"]),
  def("S2", "Single top, full-body shot with trousers and shoes", "Avatar trousers are light blue-grey; the tee photo has black trousers.", [TEE_FULL], ["top"]),
  def("S3", "Single trousers, model also wears blazer and tee", "Avatar jacket is light blue-grey; the trousers photo has a navy blazer.", [TROUSERS], ["trousers"]),
  def("S4", "Single jacket, model also wears tee and trousers", "The jacket photo has a white tee and black trousers.", [JACKET], ["jacket"]),
  def("S5", "Single sneakers, cropped legs photo", "The sneakers photo has grey trousers.", [SNEAKERS], ["shoes"]),
  def("B1", "Bundle of 2: top + trousers", "Both photos show other garments too.", [TEE_FULL, TROUSERS], ["top", "trousers"]),
  def("B2", "Bundle of 3: jacket + top + trousers", "Three model photos, each wearing other things.", [BOMBER, TEE_FULL, TROUSERS], ["jacket", "top", "trousers"]),
  def("B3", "Bundle of 3: top + trousers + shoes", "The trousers appear in all three photos.", [POLO, TROUSERS, SNEAKERS], ["top", "trousers", "shoes"]),
];

const MODES: Mode[] = ["none", "category", "strict"];

interface ModeResult {
  mode: Mode;
  prompt: string | null;
  output: string | null;
  error: string | null;
  seconds: number | null;
}

async function toJpeg(file: string): Promise<Buffer> {
  return sharp(readFileSync(path.join(CANDIDATES, file))).rotate().jpeg({ quality: 92 }).toBuffer();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(runDir: string, results: Map<string, ModeResult[]>): string {
  const blocks = CASES.filter((c) => results.has(c.id)).map((c) => {
    const garments = c.garments
      .map(
        (g, i) => `<figure><img src="${c.id}/garment-${i + 1}.jpg"><figcaption><b>image ${i + 1}</b><br>${escapeHtml(g.label)}<br><i>${escapeHtml(g.extra)}</i></figcaption></figure>`,
      )
      .join("");
    const outs = (results.get(c.id) ?? [])
      .map(
        (r) => `<div class="mode"><h4>${r.mode === "none" ? "No prompt (today)" : r.mode === "category" ? "Category prompt" : "Category prompt + ignore the rest"}</h4>
<pre>${r.prompt ? escapeHtml(r.prompt) : "(no prompt sent)"}</pre>
${r.output ? `<img src="${c.id}/output-${r.mode}.png">` : `<p class="err">${escapeHtml(r.error ?? "failed")}</p>`}
<small>${r.seconds ? r.seconds.toFixed(1) + "s" : ""}</small></div>`,
      )
      .join("");
    return `<section><h2>${c.id}: ${escapeHtml(c.title)}</h2><p>${escapeHtml(c.note)}</p>
<div class="row"><figure><img src="${c.id}/person.png"><figcaption><b>person_image</b></figcaption></figure>
<div class="garments">${garments}</div></div><div class="row modes">${outs}</div></section>`;
  });
  return `<!doctype html><meta charset="utf-8"><title>Try-on lab</title><style>
body{font-family:system-ui;margin:24px;background:#f4f4f4}section{background:#fff;padding:16px;margin:0 0 24px;border-radius:8px}
.row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}.garments{display:flex;gap:12px}
figure{margin:0;text-align:center;font-size:12px}figure img{height:260px;background:#ddd}
.mode{flex:1;min-width:260px}.mode img{width:100%;max-width:300px;background:#ddd}pre{white-space:pre-wrap;font-size:12px;background:#f0f0f0;padding:8px}
.err{color:#b00}</style><h1>Try-on lab (seed ${SEED}, turbo on)</h1>${blocks.join("")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const wanted = args.filter((a) => !a.startsWith("--"));
  const cases = CASES.filter((c) => wanted.length === 0 || wanted.includes(c.id));

  const runDir = path.join(LAB, "run");
  mkdirSync(runDir, { recursive: true });

  const personPlated = await flattenOntoChromaKey(readFileSync(AVATAR).toString("base64"));
  const resultsPath = path.join(runDir, "results.json");
  const results = new Map<string, ModeResult[]>(
    existsSync(resultsPath) ? Object.entries(JSON.parse(readFileSync(resultsPath, "utf8")) as Record<string, ModeResult[]>).map(([id, list]) => [id, list.filter((r) => (MODES as string[]).includes(r.mode))] as [string, ModeResult[]]) : [],
  );

  if (args.includes("--report-only")) {
    writeFileSync(path.join(runDir, "index.html"), renderHtml(runDir, results));
    console.log("report rebuilt from results.json (no API calls)");
    return;
  }

  for (const c of cases) {
    const dir = path.join(runDir, c.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "person.png"), await sharp(personPlated).png().toBuffer());
    const jpegs = await Promise.all(c.garments.map((g) => toJpeg(g.file)));
    jpegs.forEach((buf, i) => writeFileSync(path.join(dir, `garment-${i + 1}.jpg`), buf));
  }

  if (!dry) {
    const personUrl = await uploadPrunaFile(
      await sharp(personPlated).png().toBuffer(),
      "lab-person.png",
      "image/png",
    );
    console.log(`person uploaded; running ${cases.length * MODES.length} predictions`);

    const onlyModes = (args.find((a) => a.startsWith("--modes="))?.slice(8).split(",") ?? MODES) as Mode[];
    const jobs = cases.flatMap((c) => onlyModes.map((mode) => ({ c, mode })));
    // Garment uploads are shared by the three modes of one case.
    const garmentUrls = new Map<string, string[]>();
    for (const c of cases) {
      const urls = await Promise.all(
        c.garments.map(async (g, i) =>
          uploadPrunaFile(readFileSync(path.join(runDir, c.id, `garment-${i + 1}.jpg`)), `lab-${c.id}-${i + 1}.jpg`, "image/jpeg"),
        ),
      );
      garmentUrls.set(c.id, urls);
    }

    await mapLimit(jobs, CONCURRENCY, async ({ c, mode }) => {
      const prompt = c.prompts[mode];
      const started = Date.now();
      const entry: ModeResult = { mode, prompt: prompt ?? null, output: null, error: null, seconds: null };
      try {
        const { image } = await prunaTryOn({
          personImageUrl: personUrl,
          garmentImageUrls: garmentUrls.get(c.id) ?? [],
          prompt,
          seed: SEED,
        });
        const file = `output-${mode}.png`;
        writeFileSync(path.join(runDir, c.id, file), image);
        entry.output = file;
        entry.seconds = (Date.now() - started) / 1000;
        console.log(`ok   ${c.id} ${mode} (${entry.seconds.toFixed(1)}s)`);
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        console.log(`FAIL ${c.id} ${mode}: ${entry.error}`);
      }
      const list = (results.get(c.id) ?? []).filter((r) => r.mode !== mode);
      list.push(entry);
      list.sort((a, b) => MODES.indexOf(a.mode) - MODES.indexOf(b.mode));
      results.set(c.id, list);
    });
  } else {
    for (const c of cases) {
      results.set(c.id, MODES.map((mode) => ({ mode, prompt: c.prompts[mode] ?? null, output: null, error: "dry run", seconds: null })));
    }
  }

  writeFileSync(resultsPath, JSON.stringify(Object.fromEntries(results), null, 2));
  writeFileSync(path.join(runDir, "index.html"), renderHtml(runDir, results));
  console.log(`report: ${path.join(runDir, "index.html")}`);
}

if (process.argv[1]?.endsWith("try-on-lab.ts")) main().catch((error) => {
  console.error(error);
  process.exit(1);
});