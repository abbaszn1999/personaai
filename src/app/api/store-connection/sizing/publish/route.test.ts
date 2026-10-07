import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { IDLE_SETUP_RESET } from "@/lib/catalog/setup-reset-state";
import { POST } from "./route";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-product-records", () => ({ getSizingProductSnapshotHealth: vi.fn() }));
vi.mock("@/lib/db/sizing-runs", () => ({
  getLatestSizingRun: vi.fn(),
  rewindRun: vi.fn(),
  updateSizingRun: vi.fn(),
}));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({ summarizeGeneratedSizing: vi.fn() }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getSizingProductSnapshotHealth } from "@/lib/db/sizing-product-records";
import { getLatestSizingRun, updateSizingRun } from "@/lib/db/sizing-runs";
import { summarizeGeneratedSizing } from "@/lib/catalog/acs/stage-five-preview";

function post(body?: unknown): Request {
  return new Request("http://localhost/api/store-connection/sizing/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function summary(unresolved: number) {
  return {
    matched: 100,
    unresolved,
    unresolvedGroups: unresolved > 0 ? [{ brandKey: "house", leafKey: "men:top:polo-shirt", status: "no_chart", count: unresolved }] : [],
  };
}

describe("POST /api/store-connection/sizing/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      { id: "connection-1", setupReset: IDLE_SETUP_RESET } as unknown as StoreConnectionRow,
    );
    vi.mocked(getLatestSizingRun).mockResolvedValue({
      id: "run-1",
      stage: "assign",
      status: "blocked",
    } as never);
    vi.mocked(getSizingProductSnapshotHealth).mockResolvedValue({
      total: 100,
      missingPrimaryLeaf: 0,
      missingRawSizeFormat: 0,
    } as never);
    vi.mocked(updateSizingRun).mockResolvedValue({ id: "run-1", stage: "resolve", status: "pending" } as never);
  });

  it("waits while Start from scratch is still removing the store's old products from ACS", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({
      id: "connection-1",
      setupReset: { ...IDLE_SETUP_RESET, status: "running", startedAt: new Date().toISOString() },
    } as unknown as StoreConnectionRow);

    const response = await POST(post({}));

    expect(response.status).toBe(409);
    expect(updateSizingRun).not.toHaveBeenCalled();
  });

  it("queues the publish when every product has a chart", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue(summary(0) as never);

    const response = await POST(post({}));

    expect(response.status).toBe(200);
    expect(summarizeGeneratedSizing).toHaveBeenCalledWith(expect.anything(), { mode: "current" });
    expect(updateSizingRun).toHaveBeenCalledWith("run-1", expect.objectContaining({ stage: "resolve", status: "pending" }));
  });

  it("refuses with the unresolved groups when products would publish without a chart", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue(summary(12) as never);

    const response = await POST(post({}));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ requiresConfirmation: true, unresolved: 12, total: 112 });
    expect(body.groups).toHaveLength(1);
    expect(updateSizingRun).not.toHaveBeenCalled();
  });

  it("publishes once the confirmation matches the live count", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue(summary(12) as never);

    const response = await POST(post({ confirmUnresolved: 12 }));

    expect(response.status).toBe(200);
    expect(updateSizingRun).toHaveBeenCalled();
  });

  it("re-asks when the confirmation was given against a stale count", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue(summary(15) as never);

    const response = await POST(post({ confirmUnresolved: 12 }));

    expect(response.status).toBe(409);
    expect((await response.json()).unresolved).toBe(15);
    expect(updateSizingRun).not.toHaveBeenCalled();
  });

  it("accepts a request with no body", async () => {
    vi.mocked(summarizeGeneratedSizing).mockResolvedValue(summary(0) as never);

    const response = await POST(post());

    expect(response.status).toBe(200);
  });
});
