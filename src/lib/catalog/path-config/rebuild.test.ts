import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  stale: [] as string[],
  readConnectionCatalog: vi.fn(),
  getPersonaPathConfig: vi.fn(),
  savePersonaPathConfig: vi.fn(),
}));

vi.mock("@/lib/catalog/acs/config", () => ({ isAcsConfigured: () => true }));
vi.mock("@/lib/db/sizing-runs", () => ({ getLatestSizingRun: async () => null }));
vi.mock("@/lib/catalog/acs/stage-five-listing", () => ({ readConnectionCatalog: deps.readConnectionCatalog }));
vi.mock("@/lib/db/persona-path-configs", () => ({
  getPersonaPathConfig: deps.getPersonaPathConfig,
  savePersonaPathConfig: deps.savePersonaPathConfig,
  updatePersonaPathConfigData: vi.fn(),
  markPersonaPathConfigFresh: vi.fn(),
  markPersonaPathConfigStale: vi.fn(),
  listStalePersonaPathConfigIds: async (limit: number) => deps.stale.slice(0, limit),
}));

import { rebuildStalePathConfigs } from "./rebuild";

describe("rebuildStalePathConfigs", () => {
  beforeEach(() => {
    deps.readConnectionCatalog.mockReset().mockResolvedValue([]);
    deps.getPersonaPathConfig.mockReset().mockResolvedValue(null);
    deps.savePersonaPathConfig.mockReset().mockImplementation(async ({ connectionId }: { connectionId: string }) => {
      deps.stale = deps.stale.filter((id) => id !== connectionId);
    });
  });

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
