import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SizingCoverageRow } from "@/lib/db/sizing-coverage";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { PATCH } from "./route";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-coverage", () => ({
  listSizingCoverage: vi.fn(),
  setBrandType: vi.fn(),
  setResearchOutcomes: vi.fn(),
}));
vi.mock("@/lib/db/sizing-runs", () => ({ getLatestSizingRun: vi.fn() }));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({ clearGeneratedStageFiveCache: vi.fn() }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { listSizingCoverage, setBrandType, setResearchOutcomes } from "@/lib/db/sizing-coverage";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";

function coverage(overrides: Partial<SizingCoverageRow> = {}): SizingCoverageRow {
  return {
    id: "c1",
    connectionId: "connection-1",
    brandKey: "atelier-9",
    brandName: "Atelier 9",
    brandType: "global",
    brandCanonicalName: "Atelier 9",
    sizingCategory: "tops",
    skuCount: 5,
    storeCategoryPaths: [],
    sampleSkus: [],
    rawFormats: {},
    audienceHints: {},
    researchStatus: "not_found",
    researchNote: "No official size guide could be found.",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/store-connection/sizing/brand-type", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/store-connection/sizing/brand-type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({ id: "connection-1" } as unknown as StoreConnectionRow);
    vi.mocked(getLatestSizingRun).mockResolvedValue({ stage: "classify", status: "blocked" } as never);
    vi.mocked(listSizingCoverage).mockResolvedValue([
      coverage(),
      coverage({ id: "c2", sizingCategory: "bottoms" }),
    ]);
    vi.mocked(setBrandType).mockResolvedValue(true);
    vi.mocked(setResearchOutcomes).mockResolvedValue(true);
  });

  it("moves a brand to private, clears the canonical name and resets its research outcomes", async () => {
    const response = await PATCH(patch({ brandKey: "atelier-9", brandType: "private" }));

    expect(response.status).toBe(200);
    expect(setBrandType).toHaveBeenCalledWith("connection-1", "atelier-9", "private", null);
    expect(setResearchOutcomes).toHaveBeenCalledWith(
      "connection-1",
      "atelier-9",
      ["tops", "bottoms"],
      "pending",
      null,
    );
  });

  it("gives a brand moved to global its catalog name to search on", async () => {
    vi.mocked(listSizingCoverage).mockResolvedValue([coverage({ brandType: "private", brandCanonicalName: null })]);

    await PATCH(patch({ brandKey: "atelier-9", brandType: "global" }));

    expect(setBrandType).toHaveBeenCalledWith("connection-1", "atelier-9", "global", "Atelier 9");
  });

  it("does nothing when the brand already has that type", async () => {
    const response = await PATCH(patch({ brandKey: "atelier-9", brandType: "global" }));

    expect(await response.json()).toMatchObject({ unchanged: true });
    expect(setBrandType).not.toHaveBeenCalled();
  });

  it("refuses the unbranded sentinel and unknown types", async () => {
    expect((await PATCH(patch({ brandKey: "", brandType: "global" }))).status).toBe(400);
    expect((await PATCH(patch({ brandKey: "atelier-9", brandType: "none" }))).status).toBe(400);
  });

  it("refuses a brand the store does not carry", async () => {
    expect((await PATCH(patch({ brandKey: "ghost", brandType: "private" }))).status).toBe(404);
  });

  it("refuses while research is running", async () => {
    vi.mocked(getLatestSizingRun).mockResolvedValue({ stage: "research", status: "running" } as never);

    const response = await PATCH(patch({ brandKey: "atelier-9", brandType: "private" }));

    expect(response.status).toBe(409);
    expect(setBrandType).not.toHaveBeenCalled();
  });
});
