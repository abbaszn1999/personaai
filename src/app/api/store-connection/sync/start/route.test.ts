import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import { IDLE_SETUP_RESET } from "@/lib/catalog/setup-reset-state";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/catalog/acs/field-overrides", () => ({ hasApprovedCurrentMapping: vi.fn(() => true) }));
vi.mock("@/lib/catalog/acs/map-product", () => ({ MAPPER_VERSION: 9 }));
vi.mock("@/lib/db/sizing-runs", () => ({
  createSizingRun: vi.fn(),
  failSizingRun: vi.fn(),
  getActiveSizingRun: vi.fn(),
  getLatestPublishedSizingRun: vi.fn(),
  getLatestSizingRun: vi.fn(),
}));
vi.mock("@/lib/db/sync-new-products", () => ({
  claimPendingSyncProducts: vi.fn(),
  listSyncProducts: vi.fn(),
  releaseRunSyncProducts: vi.fn(),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import {
  createSizingRun,
  failSizingRun,
  getActiveSizingRun,
  getLatestPublishedSizingRun,
  getLatestSizingRun,
} from "@/lib/db/sizing-runs";
import { claimPendingSyncProducts, listSyncProducts, releaseRunSyncProducts } from "@/lib/db/sync-new-products";
import { POST } from "./route";

const deltaRun = { id: "sync-1", kind: "delta", status: "pending", stage: "scan" };

describe("POST /api/store-connection/sync/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      { id: "connection-1", setupReset: IDLE_SETUP_RESET } as unknown as StoreConnectionRow,
    );
    vi.mocked(getLatestPublishedSizingRun).mockResolvedValue({ id: "setup-1" } as never);
    vi.mocked(getActiveSizingRun).mockResolvedValue(null);
    vi.mocked(getLatestSizingRun).mockResolvedValue(null);
    vi.mocked(listSyncProducts).mockResolvedValue({ rows: [], total: 3 });
    vi.mocked(createSizingRun).mockResolvedValue(deltaRun as never);
    vi.mocked(claimPendingSyncProducts).mockResolvedValue(3);
  });

  it("starts a delta run and hands it every waiting product", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(createSizingRun).toHaveBeenCalledWith("connection-1", "delta");
    expect(claimPendingSyncProducts).toHaveBeenCalledWith("connection-1", "sync-1");
    expect((await response.json()).claimed).toBe(3);
  });

  it("refuses before Setup has published", async () => {
    vi.mocked(getLatestPublishedSizingRun).mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("not_published");
    expect(createSizingRun).not.toHaveBeenCalled();
  });

  it("refuses while Setup has a run open", async () => {
    vi.mocked(getActiveSizingRun).mockResolvedValue({ id: "setup-2", kind: "setup" } as never);
    const response = await POST();
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("setup_in_progress");
    expect(createSizingRun).not.toHaveBeenCalled();
  });

  it("returns the sync already in progress instead of starting a second", async () => {
    vi.mocked(getActiveSizingRun).mockResolvedValue(deltaRun as never);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(createSizingRun).not.toHaveBeenCalled();
  });

  it("refuses with nothing waiting", async () => {
    vi.mocked(listSyncProducts).mockResolvedValue({ rows: [], total: 0 });
    const response = await POST();
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("nothing_pending");
  });

  it("puts a failed sync's products back in the queue before starting the next", async () => {
    vi.mocked(getLatestSizingRun).mockResolvedValue({ id: "sync-0", kind: "delta", status: "failed" } as never);
    await POST();
    expect(releaseRunSyncProducts).toHaveBeenCalledWith("sync-0");
  });

  it("closes a run that found the queue already emptied", async () => {
    vi.mocked(claimPendingSyncProducts).mockResolvedValue(0);
    const response = await POST();
    expect(response.status).toBe(409);
    expect(failSizingRun).toHaveBeenCalledWith("sync-1", expect.any(String));
  });
});
