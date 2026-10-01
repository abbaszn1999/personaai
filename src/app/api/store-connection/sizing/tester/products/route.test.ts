import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type { AcsSearchResultItem } from "@/lib/catalog/acs/types";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-runs", () => ({ getLatestPublishedSizingRun: vi.fn() }));
vi.mock("@/lib/catalog/acs/config", () => ({ isAcsConfigured: vi.fn() }));
vi.mock("@/lib/catalog/acs/client", () => ({ searchProducts: vi.fn() }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getLatestPublishedSizingRun } from "@/lib/db/sizing-runs";
import { isAcsConfigured } from "@/lib/catalog/acs/config";
import { searchProducts } from "@/lib/catalog/acs/client";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

function request(overrides: Record<string, string> = {}): Request {
  const params = new URLSearchParams({
    brand: "Acme",
    fitGroup: "tops",
    fitAudience: "mens",
    chartVariant: "Men's Core",
    chest: "98",
    waist: "82",
    ...overrides,
  });
  return new Request(`http://localhost/api/store-connection/sizing/tester/products?${params}`);
}

function connection(mapped = true): StoreConnectionRow {
  return {
    id: CONNECTION_ID,
    personaCategoryMap: mapped
      ? { shirts: { status: "mapped", paths: [] } }
      : {},
  } as unknown as StoreConnectionRow;
}

function hit(id: string, rows: object[]): AcsSearchResultItem {
  return {
    id: `${CONNECTION_ID}_${id}`,
    product: {
      id: `${CONNECTION_ID}_${id}`,
      title: `Tee ${id}`,
      categories: ["persona", "persona > men > top > t-shirt"],
      brands: ["Acme"],
      availability: "IN_STOCK",
      images: [{ uri: "https://example.com/tee.jpg" }],
      priceInfo: { price: 32, currencyCode: "USD" },
      uri: "https://example.com/tee",
      attributes: {
        sku: { text: [`SKU-${id}`] },
        fit_size_labels: { text: rows.map((row) => (row as { s: string }).s) },
        fit_rows: { text: rows.map((row) => JSON.stringify(row)) },
      },
    },
  };
}

describe("GET /api/store-connection/sizing/tester/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(connection());
    vi.mocked(getLatestPublishedSizingRun).mockResolvedValue(
      { publishedAt: "2026-09-29T00:00:00Z" } as never,
    );
    vi.mocked(isAcsConfigured).mockReturnValue(true);
    vi.mocked(searchProducts).mockResolvedValue({ results: [] });
  });

  it("requires the current user and store", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(getStoreConnectionByOwner).not.toHaveBeenCalled();

    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
  });

  it("validates the sizing selection before searching", async () => {
    expect((await GET(request({ fitGroup: "hats" }))).status).toBe(400);
    expect((await GET(request({ chest: "" }))).status).toBe(400);
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("does not search an unpublished sizing catalog", async () => {
    vi.mocked(getLatestPublishedSizingRun).mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "not_published" });
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("short-circuits an empty category scope instead of broadening the ACS query", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(connection(false));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ products: [], hitCount: 0, totalSize: 0 });
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("sends the shared fit filter with tenant/category scope and returns ACS's answer and the filter", async () => {
    vi.mocked(searchProducts).mockResolvedValue({
      totalSize: 2,
      results: [
        hit("p1", [{ s: "M", chest: [94, 98] }, { s: "L", chest: [99, 104] }]),
        // Stretched by its smallest and largest stocked sizes: ACS lets it through, no size fits.
        hit("p2", [{ s: "S", chest: [88, 92] }, { s: "XL", chest: [110, 114] }]),
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    const call = vi.mocked(searchProducts).mock.calls[0][0];
    expect(call).toMatchObject({
      connectionId: CONNECTION_ID,
      categoryScope: ["persona"],
      visitorId: `${CONNECTION_ID}:user-1`,
      query: "",
    });
    expect(call.extraFilter).toContain(
      '(attributes.fit_group: ANY("tops") AND attributes.fit_chest_min: IN(*, 100i) AND attributes.fit_chest_max: IN(96i, *))'
    );
    expect(call.extraFilter).not.toContain("fit_waist");
    expect(call.extraFilter).not.toContain("fit_size_labels");

    expect(response.status).toBe(200);
    expect(body.filter).toBe(call.extraFilter);
    expect(body.tolerances).toEqual([{ measurement: "chest", value: 98, tolerance: 2 }]);
    expect(body).toMatchObject({ hitCount: 2, totalSize: 2, pages: 1, truncated: false });
    expect(body.products.map((product: { id: string; fitSizes: string[] }) => [product.id, product.fitSizes])).toEqual([
      ["p1", ["M", "L"]],
      ["p2", []],
    ]);
  });

  it("says so when ACS does not index the fit field yet, instead of failing", async () => {
    vi.mocked(searchProducts).mockRejectedValue(
      Object.assign(new Error("ACS API error 400"), {
        status: 400,
        body: 'Unsupported field \\"attributes.fit_foot_length_min\\" on \\":\\" operator.',
      }),
    );

    const params = new URLSearchParams({
      brand: "Acme", fitGroup: "footwear", fitAudience: "mens", chartVariant: "Shoes", footLength: "27",
    });
    const shoes = await GET(new Request(`http://localhost/api/store-connection/sizing/tester/products?${params}`));
    expect(shoes.status).toBe(422);
    expect(await shoes.json()).toMatchObject({ reason: "unsupported_field", field: "attributes.fit_foot_length_min" });
  });

  it("tells an empty chart from an empty fit by asking again without the measurements", async () => {
    vi.mocked(searchProducts)
      .mockResolvedValueOnce({ results: [], totalSize: 0 })
      .mockResolvedValueOnce({ results: [], totalSize: 0 });
    const emptyChart = await (await GET(request())).json();
    expect(emptyChart.chartProducts).toBe(0);
    const scope = vi.mocked(searchProducts).mock.calls[1][0];
    expect(scope.extraFilter).toContain('attributes.fit_chart_variant: ANY("Men\'s Core")');
    expect(scope.extraFilter).not.toContain("fit_chest");

    vi.mocked(searchProducts)
      .mockResolvedValueOnce({ results: [], totalSize: 0 })
      .mockResolvedValueOnce({ results: [hit("p1", [{ s: "M", chest: [94, 98] }])], totalSize: 12 });
    const emptyFit = await (await GET(request())).json();
    expect(emptyFit.chartProducts).toBe(12);

    vi.mocked(searchProducts).mockResolvedValueOnce({
      results: [hit("p1", [{ s: "M", chest: [94, 98] }])],
      totalSize: 1,
    });
    vi.mocked(searchProducts).mockClear();
    expect((await (await GET(request())).json()).chartProducts).toBeNull();
    expect(searchProducts).toHaveBeenCalledTimes(1);
  });

  it("reads further pages until ACS has no more, up to a limit", async () => {
    vi.mocked(searchProducts)
      .mockResolvedValueOnce({ results: [hit("p1", [{ s: "M", chest: [94, 98] }])], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ results: [hit("p2", [{ s: "M", chest: [94, 98] }])] });

    const body = await (await GET(request())).json();

    expect(vi.mocked(searchProducts).mock.calls[1][0].pageToken).toBe("page-2");
    expect(body).toMatchObject({ hitCount: 2, pages: 2, truncated: false });
    expect(body.products).toHaveLength(2);
  });
});
