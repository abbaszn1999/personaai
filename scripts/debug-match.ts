import { CHART_SEEDS } from "@/lib/sizing/seeds";
import { matchRawFormat } from "@/lib/sizing/canonical";

const [brand, group, variant, raw, type = "EU"] = process.argv.slice(2);
const chart = CHART_SEEDS[brand].find((c) => c.sizingCategory === group && c.variantName === variant);
if (!chart) throw new Error("chart not found");
const result = matchRawFormat(raw, chart.chartRows, type as never);
console.log(JSON.stringify(result.matches.map((m) => [m.raw, m.row?.size ?? null, m.matchedVia]), null, 0));
