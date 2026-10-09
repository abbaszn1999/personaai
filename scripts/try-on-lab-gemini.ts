/**
 * Try-on lab: Gemini Nano Banana 2.1 (gemini-nano-banana-2.1) as the try-on, same 9 cases as the
 * seeds / edit-final rounds. Person is image 1, merchant photos are image 2+. Two prompts per case
 * (direct, a bit more detail), category words only, no colours. Each runs twice (the interactions
 * API documents no seed, so "run 1/2" are two independent generations of identical inputs).
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab-gemini.ts [N1 N6 ...] [--runs=2]
 *   npx tsx scripts/try-on-lab-gemini.ts --report-only
 *
 * Writes to scripts/out/try-on-lab/gemini/ only. Records the latency of every call. Test-only.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("scripts/out/try-on-lab");
const SRC = path.join(ROOT, "seeds");
const OUT = path.join(ROOT, "gemini");
const MODEL = "gemini-nano-banana-2.1";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

type Slot = "top" | "trousers" | "jacket" | "shoes";
const G: Record<string, { slot: Slot; item: string; leak: string }> = {
  BLUE_POLO: { slot: "top", item: "light blue long-sleeved polo", leak: "dark grey trousers" },
  OLIVE_POLO: { slot: "top", item: "dark olive short-sleeved polo", leak: "black belt, dark jeans" },
  OFFWHITE_TROUSERS: { slot: "trousers", item: "off-white trousers", leak: "burgundy sweater vest, white tee, brown shoes" },
  OLIVE_CARGO: { slot: "trousers", item: "olive green cargo trousers", leak: "white sneakers, white top edge" },
  BEIGE_COAT: { slot: "jacket", item: "cream/beige long coat", leak: "black trousers, dark inner top" },
  NAVY_PUFFER: { slot: "jacket", item: "navy puffer jacket", leak: "grey sweater, dark grey trousers" },
  NAVY_SHOES: { slot: "shoes", item: "navy leather shoes with white sole", leak: "blue jeans" },
};
const CASES: { id: string; title: string; garments: string[] }[] = [
  { id: "N1", title: "Single top", garments: ["BLUE_POLO"] },
  { id: "N2", title: "Single trousers", garments: ["OFFWHITE_TROUSERS"] },
  { id: "N3", title: "Single trousers (cropped photo)", garments: ["OLIVE_CARGO"] },
  { id: "N4", title: "Single jacket", garments: ["NAVY_PUFFER"] },
  { id: "N5", title: "Single shoes", garments: ["NAVY_SHOES"] },
  { id: "N6", title: "Bundle of 2: top + trousers", garments: ["BLUE_POLO", "OFFWHITE_TROUSERS"] },
  { id: "N7", title: "Bundle of 3: top + trousers + jacket", garments: ["BLUE_POLO", "OLIVE_CARGO", "NAVY_PUFFER"] },
  { id: "N8", title: "Bundle of 3: top + trousers + shoes", garments: ["OLIVE_POLO", "OFFWHITE_TROUSERS", "NAVY_SHOES"] },
  { id: "N9", title: "Bundle of 4: jacket + top + trousers + shoes", garments: ["BEIGE_COAT", "BLUE_POLO", "OLIVE_CARGO", "NAVY_SHOES"] },
];

type Variant = "direct" | "detailed";
const VARIANTS: Variant[] = ["direct", "detailed"];
const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function promptFor(v: Variant, slots: Slot[]): string {
  const from = list(slots.map((s, i) => `the ${s} from image ${i + 2}`));
  if (v === "direct") return `Dress the person in image 1 in ${from}.`;
  return `Edit image 1: replace only the person's ${list(slots)} with ${from}. Keep the person's face, body, pose and the magenta background unchanged. Ignore everything else worn in the other images.`;
}

const b64 = (file: string) => readFileSync(file).toString("base64");

interface Timing {
  ms: number;
}
async function generate(prompt: string, files: { file: string; mime: string }[]): Promise<{ image: Buffer; ms: number }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const body = {
    model: MODEL,
    input: [
      { type: "text", text: prompt },
      ...files.map((f) => ({ type: "image", mime_type: f.mime, data: b64(f.file) })),
    ],
    response_format: { type: "image", aspect_ratio: "3:4", image_size: "1K" },
  };
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  const data: string | undefined = json.output_image?.data ?? findImage(json);
  if (!data) throw new Error(`no image in response: ${text.slice(0, 400)}`);
  return { image: Buffer.from(data, "base64"), ms };
}

function findImage(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const o = node as Record<string, unknown>;
  if (o.type === "image" && typeof o.data === "string") return o.data;
  for (const v of Object.values(o)) {
    const r = findImage(v);
    if (r) return r;
  }
  return undefined;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

const timingsFile = path.join(OUT, "timings.json");
const loadTimings = (): Record<string, Timing> =>
  existsSync(timingsFile) ? JSON.parse(readFileSync(timingsFile, "utf8")) : {};

async function run(cases: typeof CASES, runs: number) {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(path.join(SRC, "person.png"), path.join(OUT, "person.png"));
  for (const k of new Set(cases.flatMap((c) => c.garments))) copyFileSync(path.join(SRC, `photo-${k}.jpg`), path.join(OUT, `photo-${k}.jpg`));
  const timings = loadTimings();
  const jobs = cases.flatMap((c) =>
    Array.from({ length: runs }, (_, i) => i + 1).flatMap((r) => VARIANTS.map((v) => ({ c, r, v }))),
  );
  await mapLimit(jobs, 3, async ({ c, r, v }) => {
    const dir = path.join(OUT, c.id);
    mkdirSync(dir, { recursive: true });
    const name = `output-${v}-run${r}`;
    const file = path.join(dir, `${name}.png`);
    if (existsSync(file)) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { image, ms } = await generate(promptFor(v, c.garments.map((k) => G[k].slot)), [
          { file: path.join(OUT, "person.png"), mime: "image/png" },
          ...c.garments.map((k) => ({ file: path.join(OUT, `photo-${k}.jpg`), mime: "image/jpeg" })),
        ]);
        writeFileSync(file, image);
        timings[`${c.id}/${name}`] = { ms };
        writeFileSync(timingsFile, JSON.stringify(timings, null, 1));
        console.log(`ok   ${c.id} ${v} run ${r}  ${(ms / 1000).toFixed(1)}s`);
        return;
      } catch (e) {
        console.log(`FAIL ${c.id} ${v} run ${r} (attempt ${attempt}): ${e instanceof Error ? e.message : e}`);
      }
    }
  });
}

function report(runs: number) {
  const timings = loadTimings();
  const img = (rel: string) =>
    existsSync(path.join(OUT, rel))
      ? `<a href="${rel}" target="_blank"><img loading="lazy" src="${rel}"></a>`
      : `<div class="missing">no output (call failed)<br>${esc(rel)}</div>`;
  const all = Object.values(timings).map((t) => t.ms).sort((a, b) => a - b);
  const stat = all.length
    ? `Latency over ${all.length} calls: median ${(all[Math.floor(all.length / 2)] / 1000).toFixed(1)}s, fastest ${(all[0] / 1000).toFixed(1)}s, slowest ${(all[all.length - 1] / 1000).toFixed(1)}s`
    : "";
  const sections = CASES.map((c) => {
    const slots = c.garments.map((k) => G[k].slot);
    const inputs = [
      `<figure><figcaption><b>image 1</b><br>the person</figcaption>${img("person.png")}</figure>`,
      ...c.garments.map(
        (k, i) =>
          `<figure><figcaption><b>image ${i + 2}</b> (${G[k].slot})<br>Wanted: <b>${esc(G[k].item)}</b><br><span class="leak">Leak markers: ${esc(G[k].leak)}</span></figcaption>${img(`photo-${k}.jpg`)}</figure>`,
      ),
    ].join("");
    const rows = VARIANTS.map((v) => {
      const cards = Array.from({ length: runs }, (_, i) => i + 1)
        .map((r) => {
          const t = timings[`${c.id}/output-${v}-run${r}`];
          return `<figure class="out"><figcaption><b>Run ${r}</b>${t ? ` <span class="t">${(t.ms / 1000).toFixed(1)}s</span>` : ""}</figcaption>${img(`${c.id}/output-${v}-run${r}.png`)}</figure>`;
        })
        .join("");
      return `<div class="approach"><h3>${v === "direct" ? "Prompt A: direct" : "Prompt B: a bit more detail"}</h3><pre>${esc(promptFor(v, slots))}</pre><div class="row">${cards}</div></div>`;
    }).join("");
    return `<section id="${c.id}"><h2>${c.id}: ${esc(c.title)}</h2><div class="row">${inputs}</div><div class="guide">Good result = the person from image 1 wearing ${list(c.garments.map((k) => `the <b>${esc(G[k].item)}</b>`))}, nothing else changed. Bad = a different person, or any leak marker visible.</div>${rows}</section>`;
  }).join("");
  const nav = CASES.map((c) => `<a href="#${c.id}">${c.id}</a>`).join(" ");
  const html = `<!doctype html><meta charset="utf-8"><title>Gemini Nano Banana 2.1 try-on</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#eee;color:#111}
header{position:sticky;top:0;background:#111;color:#fff;padding:10px 20px;z-index:5}header a{color:#7cf;margin-right:12px;font-weight:bold}
section{background:#fff;margin:20px;padding:16px 20px;border-radius:10px}
h2{margin:0 0 8px}h3{margin:10px 0 4px}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;width:300px;font-size:12px}figure img{width:300px;background:#ddd;display:block;margin-top:6px}
.leak{color:#b00}.t{color:#060;font-weight:bold}.guide{background:#eef7ff;padding:8px 10px;margin:12px 0;font-size:13px;border-radius:6px}
pre{white-space:pre-wrap;background:#fff8d6;padding:6px;margin:4px 0 8px;font-size:12px;max-width:640px}
.approach{border-top:2px solid #ddd;margin-top:10px;padding-top:2px}
.missing{width:300px;min-height:120px;background:#fdd;font-size:11px;padding:6px;box-sizing:border-box}
</style><header>Gemini Nano Banana 2.1 (${MODEL}). Person is image 1. Two prompts, ${runs} runs each. ${stat}. Jump to: ${nav}</header>${sections}`;
  writeFileSync(path.join(OUT, "index.html"), html);
  console.log("report:", path.join(OUT, "index.html"), stat);
}

async function main() {
  const args = process.argv.slice(2);
  const wanted = args.filter((a) => !a.startsWith("--"));
  const runs = Number(args.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 2);
  mkdirSync(OUT, { recursive: true });
  if (!args.includes("--report-only")) await run(CASES.filter((c) => wanted.length === 0 || wanted.includes(c.id)), runs);
  report(runs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
