import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_AUTO_MATCH } from "@/lib/catalog/auto-match-state";
import { IDLE_SETUP_RESET } from "@/lib/catalog/setup-reset-state";

vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionById: vi.fn() }));
vi.mock("@/lib/db/auto-match-jobs", () => ({
  claimAutoMatchJob: vi.fn(),
  completeAutoMatchJob: vi.fn(),
  failAutoMatchJob: vi.fn(),
  touchAutoMatchJob: vi.fn(),
}));
vi.mock("@/lib/db/sizing-runs", () => ({ getLastPublishedAt: vi.fn() }));
vi.mock("@/lib/catalog/acs/preview", () => ({ fetchSampleProductTitles: vi.fn() }));
vi.mock("@/lib/catalog/category-scope", () => ({ expandCategorySelection: vi.fn((ids: string[]) => ids) }));
vi.mock("@/lib/catalog/classify-persona-paths", () => ({ classifyPersonaPaths: vi.fn() }));
vi.mock("@/lib/catalog/store-context", () => ({ storeContextFor: vi.fn(() => "Test store") }));
vi.mock("@/lib/catalog/persona-mapping-effects", () => ({ applyPersonaMappingChange: vi.fn() }));

import { getStoreConnectionById } from "@/lib/db/store-connections";
import { claimAutoMatchJob, completeAutoMatchJob, failAutoMatchJob, touchAutoMatchJob } from "@/lib/db/auto-match-jobs";
import { getLastPublishedAt } from "@/lib/db/sizing-runs";
import { fetchSampleProductTitles } from "@/lib/catalog/acs/preview";
import { classifyPersonaPaths } from "@/lib/catalog/classify-persona-paths";
import { applyPersonaMappingChange } from "@/lib/catalog/persona-mapping-effects";
import { ShopifyApiError } from "@/lib/shopify/client";
import { mergeAutoMatchVerdicts, runAutoMatchJob, sampleCandidateTitles, startAutoMatch } from "./persona-auto-match";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";
const scope = {
  configured: true,
  enabledDeptIds: ["women"],
  enabledLeafKeys: ["women:top:t-shirt"],
  customLeaves: [],
  customCategories: [],
};

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    platform: "woocommerce",
    categories: [
      { id: "tees", name: "T-Shirts", productCount: 12, parentId: null },
      { id: "chairs", name: "Chairs", productCount: 3, parentId: null },
      { id: "done", name: "Already mapped", productCount: 4, parentId: null },
    ],
    personaTaxonomyScope: scope,
    personaCategoryMap: {
      done: { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "t-shirt" },
    },
    personaAutoMatchCompletedAt: null,
    autoMatchJob: IDLE_AUTO_MATCH,
    setupReset: IDLE_SETUP_RESET,
    ...overrides,
  } as never;
}

const teeVerdict = {
  id: "tees",
  mapping: { status: "mapped" as const, departmentId: "women" as const, categoryId: "top", subCategory: "t-shirt", isAutoMatched: true },
  reason: "Tees",
  confidence: 0.95,
};
const chairVerdict = {
  id: "chairs",
  mapping: { status: "excluded" as const, excludeReason: "Furniture", isAutoMatched: true },
  reason: "Furniture",
  confidence: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimAutoMatchJob).mockResolvedValue(true);
  vi.mocked(touchAutoMatchJob).mockResolvedValue(true);
  vi.mocked(completeAutoMatchJob).mockResolvedValue(true);
  vi.mocked(failAutoMatchJob).mockResolvedValue(true);
  vi.mocked(getLastPublishedAt).mockResolvedValue(null);
  vi.mocked(getStoreConnectionById).mockResolvedValue(connection());
  vi.mocked(fetchSampleProductTitles).mockResolvedValue(["Boxy cotton tee"]);
  vi.mocked(classifyPersonaPaths).mockResolvedValue([teeVerdict, chairVerdict]);
});

describe("startAutoMatch", () => {
  it("refuses to run before What You Sell is configured", async () => {
    const outcome = await startAutoMatch(
      connection({ personaTaxonomyScope: { ...scope, configured: false } }),
      ["tees"],
    );

    expect(outcome).toEqual({ ok: false, status: 400, error: "Configure What You Sell before running AI matching." });
    expect(claimAutoMatchJob).not.toHaveBeenCalled();
  });

  it("refuses a configured scope with no paths enabled", async () => {
    const outcome = await startAutoMatch(connection({ personaTaxonomyScope: { ...scope, enabledLeafKeys: [] } }), ["tees"]);

    expect(outcome).toEqual(expect.objectContaining({ ok: false, status: 400 }));
  });

  it("refuses a second run while one is alive", async () => {
    const now = new Date().toISOString();
    const outcome = await startAutoMatch(
      connection({ autoMatchJob: { ...IDLE_AUTO_MATCH, status: "running", jobId: "job-0", startedAt: now, heartbeatAt: now } }),
      ["tees"],
    );

    expect(outcome).toEqual(expect.objectContaining({ ok: false, status: 409 }));
    expect(claimAutoMatchJob).not.toHaveBeenCalled();
  });

  it("refuses once AI matching already ran for this mapping", async () => {
    const outcome = await startAutoMatch(connection({ personaAutoMatchCompletedAt: "2026-10-01T00:00:00.000Z" }), ["tees"]);

    expect(outcome).toEqual(expect.objectContaining({ ok: false, status: 409 }));
  });

  it("claims a run for the unmapped categories the store knows, and nothing else", async () => {
    const outcome = await startAutoMatch(connection(), ["tees", "done", "unknown", "tees", 7]);

    expect(outcome).toEqual({ ok: true, jobId: expect.any(String), categoryIds: ["tees"] });
    expect(claimAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, expect.any(String), 1);
  });

  it("reports a lost claim as already running", async () => {
    vi.mocked(claimAutoMatchJob).mockResolvedValue(false);

    const outcome = await startAutoMatch(connection(), ["tees"]);

    expect(outcome).toEqual(expect.objectContaining({ ok: false, status: 409 }));
  });
});

describe("runAutoMatchJob", () => {
  it("reads titles, asks the AI with the saved scope, and saves the merged mapping itself", async () => {
    const outcome = await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees", "chairs"]);

    expect(outcome).toBe("done");
    expect(classifyPersonaPaths).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: "tees", sampleTitles: ["Boxy cotton tee"] }),
        expect.objectContaining({ id: "chairs", sampleTitles: ["Boxy cotton tee"] }),
      ],
      scope,
      "Test store",
      { signal: expect.any(AbortSignal) },
    );
    expect(touchAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, "job-1", { phase: "classifying", sampled: 2 });
    expect(touchAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, "job-1", { phase: "saving" });
    expect(completeAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, "job-1", {
      personaCategoryMap: {
        done: expect.objectContaining({ status: "mapped" }),
        tees: expect.objectContaining({ status: "mapped", subCategory: "t-shirt", isAutoMatched: true }),
        chairs: expect.objectContaining({ status: "excluded", isAutoMatched: true }),
      },
      resetCatalogSync: true,
      result: { mapped: 1, excluded: 1, unmapped: 0, withoutSamples: 0 },
    });
    expect(applyPersonaMappingChange).toHaveBeenCalledWith(expect.objectContaining({ id: CONNECTION_ID }), false);
    expect(failAutoMatchJob).not.toHaveBeenCalled();
  });

  it("leaves a live store's catalog sync alone", async () => {
    vi.mocked(getLastPublishedAt).mockResolvedValue("2026-09-01T00:00:00.000Z");

    await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(completeAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, "job-1", expect.objectContaining({ resetCatalogSync: false }));
    expect(applyPersonaMappingChange).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("finishes without touching the mapping when the AI matched nothing", async () => {
    vi.mocked(classifyPersonaPaths).mockResolvedValue([{ id: "tees", mapping: null, reason: "Unclear", confidence: 0.2 }]);

    const outcome = await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(outcome).toBe("done");
    expect(completeAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, "job-1", {
      personaCategoryMap: null,
      resetCatalogSync: true,
      result: { mapped: 0, excluded: 0, unmapped: 1, withoutSamples: 0 },
    });
    expect(applyPersonaMappingChange).not.toHaveBeenCalled();
  });

  it("writes nothing more once the run was cleared or replaced", async () => {
    vi.mocked(completeAutoMatchJob).mockResolvedValue(false);

    const outcome = await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(outcome).toBe("superseded");
    expect(applyPersonaMappingChange).not.toHaveBeenCalled();
    expect(failAutoMatchJob).not.toHaveBeenCalled();
  });

  it("stops before the AI call when the run was replaced while titles were read", async () => {
    vi.mocked(touchAutoMatchJob).mockResolvedValue(false);

    const outcome = await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(outcome).toBe("superseded");
    expect(classifyPersonaPaths).not.toHaveBeenCalled();
    expect(completeAutoMatchJob).not.toHaveBeenCalled();
  });

  it("reports depleted AI credits as the reason it stopped", async () => {
    vi.mocked(classifyPersonaPaths).mockRejectedValue(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'));

    const outcome = await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(outcome).toBe("failed");
    expect(failAutoMatchJob).toHaveBeenCalledWith(
      CONNECTION_ID,
      "job-1",
      "AI matching is unavailable because the Gemini API credits are depleted.",
    );
    expect(completeAutoMatchJob).not.toHaveBeenCalled();
  });

  it("saves nothing when Start from scratch ran while it worked", async () => {
    vi.mocked(getStoreConnectionById)
      .mockResolvedValueOnce(connection())
      .mockResolvedValueOnce(connection({ setupReset: { ...IDLE_SETUP_RESET, status: "failed", error: "stopped" } }));

    const outcome = await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(outcome).toBe("failed");
    expect(completeAutoMatchJob).not.toHaveBeenCalled();
    expect(failAutoMatchJob).toHaveBeenCalledWith(CONNECTION_ID, "job-1", expect.stringContaining("Start from scratch"));
  });

  it("counts categories the store returned no titles for", async () => {
    vi.mocked(fetchSampleProductTitles).mockRejectedValue(new Error("store down"));

    await runAutoMatchJob(CONNECTION_ID, "job-1", ["tees"]);

    expect(completeAutoMatchJob).toHaveBeenCalledWith(
      CONNECTION_ID,
      "job-1",
      expect.objectContaining({ result: expect.objectContaining({ withoutSamples: 1 }) }),
    );
  });
});

describe("mergeAutoMatchVerdicts", () => {
  it("keeps a decision the merchant made while the AI worked", () => {
    const merchant = { status: "excluded" as const, excludeReason: "Mine" };
    const { map, result } = mergeAutoMatchVerdicts(
      { tees: merchant },
      [teeVerdict],
      [{ id: "tees", path: "T-Shirts", productCount: 12, sampleTitles: ["Tee"] }],
    );

    expect(map.tees).toBe(merchant);
    expect(result).toEqual({ mapped: 0, excluded: 0, unmapped: 0, withoutSamples: 0 });
  });
});

describe("sampleCandidateTitles", () => {
  it("waits and retries a throttled Shopify sample instead of silently dropping it", async () => {
    vi.mocked(fetchSampleProductTitles)
      .mockRejectedValueOnce(new ShopifyApiError("throttled", 200, true, 1))
      .mockResolvedValueOnce(["Tee"]);
    const candidates = [{ id: "tees", path: "T-Shirts", productCount: 12, sampleTitles: [] as string[] }];
    vi.useFakeTimers();

    try {
      const pending = sampleCandidateTitles(connection({ platform: "shopify" }), candidates);
      await vi.runAllTimersAsync();
      await pending;

      expect(fetchSampleProductTitles).toHaveBeenCalledTimes(2);
      expect(candidates[0].sampleTitles).toEqual(["Tee"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a dropped connection or a server error instead of losing the category's titles", async () => {
    vi.mocked(fetchSampleProductTitles)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new ShopifyApiError("Bad gateway", 502))
      .mockResolvedValueOnce(["Tee"]);
    const candidates = [{ id: "tees", path: "T-Shirts", productCount: 12, sampleTitles: [] as string[] }];
    vi.useFakeTimers();

    try {
      const pending = sampleCandidateTitles(connection({ platform: "shopify" }), candidates);
      await vi.runAllTimersAsync();
      await pending;

      expect(fetchSampleProductTitles).toHaveBeenCalledTimes(3);
      expect(candidates[0].sampleTitles).toEqual(["Tee"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a request the store refused for good", async () => {
    vi.mocked(fetchSampleProductTitles).mockRejectedValue(new ShopifyApiError("Not found", 404));
    const candidates = [{ id: "tees", path: "T-Shirts", productCount: 12, sampleTitles: [] as string[] }];

    await sampleCandidateTitles(connection(), candidates);

    expect(fetchSampleProductTitles).toHaveBeenCalledTimes(1);
  });

  it("skips empty categories, which have no titles to read", async () => {
    const candidates = [
      { id: "empty", path: "Old Sale", productCount: 0, childCount: 0, sampleTitles: [] as string[] },
      { id: "parent", path: "Women", productCount: 0, childCount: 2, sampleTitles: [] as string[] },
      { id: "tees", path: "T-Shirts", productCount: 12, sampleTitles: [] as string[] },
    ];
    const progress: number[] = [];

    await sampleCandidateTitles(connection(), candidates, { onSampled: (sampled) => progress.push(sampled) });

    expect(vi.mocked(fetchSampleProductTitles).mock.calls.map((call) => call[1])).toEqual([["parent"], ["tees"]]);
    expect(progress.at(-1)).toBe(3);
  });

  it("stops reading titles at its time limit", async () => {
    const candidates = [{ id: "tees", path: "T-Shirts", productCount: 12, sampleTitles: [] as string[] }];

    await sampleCandidateTitles(connection(), candidates, { until: Date.now() - 1 });

    expect(fetchSampleProductTitles).not.toHaveBeenCalled();
  });
});
