import { searchProducts } from "@/lib/catalog/acs/client";
import { isAcsConfigured } from "@/lib/catalog/acs/config";
import { buildAcsVisitorId } from "@/lib/catalog/acs/isolation";
import {
  buildFitSearchFilter,
  fitSearchTolerances,
  parseFitSearchQuery,
  toFitSearchProducts,
} from "@/lib/catalog/acs/fit-search";
import type { AcsSearchResultItem } from "@/lib/catalog/acs/types";
import { mappedSourceCategoryIds } from "@/lib/catalog/persona-mapping";
import { getLatestPublishedSizingRun } from "@/lib/db/sizing-runs";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getCurrentUser } from "@/modules/auth/lib/get-user";

const PAGE_SIZE = 100;
/** The tester reads a few pages so per-size counts are not just the first page's. */
const MAX_PAGES = 5;

/**
 * Sizing Tester "Found Sizes": sends the real fit filter to ACS and returns what ACS answers,
 * with the exact filter string that was sent. No product ACS returns is removed or rescored here.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });

    const parsed = parseFitSearchQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const publishedRun = await getLatestPublishedSizingRun(connection.id);
    if (!publishedRun) {
      return Response.json(
        { error: "Publish sizing before searching suitable products.", reason: "not_published" },
        { status: 409 },
      );
    }
    if (!isAcsConfigured()) {
      return Response.json({ error: "ACS is not configured." }, { status: 503 });
    }

    const filter = buildFitSearchFilter(parsed.value);
    if (!filter) return Response.json({ error: "These measurements cannot form a fit filter." }, { status: 400 });
    const tolerances = fitSearchTolerances(parsed.value);

    // All mapped products carry the stable Persona root category. A store with no mapped source
    // categories must select nothing, never omit the category clause and broaden to the catalog.
    const categoryScope = mappedSourceCategoryIds(connection.personaCategoryMap).length > 0
      ? ["persona"]
      : [];
    if (categoryScope.length === 0) {
      return Response.json({
        products: [], hitCount: 0, totalSize: 0, pages: 0, truncated: false, outOfScope: 0, filter, tolerances,
      });
    }

    const visitorId = buildAcsVisitorId(connection.id, user.id);
    const items: AcsSearchResultItem[] = [];
    let totalSize: number | null = null;
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const response = await searchProducts({
        connectionId: connection.id,
        categoryScope,
        visitorId,
        query: "",
        pageSize: PAGE_SIZE,
        pageToken,
        extraFilter: filter,
      });
      pages += 1;
      totalSize ??= response.totalSize ?? null;
      items.push(...(response.results ?? []));
      pageToken = response.nextPageToken || undefined;
    } while (pageToken && pages < MAX_PAGES);

    const { products, outOfScope } = toFitSearchProducts(items, parsed.value, connection.id);

    return Response.json({
      products,
      hitCount: items.length,
      totalSize,
      pages,
      truncated: Boolean(pageToken),
      outOfScope,
      filter,
      tolerances,
    });
  } catch (error) {
    console.error("[store-connection sizing/tester/products GET]", error);
    return Response.json({ error: "Could not load suitable products." }, { status: 500 });
  }
}
