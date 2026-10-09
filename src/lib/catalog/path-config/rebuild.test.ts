import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acsProduct } from "@/lib/agents/__fixtures__/catalog";
import { parseStoreBrandMapping } from "@/lib/sizing/brand-mapping";

const deps = vi.hoisted(() => ({
  stale: [] as string[],
  readConnectionCatalog: vi.fn(),
  readMirrorDocuments: vi.fn(),
  getStoreConnectionById: vi.fn(),
  getPersonaPathConfig: vi.fn(),
  savePersonaPathConfig: vi.fn(),
  markPersonaPathConfigStale: vi.fn(),
}));

vi.mock("@/lib/catalog/acs/config", () => ({ isAcsConfigured: () => true }));
vi.mock("@/lib/db/sizing-runs", () => ({ getLatestSizingRun: async () => null }));
vi.mock("@/lib/catalog/acs/stage-five-listing", () => ({ readConnectionCatalog: deps.readConnectionCatalog }));
vi.mock("@/lib/catalog/acs/mirror", () => ({ readMirrorDocuments: deps.readMirrorDocuments }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionById: deps.getStoreConnectionById }));
vi.mock("@/lib/db/persona-path-configs", () => ({
  getPersonaPathConfig: deps.getPersonaPathConfig,
  savePersonaPathConfig: deps.savePersonaPathConfig,
  updatePersonaPathConfigData: vi.fn(),
  markPersonaPathConfigFresh: vi.fn(),
  markPersonaPathConfigStale: deps.markPersonaPathConfigStale,
  listStalePersonaPathConfigIds: async (limit: number) => deps.stale.slice(0, limit),
}));

import { markPathConfigStale, rebuildPersonaPathConfig, rebuildStalePathConfigs } from "./rebuild";

beforeEach(() => {
  deps.readConnectionCatalog.mockReset().mockResolvedValue([]);
  deps.readMirrorDocuments.mockReset().mockResolvedValue(null);
  deps.getStoreConnectionById.mockReset().mockResolvedValue(null);
  deps.getPersonaPathConfig.mockReset().mockResolvedValue(null);
  deps.markPersonaPathConfigStale.mockReset();
  deps.savePersonaPathConfig.mockReset().mockImplementation(async ({ connectionId }: { connectionId: string }) => {
    deps.stale = deps.stale.filter((id) => id !== connectionId);
  });
});

describe("rebuildPersonaPathConfig", () => {
  it("reads the store's mirror instead of walking the shared catalog when the mirror answers", async () => {
    deps.readMirrorDocuments.mockResolvedValue([acsProduct("a", "men > top > shirt", 30)]);
    const result = await rebuildPersonaPathConfig("store");
    expect(result).toMatchObject({ changed: true, inStock: 1 });
    expect(deps.readConnectionCatalog).not.toHaveBeenCalled();
  });

  it("walks ACS when the mirror cannot answer", async () => {
    deps.readConnectionCatalog.mockResolvedValue([acsProduct("a", "men > top > shirt", 30)]);
    const result = await rebuildPersonaPathConfig("store");
    expect(result).toMatchObject({ inStock: 1 });
    expect(deps.readConnectionCatalog).toHaveBeenCalledWith("store", { publishedAt: null });
  });

  it("groups brands the way the store's brand mapping does", async () => {
    deps.readMirrorDocuments.mockResolvedValue([
      acsProduct("a", "men > bottom > jean", 30, { brands: ["tom tailor"] }),
      acsProduct("b", "men > bottom > jean", 40, { brands: ["Tom Tailor Men"] }),
      acsProduct("c", "men > bottom > jean", 50, { brands: ["Tom Tailor Men"] }),
    ]);
    deps.getStoreConnectionById.mockResolvedValue({
      sizingBrandMapping: parseStoreBrandMapping({
        confirmedAt: "2026-10-09T00:00:00.000Z",
        aliases: {
          tom_tailor: { canonicalKey: "tom_tailor", canonicalName: "tom tailor" },
          tom_tailor_men: { canonicalKey: "tom_tailor", canonicalName: "tom tailor" },
        },
      }),
    });

    await rebuildPersonaPathConfig("store");

    const saved = deps.savePersonaPathConfig.mock.calls[0][0];
    const jean = saved.config.nodes.find((node: { path: string }) => node.path === "men > bottom > jean");
    expect(jean.brands).toEqual([{ name: "Tom Tailor Men", count: 3, spellings: ["Tom Tailor Men", "tom tailor"] }]);
    expect(saved.renderedText).toContain("brands: Tom Tailor Men (3)");
  });
});

describe("rebuildStalePathConfigs", () => {
  it("drains every stale store, not just the first few", async () => {
    deps.stale = Array.from({ length: 23 }, (_, index) => `conn-${index}`);
    const results = await rebuildStalePathConfigs();
    expect(results).toHaveLength(23);
    expect(deps.stale).toEqual([]);
  });

  it("tries a failing store once per call instead of looping on it", async () => {
    deps.stale = ["broken", "fine"];
    deps.readConnectionCatalog.mockImplementation(async (connectionId: string) => {
      if (connectionId === "broken") throw new Error("ACS down");
      return [];
    });
    const results = await rebuildStalePathConfigs();
    expect(results.map((result) => result.connectionId)).toEqual(["fine"]);
    expect(deps.readConnectionCatalog.mock.calls.filter(([id]) => id === "broken")).toHaveLength(1);
  });

  it("stops at the time budget", async () => {
    deps.stale = ["a", "b"];
    expect(await rebuildStalePathConfigs(0)).toEqual([]);
  });
});

describe("markPathConfigStale", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rebuilds once, shortly after a burst of changes goes quiet", async () => {
    vi.useFakeTimers();
    await markPathConfigStale("store");
    await vi.advanceTimersByTimeAsync(20_000);
    await markPathConfigStale("store");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(deps.readMirrorDocuments).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.markPersonaPathConfigStale).toHaveBeenCalledTimes(2);
    expect(deps.readMirrorDocuments).toHaveBeenCalledTimes(1);
    expect(deps.readMirrorDocuments).toHaveBeenCalledWith("store");
  });
});
