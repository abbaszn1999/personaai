/** npx tsx scripts/inspect-seed.ts <brandKey> — compact one-line-per-chart dump of a seed. */
import { CHART_SEEDS } from "@/lib/sizing/seeds";

const brand = process.argv[2];
for (const seed of CHART_SEEDS[brand] ?? []) {
  const labels = seed.chartRows
    .map((row) => {
      const aliases = Object.entries(row.aliases ?? {})
        .map(([key, value]) => `${key}:${([] as string[]).concat(value as string | string[]).join("/")}`)
        .join(";");
      return aliases ? `${row.size}{${aliases}}` : row.size;
    })
    .join(" ");
  console.log(
    `${seed.sizingCategory} | ${seed.variantName} | ${seed.audience} | ${seed.coversLeaves.join(",")} | ${labels}`,
  );
}
