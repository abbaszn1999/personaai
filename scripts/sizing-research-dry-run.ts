/**
 * Runs Stage 4's extraction against one brand and prints what came back. Writes nothing.
 *
 * The two calls this exercises are the only expensive thing in the sizing pipeline, and until now
 * the only way to see their output was to run a whole research pass over a real connection and then
 * read the rows it left in `sizing_charts` — by which point a bad prompt had already been paid for
 * across every brand in the catalog and written into a shared registry other merchants read.
 *
 * The three columns printed per table are the three things that were wrong with the first real run:
 * a source URL (always null, because the finder was never asked for one), an audience (always
 * `unisex`, because it was inferred from a catalog that has no gender field), and a row count
 * against the transcription's own (which is where a misaligned or truncated table shows itself).
 *
 *   npm run sizing:research -- "Tommy Hilfiger" [market]
 *   npm run sizing:research -- "Tommy Hilfiger" --json
 *   npm run sizing:research -- "Tommy Hilfiger" --cache   (reuse the last search for this brand)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  chartTitleFor,
  findBrandChart,
  marketHintFor,
  normalizeTables,
  screenTables,
  type FinderResult,
} from "@/lib/sizing/research";
import { boundsFor } from "@/lib/sizing/chart-schema";
import { measurementsFor } from "@/lib/sizing/measurements";
import { assessChart } from "@/lib/sizing/chart-review";

/** Where `--cache` keeps a brand's last transcription. The finder is the slow, paid half of the
 *  pair — two and a half minutes and a web search for Tommy Hilfiger — and iterating on the
 *  normalizer's prompt or schema should not re-buy it every time. Gitignored alongside `.next`. */
const CACHE_DIR = ".sizing-dry-run";

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width).slice(0, width);
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const useCache = args.includes("--cache");
  const [brand, market] = args.filter((arg) => !arg.startsWith("--"));

  if (!brand) throw new Error('Usage: npm run sizing:research -- "<brand>" [market] [--json] [--cache]');

  const marketHint = market ?? marketHintFor(process.env.SIZING_DRY_RUN_STORE_URL);
  console.log(`Brand:  ${brand}`);
  console.log(`Market: ${marketHint}\n`);

  const cacheFile = join(CACHE_DIR, `${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  let found: FinderResult | null = null;

  if (useCache) {
    try {
      found = JSON.parse(readFileSync(cacheFile, "utf8")) as FinderResult;
      console.log(`4a finder: reusing ${cacheFile} (${found.tables.length} tables)\n`);
    } catch {
      console.log(`4a finder: no cache at ${cacheFile}, searching\n`);
    }
  }

  if (!found) {
    console.log("4a finder (web search)...");
    const started = Date.now();
    found = await findBrandChart(brand, marketHint);
    console.log(
      `  found=${found.found} confidence=${found.confidence} tables=${found.tables.length} in ${Math.round((Date.now() - started) / 1000)}s\n`
    );
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(found, null, 2));
  }

  if (found.tables.length === 0) {
    console.log("Nothing to structure.");
    return;
  }

  const { usable, rejected } = screenTables(found.tables);
  console.log(`Screening: ${usable.length} usable, ${rejected.length} dropped`);
  for (const reject of rejected) console.log(`  drop  ${pad(reject.title, 46)} ${reject.reason}`);
  console.log();

  console.log("Transcribed tables:");
  console.log(`  ${pad("AUDIENCE", 9)}${pad("GROUP", 11)}${pad("UNIT", 5)}${pad("ROWS", 5)}${pad("TITLE", 44)}SOURCE`);
  for (const table of usable) {
    console.log(
      `  ${pad(table.audience, 9)}${pad(table.garmentGroup, 11)}${pad(table.unit, 5)}${pad(table.rows.length, 5)}${pad(table.title, 44)}${table.sourceUrl}`
    );
  }
  console.log();

  if (usable.length === 0) return;

  console.log("4b normalizer...");
  const normalizeStarted = Date.now();
  const charts = await normalizeTables(brand, usable);
  console.log(`  ${charts?.length ?? 0} chart(s) in ${Math.round((Date.now() - normalizeStarted) / 1000)}s\n`);

  if (!charts) {
    console.log("The normalizer response could not be read.");
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(charts, null, 2));
    return;
  }

  for (const chart of charts) {
    const flags = assessChart({ rows: chart.rows, group: chart.group, sourceUrl: chart.table.sourceUrl });
    const measurements = measurementsFor(chart.group).filter((m) =>
      chart.rows.some((row) => boundsFor(row, m) !== null)
    );

    console.log(`─── ${chartTitleFor(chart.table)} [${chart.table.audience} ${chart.group}]`);
    console.log(`    ${chart.rows.length} rows from ${chart.table.rows.length} transcribed, confidence ${chart.confidence}`);
    console.log(`    measurements: ${measurements.join(", ") || "(none — this chart is unusable)"}`);
    if (flags.length > 0) console.log(`    flags: ${flags.map((f) => `${f.severity}:${f.code}`).join(", ")}`);

    for (const row of chart.rows.slice(0, 4)) {
      const bounds = measurements
        .map((m) => {
          const b = boundsFor(row, m);
          return b ? `${m}=${b.min ?? ""}-${b.max ?? ""}` : null;
        })
        .filter(Boolean)
        .join(" ");
      const aliases = Object.entries(row.aliases ?? {})
        .map(([key, value]) => `${key}:${value}`)
        .join(" ");
      console.log(`      ${pad(row.size, 10)} ${bounds}${aliases ? `  [${aliases}]` : ""}`);
    }
    if (chart.rows.length > 4) console.log(`      ... ${chart.rows.length - 4} more`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
