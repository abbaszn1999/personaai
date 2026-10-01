import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidate } from "../__fixtures__/catalog";

const deps = vi.hoisted(() => ({
  getStoreConnectionByOwner: vi.fn(),
  getCatalogProductsByExternalIds: vi.fn(),
  getPersonaPathConfig: vi.fn(),
}));

vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: deps.getStoreConnectionByOwner }));
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({ getCatalogProductsByExternalIds: deps.getCatalogProductsByExternalIds }));
vi.mock("@/lib/db/persona-path-configs", () => ({ getPersonaPathConfig: deps.getPersonaPathConfig }));
vi.mock("@/lib/catalog/acs/config", () => ({ isAcsConfigured: () => true }));
vi.mock("@/lib/catalog/persona-mapping", () => ({ mappedSourceCategoryIds: () => ["cat-1"] }));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({
  rebuildPersonaPathConfig: vi.fn(),
  scheduleRebuildPersonaPathConfig: vi.fn(),
}));

import { buildAgentContext } from "./context";

const base = {
  ownerId: "owner",
  visitorId: "visitor",
  geminiApiKey: "key",
  messages: [{ id: "1", role: "user" as const, content: "is this one warm?", timestamp: "" }],
};

describe("buildAgentContext", () => {
  beforeEach(() => {
    deps.getStoreConnectionByOwner.mockResolvedValue({ id: "conn", catalogSyncStatus: "ready", personaCategoryMap: {}, styleGuide: null });
    deps.getPersonaPathConfig.mockResolvedValue({ staleAt: null });
    deps.getCatalogProductsByExternalIds.mockImplementation(async (_connection: string, ids: string[]) =>
      ids.filter((id) => id !== "gone").map((externalId) => candidate({ externalId }))
    );
  });

  it("hydrates a referenced item alongside what is on screen", async () => {
    const ctx = await buildAgentContext({
      ...base,
      retrievalState: { shownProductIds: ["a", "b"] },
      referencedItemId: "c",
    });
    expect(deps.getCatalogProductsByExternalIds.mock.calls[0][1]).toEqual(["a", "b", "c"]);
    expect(ctx.referencedItemId).toBe("c");
    expect(ctx.products.has("c")).toBe(true);
  });

  it("drops a referenced id that no longer resolves, and junk input", async () => {
    expect((await buildAgentContext({ ...base, referencedItemId: "gone" })).referencedItemId).toBeNull();
    expect((await buildAgentContext({ ...base, referencedItemId: 42 })).referencedItemId).toBeNull();
  });

  it("carries the shopper's audience and derived department", async () => {
    const ctx = await buildAgentContext({ ...base, audience: "kids-girl", budget: "120" });
    expect(ctx.session).toEqual({ audience: "kids-girl", department: "kids-girls", budget: 120, measurements: null });
  });

  it("carries the onboarding measurements", async () => {
    const ctx = await buildAgentContext({ ...base, measurements: { heightCm: 180, chestCm: 100, waistCm: 84 } });
    expect(ctx.session.measurements).toEqual({ heightCm: 180, chestCm: 100, waistCm: 84, hipsCm: null, shoeSizeEu: null });
  });
});
