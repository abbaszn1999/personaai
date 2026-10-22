import { listGeneratedAcsStageFiveProducts } from "@/lib/catalog/acs/stage-five-preview";
import { listSizingCoverage, type BrandType } from "@/lib/db/sizing-coverage";
import { STAGE_FIVE_PAGE_SIZES } from "@/modules/store/sizing/server-types";
import { previewScopeFor, runProducts } from "@/lib/sync/scope";
import { currentSyncRun, syncConnection } from "@/lib/sync/route-context";

const DEFAULT_PAGE_SIZE = 25;

/**
 * Step 2's product table: exactly the rows the sync's publish will write, built the way Setup's
 * preview builds them. Always the preview — ACS holds none of these products until the sync lands.
 */
export async function GET(request: Request) {
  try {
    const { connection, response } = await syncConnection();
    if (response) return response;
    const run = await currentSyncRun(connection.id);
    if (!run) return Response.json({ error: "There is no sync to review." }, { status: 409 });

    const params = new URL(request.url).searchParams;
    const requestedPageSize = Number(params.get("pageSize"));
    const pageSize = (STAGE_FIVE_PAGE_SIZES as readonly number[]).includes(requestedPageSize)
      ? requestedPageSize
      : DEFAULT_PAGE_SIZE;
    const requestedOffset = Number(params.get("offset"));
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const type = params.get("type");
    const availability = params.get("availability");
    const requestedBrandType = params.get("brandType");
    const brandType = requestedBrandType === "global" ||
      requestedBrandType === "private" ||
      requestedBrandType === "none"
      ? requestedBrandType
      : undefined;

    const [products, coverage] = await Promise.all([runProducts(run), listSizingCoverage(connection.id)]);
    const brandTypes = new Map<string, BrandType>();
    for (const row of coverage) brandTypes.set(row.brandKey, row.brandType);
    const brandKeys = brandType
      ? [...new Set(coverage.filter((row) => row.brandType === brandType).map((row) => row.brandKey))]
      : null;

    const listing = await listGeneratedAcsStageFiveProducts(connection, {
      offset,
      limit: pageSize,
      query: params.get("q") ?? "",
      type: type === "PRIMARY" || type === "VARIANT" ? type : undefined,
      availability: availability === "IN_STOCK" || availability === "OUT_OF_STOCK" ? availability : undefined,
      brandKeys,
      brandTypes,
      scope: previewScopeFor(run, products),
    });
    return Response.json({ ...listing, source: "preview", pageSize, offset });
  } catch (error) {
    console.error("[store-connection sync/acs-products GET]", error);
    return Response.json({ error: "Could not build the sync's catalog rows." }, { status: 500 });
  }
}
