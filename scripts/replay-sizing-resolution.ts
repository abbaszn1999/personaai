/**
 * Replays every stored product of a connection against the currently published charts and
 * prints, for global brands only, how many products resolve and exactly why the rest do not.
 *
 *   npx tsx --env-file=.env.local scripts/replay-sizing-resolution.ts <connectionId> [--json]
 */
import { getStoreConnectionById } from "@/lib/db/store-connections";
import { listSizingProductRecordsPage } from "@/lib/db/sizing-product-records";
import { loadSizingResolutionContext } from "@/lib/sizing/product-chart";
import { evaluateSizingPublicationGate } from "@/lib/sizing/completion-gates";

const PAGE_SIZE = 1_000;

async function main() {
  const connectionId = process.argv[2];
  const asJson = process.argv.includes("--json");
  if (!connectionId) throw new Error("Pass a store connection id.");
  const connection = await getStoreConnectionById(connectionId);
  if (!connection) throw new Error(`Store connection not found: ${connectionId}`);
  const context = await loadSizingResolutionContext(connection);
  if (process.argv.includes("--seeds")) {
    // Replay against the in-repo seeds instead of the published rows: lets a seed change be
    // proven against real catalog demand before it is published.
    const { CHART_SEEDS } = await import("@/lib/sizing/seeds");
    context.sharedCharts = Object.values(CHART_SEEDS)
      .flat()
      .map((seed) => ({ ...seed, version: 1 }) as unknown as typeof context.sharedCharts[number]);
  }

  const products: Array<{ productId: string; title: string; input: Parameters<typeof evaluateSizingPublicationGate>[0][number]["input"] }> = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await listSizingProductRecordsPage(connectionId, { limit: PAGE_SIZE, offset });
    total = page.total;
    for (const record of page.records) {
      if (context.brandTypes.get(record.brandKey) !== "global") continue;
      products.push({
        productId: record.externalId,
        title: record.title,
        input: {
          brandKey: record.brandKey,
          sizingCategory: record.sizingCategory,
          primaryPersonaLeafKey: record.primaryPersonaLeafKey,
          rawSizeFormat: record.rawSizeFormat,
          audienceHint: record.audienceHint,
        },
      });
    }
    offset += page.records.length;
    if (page.records.length === 0) break;
  } while (offset < total);

  const titles = new Map(products.map((p) => [p.productId, p.title]));
  const gate = evaluateSizingPublicationGate(products, context);
  const summary = new Map<string, { count: number; examples: string[]; labels: Set<string> }>();
  for (const issue of gate.issues) {
    const key = `${issue.brandKey} | ${issue.status} | ${issue.leafKey ?? "-"}`;
    const entry = summary.get(key) ?? { count: 0, examples: [], labels: new Set<string>() };
    entry.count += 1;
    if (entry.examples.length < 2) entry.examples.push(titles.get(issue.productId) ?? issue.productId);
    for (const label of issue.unmatchedLabels) entry.labels.add(label);
    summary.set(key, entry);
  }

  if (asJson) {
    console.log(JSON.stringify({ ...gate, issues: undefined, summary: [...summary] }, null, 2));
    return;
  }
  console.log(
    `connection ${connectionId}: global products ${gate.demandedProducts}, matched ${gate.matchedProducts}, ` +
      `issues ${gate.issues.length}, leaves ${gate.demandedLeaves.length}`,
  );
  for (const [key, entry] of [...summary].sort((a, b) => b[1].count - a[1].count)) {
    const labels = entry.labels.size ? ` labels=[${[...entry.labels].slice(0, 8).join(", ")}]` : "";
    console.log(`${String(entry.count).padStart(4)}  ${key}${labels}  e.g. ${entry.examples.join(" / ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
