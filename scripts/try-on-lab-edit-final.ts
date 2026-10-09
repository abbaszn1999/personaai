/**
 * Try-on lab, FINAL p-image-edit test. p-image-edit only (no try-on model, no isolation).
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab-edit-final.ts [N1 N6 ...]
 *   npx tsx scripts/try-on-lab-edit-final.ts --report-only
 *
 * - Same 9 cases as the seeds round (garment photos that are easy to tell apart), inputs read from seeds/.
 * - The person is ALWAYS image 1, the merchant photos are image 2, 3, ...
 * - Exactly two prompts per case: "direct" and "detailed". Category words only, no colours.
 * - Seeds 7 and 123, to show whether a result is stable.
 * Writes to scripts/out/try-on-lab/edit-final/ only. Test-only.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { editPrunaImage, uploadPrunaFile } from "../src/lib/ai/pruna";

const ROOT = path.resolve("scripts/out/try-on-lab");
const SRC = path.join(ROOT, "seeds");
const OUT = path.join(ROOT, "edit-final");
const SEEDS = [7, 123];

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

/** Person is image 1, garment photos are image 2.. */
function promptFor(v: Variant, slots: Slot[]): string {
  const from = list(slots.map((s, i) => `the ${s} from image ${i + 2}`));
  if (v === "direct") return `Dress the person in image 1 in ${from}.`;
  return `Edit image 1: replace only the person's ${list(slots)} with ${from}. Keep the person's face, body, pose and the magenta background unchanged. Ignore everything else worn in the other images.`;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function run(cases: typeof CASES) {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(path.join(SRC, "person.png"), path.join(OUT, "person.png"));
  const personUrl = await uploadPrunaFile(readFileSync(path.join(OUT, "person.png")), "ef-person.png", "image/png");
  const urls = new Map<string, string>();
  for (const k of new Set(cases.flatMap((c) => c.garments))) {
    copyFileSync(path.join(SRC, `photo-${k}.jpg`), path.join(OUT, `photo-${k}.jpg`));
    urls.set(k, await uploadPrunaFile(readFileSync(path.join(OUT, `photo-${k}.jpg`)), `ef-${k}.jpg`, "image/jpeg"));
  }
  const jobs = cases.flatMap((c) => SEEDS.flatMap((seed) => VARIANTS.map((v) => ({ c, seed, v }))));
  await mapLimit(jobs, 3, async ({ c, seed, v }) => {
    const dir = path.join(OUT, c.id);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `output-${v}-seed${seed}.png`);
    if (existsSync(file)) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { image } = await editPrunaImage({
          prompt: promptFor(v, c.garments.map((k) => G[k].slot)),
          imageUrls: [personUrl, ...c.garments.map((k) => urls.get(k) as string)],
          aspectRatio: "3:4",
          seed,
        });
        writeFileSync(file, image);
        console.log(`ok   ${c.id} ${v} seed ${seed}`);
        return;
      } catch (e) {
        console.log(`FAIL ${c.id} ${v} seed ${seed} (attempt ${attempt}): ${e instanceof Error ? e.message : e}`);
      }
    }
  });
}

function report() {
  const img = (rel: string) =>
    existsSync(path.join(OUT, rel))
      ? `<a href="${rel}" target="_blank"><img loading="lazy" src="${rel}"></a>`
      : `<div class="missing">no output (call failed)<br>${esc(rel)}</div>`;
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
      const cards = SEEDS.map(
        (seed) => `<figure class="out"><figcaption><b>Seed ${seed}</b></figcaption>${img(`${c.id}/output-${v}-seed${seed}.png`)}</figure>`,
      ).join("");
      return `<div class="approach"><h3>${v === "direct" ? "Prompt A: direct" : "Prompt B: a bit more detail"}</h3><pre>${esc(promptFor(v, slots))}</pre><div class="row">${cards}</div></div>`;
    }).join("");
    return `<section id="${c.id}"><h2>${c.id}: ${esc(c.title)}</h2><div class="row">${inputs}</div><div class="guide">Good result = the person from image 1 wearing ${list(c.garments.map((k) => `the <b>${esc(G[k].item)}</b>`))}, nothing else changed. Bad = a different person, or any leak marker visible.</div>${rows}</section>`;
  }).join("");
  const nav = CASES.map((c) => `<a href="#${c.id}">${c.id}</a>`).join(" ");
  const html = `<!doctype html><meta charset="utf-8"><title>p-image-edit final</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#eee;color:#111}
header{position:sticky;top:0;background:#111;color:#fff;padding:10px 20px;z-index:5}header a{color:#7cf;margin-right:12px;font-weight:bold}
section{background:#fff;margin:20px;padding:16px 20px;border-radius:10px}
h2{margin:0 0 8px}h3{margin:10px 0 4px}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;width:300px;font-size:12px}figure img{width:300px;background:#ddd;display:block;margin-top:6px}
.leak{color:#b00}.guide{background:#eef7ff;padding:8px 10px;margin:12px 0;font-size:13px;border-radius:6px}
pre{white-space:pre-wrap;background:#fff8d6;padding:6px;margin:4px 0 8px;font-size:12px;max-width:640px}
.approach{border-top:2px solid #ddd;margin-top:10px;padding-top:2px}
.missing{width:300px;min-height:120px;background:#fdd;font-size:11px;padding:6px;box-sizing:border-box}
</style><header>p-image-edit only. Person is always image 1. Two prompts, two seeds (${SEEDS.join(", ")}). Jump to: ${nav}</header>${sections}`;
  writeFileSync(path.join(OUT, "index.html"), html);
  console.log("report:", path.join(OUT, "index.html"));
}

async function main() {
  const args = process.argv.slice(2);
  const wanted = args.filter((a) => !a.startsWith("--"));
  if (!args.includes("--report-only")) await run(CASES.filter((c) => wanted.length === 0 || wanted.includes(c.id)));
  mkdirSync(OUT, { recursive: true });
  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
