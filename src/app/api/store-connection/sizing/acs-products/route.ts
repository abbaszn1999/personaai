import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import { isAcsConfigured } from "@/lib/catalog/acs/config";
import { listAcsStageFiveProducts } from "@/lib/catalog/acs/stage-five-listing";
import { listGeneratedAcsStageFiveProducts } from "@/lib/catalog/acs/stage-five-preview";
import { listSizingCoverage, type BrandType } from "@/lib/db/sizing-coverage";
import { STAGE_FIVE_PAGE_SIZES } from "@/modules/store/sizing/server-types";

const DEFAULT_PAGE_SIZE = 25;

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });
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

    const baseOptions = {
      offset,
      limit: pageSize,
      query: params.get("q") ?? "",
      type: type === "PRIMARY" || type === "VARIANT" ? type : undefined,
      availability: availability === "IN_STOCK" || availability === "OUT_OF_STOCK"
        ? availability
        : undefined,
    } as const;
    const [run, coverage] = await Promise.all([
      getLatestSizingRun(connection.id),
      listSizingCoverage(connection.id),
    ]);
    const brandTypes = new Map<string, BrandType>();
    for (const row of coverage) brandTypes.set(row.brandKey, row.brandType);
    const brandKeys = brandType
      ? [...new Set(coverage.filter((row) => row.brandType === brandType).map((row) => row.brandKey))]
      : null;
    const authoritative = Boolean(run?.publishedAt);
    if (authoritative && !isAcsConfigured()) {
      return Response.json({ error: "ACS is not configured." }, { status: 503 });
    }
    const listing = authoritative
      ? await listAcsStageFiveProducts(connection.id, {
          ...baseOptions,
          brandType,
          brandTypes,
        })
      : await listGeneratedAcsStageFiveProducts(connection, {
          ...baseOptions,
          brandKeys,
          brandTypes,
        });

    return Response.json({
      ...listing,
      source: authoritative ? "acs" : "preview",
      pageSize,
      offset,
    });
  } catch (error) {
    console.error("[store-connection sizing/acs-products GET]", error);
    return Response.json({ error: "Could not read the ACS sizing catalog." }, { status: 500 });
  }
}
