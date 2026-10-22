import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { IDLE_SETUP_RESET } from "@/lib/catalog/setup-reset-state";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-runs", () => ({
  getActiveSizingRun: vi.fn(),
  getLatestSizingRun: vi.fn(),
  updateSizingRun: vi.fn(),
}));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({ summarizeGeneratedSizing: vi.fn() }));
vi.mock("@/lib/sync/scope", () => ({
  runProducts: vi.fn(async () => [{ externalId: "p1" }, { externalId: "p2" }]),
  previewScopeFor: vi.fn((run: { id: string }, products: Array<{ externalId: string }>) => ({
    key: `sync:${run.id}`,
    externalIds: products.map((product) => product.externalId),
  })),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getActiveSizingRun, updateSizingRun } from "@/lib/db/sizing-runs";
import { summarizeGeneratedSizing } from "@/lib/catalog/acs/stage-five-preview";
import { POST } from "./route";

function post(body?: unknown): Request {
  return new Request("http://localhost/api/store-connection/sync/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/store-connection/sync/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      { id: "connection-1", setupReset: IDLE_SETUP_RESET } as unknown as StoreConnectionRow,
    );
    vi.mocked(getActiveSizingRun).mockResolvedValue({ id: "sync-1", kind: "delta", status: "blocked", stage: "assign" } as never);
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue({
      matched: 2,
      unresolved: 0,
      unresolvedGroups: [],
      brandMappingCurrent: true,
    } as never);
    vi.mocked(updateSizingRun).mockResolvedValue({ id: "sync-1", stage: "publish", status: "pending" } as never);
  });

  it("queues the sync's publish, resolved over its own products only", async () => {
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(summarizeGeneratedSizing).toHaveBeenCalledWith(expect.anything(), {
      mode: "current",
      scope: { key: "sync:sync-1", externalIds: ["p1", "p2"] },
    });
    expect(updateSizingRun).toHaveBeenCalledWith("sync-1", expect.objectContaining({ stage: "publish", status: "pending" }));
  });

  it("asks for confirmation when new products would publish without a chart", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue({
      matched: 1,
      unresolved: 1,
      unresolvedGroups: [],
      brandMappingCurrent: true,
    } as never);
    const first = await POST(post());
    expect(first.status).toBe(409);
    expect((await first.json()).requiresConfirmation).toBe(true);
    expect(updateSizingRun).not.toHaveBeenCalled();

    const confirmed = await POST(post({ confirmUnresolved: 1 }));
    expect(confirmed.status).toBe(200);
  });

  it("refuses while new brands are unmapped", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue({
      matched: 2,
      unresolved: 0,
      unresolvedGroups: [],
      brandMappingCurrent: false,
    } as never);
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("brand_mapping");
  });

  it("refuses with no sync in progress, even while Setup has a run open", async () => {
    vi.mocked(getActiveSizingRun).mockResolvedValue({ id: "setup-1", kind: "setup", status: "blocked", stage: "assign" } as never);
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect(updateSizingRun).not.toHaveBeenCalled();
  });

  it("refuses while the sync is still reading its products", async () => {
    vi.mocked(getActiveSizingRun).mockResolvedValue({ id: "sync-1", kind: "delta", status: "running", stage: "scan" } as never);
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect(updateSizingRun).not.toHaveBeenCalled();
  });
});
