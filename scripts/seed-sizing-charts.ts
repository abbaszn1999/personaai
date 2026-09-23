/**
 * Writes the hand-verified charts in `src/lib/sizing/seeds` into the global registry.
 *
 * The registry had no writer other than a merchant clicking Generate in Stage 4, which meant the
 * first store to sell a brand paid for a web search and then trusted whatever came back. This is the
 * other way in: charts read off the brand's own guide, checked by `seeds.test.ts`, and written once
 * for every merchant rather than per connection.
 *
 * `connectionId` is null on every row — that is what global means, and it is not configurable here.
 * `provenance` is `manual`, which is both true and load-bearing: `deleteResearchedCharts` scopes
 * itself to `research`, so a regenerate pass can never wipe this work.
 *
 *   npm run sizing:seed -- --dry-run          show what would be written, touch nothing
 *   npm run sizing:seed -- tommy_hilfiger     one brand
 *   npm run sizing:seed                       every seeded brand
 */
import { CHART_SEEDS, type SeedChart } from "@/lib/sizing/seeds";
import { upsertChart } from "@/lib/db/sizing-charts";
import { assessChart } from "@/lib/sizing/chart-review";
import { chartHasBounds } from "@/lib/sizing/chart-schema";

/** Confidence 1, because a human read these off the brand's own page. Above
 *  `CHART_CONFIDENCE_THRESHOLD`, so the research short-circuit treats a seeded category as covered
 *  and never spends a web request re-deriving something already verified. */
const SEED_CONFIDENCE = 1;

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width).slice(0, width);
}

async function writeChart(chart: SeedChart): Promise<boolean> {
  return upsertChart({
    connectionId: null,
    brandKey: chart.brandKey,
    sizingCategory: chart.sizingCategory,
    variantName: chart.variantName,
    coversLeaves: chart.coversLeaves,
    audience: chart.audience,
    sourceTitle: chart.sourceTitle,
    chartRows: chart.chartRows,
    confidence: SEED_CONFIDENCE,
    sourceUrl: chart.sourceUrl,
    provenance: "manual",
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const requested = args.filter((arg) => !arg.startsWith("--"));

  const brands = requested.length > 0 ? requested : Object.keys(CHART_SEEDS);

  for (const brand of brands) {
    if (!CHART_SEEDS[brand]) {
      throw new Error(`No seed for "${brand}". Seeded brands: ${Object.keys(CHART_SEEDS).join(", ")}`);
    }
  }

  console.log(dryRun ? "DRY RUN — nothing will be written\n" : "Writing global charts (connection_id = null)\n");

  let written = 0;
  let failed = 0;

  for (const brand of brands) {
    const charts = CHART_SEEDS[brand];
    console.log(`${brand} — ${charts.length} chart(s)`);
    console.log(`  ${pad("GROUP", 11)}${pad("AUDIENCE", 9)}${pad("ROWS", 5)}${pad("VARIANT", 30)}FLAGS`);

    for (const chart of charts) {
      // Re-checked at write time rather than trusted from the test run: this is the last point before
      // a row every merchant reads, and a chart carrying no usable measurement is worse than absent.
      if (!chartHasBounds(chart.chartRows, chart.sizingCategory)) {
        console.error(`  SKIP  ${chart.variantName} (${chart.sizingCategory}) — no required measurement`);
        failed += 1;
        continue;
      }

      const flags = assessChart({
        rows: chart.chartRows,
        group: chart.sizingCategory,
        sourceUrl: chart.sourceUrl,
      });

      console.log(
        `  ${pad(chart.sizingCategory, 11)}${pad(chart.audience, 9)}${pad(chart.chartRows.length, 5)}${pad(
          chart.variantName,
          30
        )}${flags.map((flag) => `${flag.severity}:${flag.code}`).join(", ")}`
      );

      if (dryRun) continue;

      if (await writeChart(chart)) {
        written += 1;
      } else {
        failed += 1;
        console.error(`  FAILED to write ${chart.variantName} (${chart.sizingCategory})`);
      }
    }

    console.log();
  }

  console.log(dryRun ? "Dry run complete." : `Wrote ${written} chart(s), ${failed} failure(s).`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
