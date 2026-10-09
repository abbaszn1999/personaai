/**
 * Try-on lab, seeds round: p-image-try-on only, on NEW cases built from garments that are easy to
 * tell apart by eye (each merchant photo shows a different distinctive colour), run with several
 * seeds. Lets you see which photo each part of the output came from, and how stable it is.
 *
 *   npx tsx --env-file=.env.local scripts/try-on-lab-seeds.ts [N1 N6 ...]
 *   npx tsx scripts/try-on-lab-seeds.ts --report-only
 *
 * Writes to scripts/out/try-on-lab/seeds/ only (own folder, own port). Test-only.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prunaTryOn, uploadPrunaFile } from "../src/lib/ai/pruna";

const ROOT = path.resolve("scripts/out/try-on-lab");
const CAND = path.join(ROOT, "candidates2");
const OUT = path.join(ROOT, "seeds");
const SEEDS = [7, 123];

type Slot = "top" | "trousers" | "jacket" | "shoes";
interface Garment {
  key: string;
  file: string;
  slot: Slot;
  /** What the garment is, i.e. what should show up in the output. */
  item: string;
  /** Distinctive things in the merchant photo that are NOT the garment: if one shows up in the output, it leaked. */
  leakMarkers: string;
}
const G: Record<string, Garment> = {
  BLUE_POLO: { key: "BLUE_POLO", file: "15420249768178.jpg", slot: "top", item: "light blue long-sleeved polo", leakMarkers: "dark grey trousers" },
  OLIVE_POLO: { key: "OLIVE_POLO", file: "9272145707250.jpg", slot: "top", item: "dark olive short-sleeved polo", leakMarkers: "black belt, dark jeans" },
  OFFWHITE_TROUSERS: { key: "OFFWHITE_TROUSERS", file: "15407815688434.jpg", slot: "trousers", item: "off-white trousers", leakMarkers: "burgundy sweater vest, white tee, brown shoes" },
  OLIVE_CARGO: { key: "OLIVE_CARGO", file: "9272143544562.jpg", slot: "trousers", item: "olive green cargo trousers", leakMarkers: "white sneakers, white top edge" },
  BEIGE_COAT: { key: "BEIGE_COAT", file: "9234940690674.jpg", slot: "jacket", item: "cream/beige long coat", leakMarkers: "black trousers, dark inner top" },
  NAVY_PUFFER: { key: "NAVY_PUFFER", file: "10314769432818.jpg", slot: "jacket", item: "navy puffer jacket", leakMarkers: "grey sweater, dark grey trousers" },
  NAVY_SHOES: { key: "NAVY_SHOES", file: "9175266492658.jpg", slot: "shoes", item: "navy leather shoes with white sole", leakMarkers: "blue jeans" },
};
const CASES: { id: string; title: string; garments: string[] }[] = [
  { id: "N1", title: "Single top", garments: ["BLUE_POLO"] },
  { id: "N2", title: "Single trousers (photo also shows a burgundy vest + brown shoes)", garments: ["OFFWHITE_TROUSERS"] },
  { id: "N3", title: "Single trousers (cropped photo with white sneakers)", garments: ["OLIVE_CARGO"] },
  { id: "N4", title: "Single jacket (photo also shows a grey sweater)", garments: ["NAVY_PUFFER"] },
  { id: "N5", title: "Single shoes (photo also shows blue jeans)", garments: ["NAVY_SHOES"] },
  { id: "N6", title: "Bundle of 2: top + trousers", garments: ["BLUE_POLO", "OFFWHITE_TROUSERS"] },
  { id: "N7", title: "Bundle of 3: top + trousers + jacket", garments: ["BLUE_POLO", "OLIVE_CARGO", "NAVY_PUFFER"] },
  { id: "N8", title: "Bundle of 3: top + trousers + shoes", garments: ["OLIVE_POLO", "OFFWHITE_TROUSERS", "NAVY_SHOES"] },
  { id: "N9", title: "Bundle of 4: jacket + top + trousers + shoes", garments: ["BEIGE_COAT", "BLUE_POLO", "OLIVE_CARGO", "NAVY_SHOES"] },
];

type Mode = "none" | "category";
const MODES: Mode[] = ["none", "category"];
const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const promptFor = (mode: Mode, slots: Slot[]) =>
  mode === "none" ? undefined : `Dress the person in ${list(slots.map((s, i) => `the ${s} from image ${i + 1}`))}.`;

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
  copyFileSync(path.join(ROOT, "run", "S1", "person.png"), path.join(OUT, "person.png"));
  const personUrl = await uploadPrunaFile(readFileSync(path.join(OUT, "person.png")), "seeds-person.png", "image/png");

  const urls = new Map<string, string>();
  const keys = [...new Set(cases.flatMap((c) => c.garments))];
  await Promise.all(
    keys.map(async (k) => {
      const jpeg = await sharp(readFileSync(path.join(CAND, G[k].file))).rotate().jpeg({ quality: 92 }).toBuffer();
      writeFileSync(path.join(OUT, `photo-${k}.jpg`), jpeg);
      urls.set(k, await uploadPrunaFile(jpeg, `seeds-${k}.jpg`, "image/jpeg"));
    }),
  );

  const jobs = cases.flatMap((c) => SEEDS.flatMap((seed) => MODES.map((mode) => ({ c, seed, mode }))));
  await mapLimit(jobs, 3, async ({ c, seed, mode }) => {
    const dir = path.join(OUT, c.id);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `output-${mode}-seed${seed}.png`);
    if (existsSync(file)) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { image } = await prunaTryOn({
          personImageUrl: personUrl,
          garmentImageUrls: c.garments.map((k) => urls.get(k) as string),
          prompt: promptFor(mode, c.garments.map((k) => G[k].slot)),
          seed,
        });
        writeFileSync(file, image);
        console.log(`ok   ${c.id} ${mode} seed ${seed}`);
        return;
      } catch (e) {
        console.log(`FAIL ${c.id} ${mode} seed ${seed} (attempt ${attempt}): ${e instanceof Error ? e.message : e}`);
      }
    }
  });
}

function report() {
  const failures: Record<string, string> = existsSync(path.join(OUT, "failures.json"))
    ? JSON.parse(readFileSync(path.join(OUT, "failures.json"), "utf8").replace(/^\uFEFF/, ""))
    : {};
  const img = (rel: string) =>
    existsSync(path.join(OUT, rel))
      ? `<a href="${rel}" target="_blank"><img loading="lazy" src="${rel}"></a>`
      : `<div class="missing">${failures[rel] ? `<b>Pruna rejected this call:</b><br>${esc(failures[rel])}` : `missing<br>${esc(rel)}`}</div>`;
  const sections = CASES.map((c) => {
    const slots = c.garments.map((k) => G[k].slot);
    const inputs = [
      `<figure><figcaption><b>person_image</b></figcaption>${img("person.png")}</figure>`,
      ...c.garments.map(
        (k, i) =>
          `<figure><figcaption><b>image ${i + 1}</b> (${G[k].slot})<br>Wanted: <b>${esc(G[k].item)}</b><br><span class="leak">Leak markers: ${esc(G[k].leakMarkers)}</span></figcaption>${img(`photo-${k}.jpg`)}</figure>`,
      ),
    ].join("");
    const guide = `<div class="guide"><b>How to read the outputs:</b> ${c.garments
      .map((k, i) => `image ${i + 1} gives the <b>${esc(G[k].item)}</b>`)
      .join("; ")}. If you see ${list(c.garments.map((k) => G[k].leakMarkers))} on the person, that item leaked from the merchant photo.</div>`;
    const rows = MODES.map((mode) => {
      const p = promptFor(mode, slots);
      const cards = SEEDS.map(
        (seed) =>
          `<figure class="out"><figcaption><b>${mode === "none" ? "No prompt (today)" : "Category prompt"}, seed ${seed}</b></figcaption>${img(`${c.id}/output-${mode}-seed${seed}.png`)}</figure>`,
      ).join("");
      return `<div class="approach"><h3>${mode === "none" ? "No prompt (what the app does today)" : "Category prompt"}</h3><pre>${p ? esc(p) : "(no prompt sent)"}</pre><div class="row">${cards}</div></div>`;
    }).join("");
    return `<section id="${c.id}"><h2>${c.id}: ${esc(c.title)}</h2><div class="row">${inputs}</div>${guide}${rows}</section>`;
  }).join("");
  const nav = CASES.map((c) => `<a href="#${c.id}">${c.id}</a>`).join(" ");
  const html = `<!doctype html><meta charset="utf-8"><title>Try-on seeds lab</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#eee;color:#111}
header{position:sticky;top:0;background:#111;color:#fff;padding:10px 20px;z-index:5}header a{color:#7cf;margin-right:12px;font-weight:bold}
section{background:#fff;margin:20px;padding:16px 20px;border-radius:10px}
h2{margin:0 0 8px}h3{margin:10px 0 4px}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;width:300px;font-size:12px}figure img{width:300px;background:#ddd;display:block;margin-top:6px}
.leak{color:#b00}.guide{background:#eef7ff;padding:8px 10px;margin:12px 0;font-size:13px;border-radius:6px}
pre{white-space:pre-wrap;background:#fff8d6;padding:6px;margin:4px 0 8px;font-size:11px;max-width:620px}
.approach{border-top:2px solid #ddd;margin-top:10px;padding-top:2px}
.missing{width:300px;min-height:120px;background:#fdd;font-size:11px;padding:6px;box-sizing:border-box}
</style><header>p-image-try-on, new cases, seeds ${SEEDS.join(" and ")}. Jump to: ${nav} (click an image to open it full size)</header>${sections}`;
  writeFileSync(path.join(OUT, "index.html"), html);
  console.log("report:", path.join(OUT, "index.html"));
}

async function main() {
  const args = process.argv.slice(2);
  const wanted = args.filter((a) => !a.startsWith("--"));
  if (!args.includes("--report-only")) await run(CASES.filter((c) => wanted.length === 0 || wanted.includes(c.id)));
  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
