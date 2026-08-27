/**
 * Read-only diagnosis for "the agent finds nothing in the catalog".
 *
 * Retrieval has no observability between "the router chose cosine" and "the engine got zero
 * candidates": a search that matches nothing returns HTTP 200 with an empty result list, exactly
 * like a search against an empty catalog. This runs the same calls the agent runs, one filter
 * clause at a time, so the step that drops the count to zero is visible.
 *
 *   npm run acs:doctor -- <connectionId> [query]
 */
import { getProduct, searchProducts, searchProductsRaw } from "@/lib/catalog/acs/client";
import { getAcsConfig } from "@/lib/catalog/acs/config";
import {
  buildAcsProductId,
  categoryScopeFilterClause,
  merchantFilterClause,
  parseAcsProductId,
} from "@/lib/catalog/acs/isolation";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import { getStoreConnectionById } from "@/lib/db/store-connections";

const VISITOR_ID = "system:acs-doctor";

/** ACS reports no total on a filtered search, so "how many are there" is answered by asking for
 *  one page and looking at whether it filled up and offered another. Enough to tell zero from
 *  some from many, which is all any of these checks need. */
async function count(label: string, filter: string, query: string): Promise<number> {
  const response = await searchProductsRaw(filter, { visitorId: VISITOR_ID, query, pageSize: 100 });
  const found = response.results?.length ?? 0;
  const more = response.nextPageToken ? "+ more pages" : "no further pages";
  console.log(`  ${found === 0 ? "ZERO" : String(found).padStart(4)}  ${label} (${more})`);
  return found;
}

async function main() {
  const connectionId = process.argv[2];
  const query = process.argv[3] ?? "black jacket";
  if (!connectionId) throw new Error("Usage: npm run acs:doctor -- <connectionId> [query]");

  const config = getAcsConfig();
  console.log(`Catalog: ${config.projectId}/${config.catalogId}, branch ${config.branchId}`);

  const connection = await getStoreConnectionById(connectionId);
  if (!connection) throw new Error(`No store_connections row for ${connectionId}`);

  const scope = expandCategorySelection(connection.selectedCategoryIds, connection.categories);
  console.log(`Connection: ${connection.platform}, sync ${connection.catalogSyncStatus}`);
  console.log(`Selected categories: ${connection.selectedCategoryIds.join(", ") || "(none)"}`);
  console.log(`Expanded scope (${scope.length}): ${scope.join(", ") || "(empty — every search short-circuits)"}`);

  // Clause by clause, so the one that zeroes the count names itself. Each line adds exactly one
  // condition to the line above it.
  console.log("\nResult counts, adding one filter clause at a time:");
  const merchantOnly = merchantFilterClause(connectionId);
  const total = await count("merchant_id only, browse", merchantOnly, "");

  const scopeClause = categoryScopeFilterClause(scope);
  if (scopeClause) {
    await count("+ source_category_ids scope, browse", `${merchantOnly} AND ${scopeClause}`, "");
    await count(`+ scope, query "${query}"`, `${merchantOnly} AND ${scopeClause}`, query);
  }
  await count(`merchant_id only, query "${query}"`, merchantOnly, query);

  if (total === 0) {
    console.log("\nNothing matches this merchant at all. Either the import never landed, or the");
    console.log("search index is not serving this catalog yet — the console lists products from");
    console.log("the catalog, which is not the same store the search endpoint reads.");
    return;
  }

  // What one real product actually carries. A scope filter can only match values that are
  // genuinely on the product, and this is the only way to see them rather than infer them.
  const [sample] = (await searchProductsRaw(merchantOnly, { visitorId: VISITOR_ID, query: "", pageSize: 1 })).results ?? [];
  if (!sample) return;

  const { externalId } = parseAcsProductId(sample.id);
  const product = await getProduct(buildAcsProductId(connectionId, externalId));

  console.log(`\nSample product ${sample.id}:`);
  console.log(`  title:                ${product?.title ?? "(not retrievable)"}`);
  console.log(`  availability:         ${product?.availability ?? "(not retrievable)"}`);
  console.log(`  categories:           ${JSON.stringify(product?.categories ?? null)}`);
  console.log(`  merchant_id:          ${JSON.stringify(product?.attributes?.merchant_id?.text ?? null)}`);
  console.log(`  source_category_ids:  ${JSON.stringify(product?.attributes?.source_category_ids?.text ?? null)}`);

  // Presence only, never the merchant's own text — this is what tells "acs:bootstrap hasn't run
  // against this catalog since retrievability was extended" apart from "this merchant's source
  // data genuinely has none of this". Both look identical to the shopper (an empty context
  // block) but need different fixes: re-run acs:bootstrap for the former, nothing for the latter.
  const customKeys = Object.keys(product?.attributes ?? {}).filter((key) => key.startsWith("opt_"));
  console.log("\n  Data the 'discuss the current item' fix depends on being retrievable:");
  console.log(`  description:          ${product?.description ? "present" : "absent/not retrievable"}`);
  console.log(`  colorInfo:            ${product?.colorInfo ? "present" : "absent/not retrievable"}`);
  console.log(`  sizes:                ${product?.sizes?.length ? "present" : "absent/not retrievable"}`);
  console.log(`  custom option keys:   ${customKeys.length > 0 ? customKeys.join(", ") : "(none present)"}`);
  if (!product?.description && !product?.colorInfo && !product?.sizes?.length && customKeys.length === 0) {
    console.log(
      "  None of the above came back. Retrievability is a catalog-level setting, not a per-" +
        "product one, so this is not necessarily missing source data: if this store's products " +
        "do carry a description/colours/sizes/options, run `npm run acs:bootstrap` against this " +
        "catalog and re-check — no re-import needed, since the data was already written at " +
        "index time and only retrievability was gating it from coming back on a read."
    );
  }

  const carried = product?.attributes?.source_category_ids?.text ?? [];
  const overlap = carried.filter((id) => scope.includes(id));
  if (carried.length > 0 && overlap.length === 0) {
    console.log("\nThis product carries no category id the scope asks for. The scope filter is what");
    console.log("is emptying the result set — compare the ids above against the expanded scope.");
  }

  // Only meaningful once a filter is known to match: it isolates whether the failure is the
  // filter or the ranking/serving layer above it.
  console.log("\nThrough the agent's own search path (searchProducts, mandatory clauses):");
  if (scope.length === 0) {
    console.log("  skipped — an empty scope makes every caller short-circuit before ACS is reached");
    return;
  }
  const viaAgent = await searchProducts({ connectionId, categoryScope: scope, visitorId: VISITOR_ID, query, pageSize: 10 });
  console.log(`  ${viaAgent.results?.length ?? 0} result(s) for "${query}"`);
  for (const item of viaAgent.results ?? []) {
    console.log(`    ${item.id}  ${item.product?.title ?? ""}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
