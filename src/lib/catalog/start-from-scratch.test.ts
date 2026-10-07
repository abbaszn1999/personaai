import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const writeSetupResetState = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
  calls.push(`state:${String(patch.status ?? "progress")}`);
  return true;
});
const resetSetupColumns = vi.fn(async (_id: string, scope: string) => {
  calls.push(`columns:${scope}`);
  return true;
});
const wipeSetupTables = vi.fn(async (): Promise<string[]> => {
  calls.push("tables");
  return [];
});
const wipeAcsMirror = vi.fn(async () => {
  calls.push("mirror");
});
const purgeConnectionFromQueue = vi.fn(async () => {
  calls.push("queue");
  return 0;
});
const claimSetupResetLease = vi.fn(async (): Promise<{ deleted: number } | null> => ({ deleted: 0 }));
const listUnclaimedSetupResets = vi.fn(async (): Promise<string[]> => []);
const sweepAcsProductsForConnection = vi.fn();

vi.mock("@/lib/db/setup-reset", () => ({
  writeSetupResetState: (id: string, patch: Record<string, unknown>) => writeSetupResetState(id, patch),
  resetSetupColumns: (id: string, scope: string) => resetSetupColumns(id, scope),
  wipeSetupTables: () => wipeSetupTables(),
  wipeAcsMirror: () => wipeAcsMirror(),
  claimSetupResetLease: () => claimSetupResetLease(),
  listUnclaimedSetupResets: () => listUnclaimedSetupResets(),
}));
vi.mock("@/lib/db/catalog-queue", () => ({ purgeConnectionFromQueue: () => purgeConnectionFromQueue() }));
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({
  sweepAcsProductsForConnection: (...args: unknown[]) => sweepAcsProductsForConnection(...args),
}));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({ markPathConfigStale: vi.fn(async () => undefined) }));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({ clearGeneratedStageFiveCache: vi.fn() }));
vi.mock("@/lib/catalog/acs/stage-five-listing", () => ({ clearAcsStageFiveCache: vi.fn() }));

const { cleanAcsAfterReset, resetSetupData, restartAcsCleanup, runSetupResetCleanupPass } = await import(
  "./start-from-scratch"
);

type Progress = (progress: { deleted: number; found: number }) => Promise<void>;

function patches() {
  return writeSetupResetState.mock.calls.map(([, patch]) => patch);
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  claimSetupResetLease.mockResolvedValue({ deleted: 0 });
  listUnclaimedSetupResets.mockResolvedValue([]);
});

describe("resetSetupData", () => {
  it("marks the cleanup running first, then stops writers, then deletes the setup data", async () => {
    await expect(resetSetupData("conn-1", "setup")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["state:running", "columns:setup", "queue", "tables"]);
    expect(patches()[0]).toMatchObject({ deleted: 0, total: null, leaseUntil: null });
  });

  it("passes the scope through, so Mapping's button also clears the mapping", async () => {
    await resetSetupData("conn-1", "mapping");
    expect(resetSetupColumns).toHaveBeenCalledWith("conn-1", "mapping");
  });

  it("leaves nothing to wait for when a database step fails, so the merchant can simply press again", async () => {
    wipeSetupTables.mockImplementationOnce(async () => ["sizing_runs"]);
    const result = await resetSetupData("conn-1", "setup");

    expect(result.ok).toBe(false);
    expect(writeSetupResetState).toHaveBeenLastCalledWith("conn-1", expect.objectContaining({ status: "idle" }));
  });
});

describe("cleanAcsAfterReset", () => {
  it("leaves a cleanup another pass holds to that pass", async () => {
    claimSetupResetLease.mockResolvedValue(null);

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("busy");
    expect(sweepAcsProductsForConnection).not.toHaveBeenCalled();
  });

  it("finishes the cleanup and drops the mirror once nothing is left", async () => {
    sweepAcsProductsForConnection.mockResolvedValue({ deleted: 300, found: 300, complete: true });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("done");

    expect(patches().at(-1)).toMatchObject({ status: "done", deleted: 300, total: 300, error: null });
    expect(wipeAcsMirror).toHaveBeenCalled();
  });

  it("stops at its time budget and leaves the rest running for the next pass", async () => {
    sweepAcsProductsForConnection.mockResolvedValue({ deleted: 4_000, found: 19_740, complete: false });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("continuing");

    const [, options] = sweepAcsProductsForConnection.mock.calls[0] as [string, { until: number }];
    expect(options.until).toBeGreaterThan(Date.now());
    const last = patches().at(-1);
    expect(last).toMatchObject({ deleted: 4_000, total: 19_740 });
    expect(last).not.toHaveProperty("status");
    expect(wipeAcsMirror).not.toHaveBeenCalled();
  });

  it("adds to what earlier passes removed, so the count and total stay whole", async () => {
    claimSetupResetLease.mockResolvedValue({ deleted: 6_000 });
    sweepAcsProductsForConnection.mockResolvedValue({ deleted: 13_740, found: 13_740, complete: true });

    await cleanAcsAfterReset("conn-1");

    expect(patches().at(-1)).toMatchObject({ status: "done", deleted: 19_740, total: 19_740 });
  });

  it("reports progress on a heartbeat, extending its lease each time", async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    sweepAcsProductsForConnection.mockImplementation(async (_id: string, options: { onProgress: Progress }) => {
      now += 2_000;
      await options.onProgress({ deleted: 100, found: 500 });
      now += 10_000;
      await options.onProgress({ deleted: 300, found: 500 });
      return { deleted: 500, found: 500, complete: true };
    });

    await cleanAcsAfterReset("conn-1");
    clock.mockRestore();

    const beats = patches().filter((patch) => !("status" in patch));
    expect(beats).toEqual([{ deleted: 300, total: 500, leaseUntil: expect.any(String) }]);
  });

  it("keeps going after a refused delete when the pass still made progress", async () => {
    sweepAcsProductsForConnection.mockResolvedValue({
      deleted: 1_000,
      found: 5_000,
      complete: false,
      error: new Error("ACS is down"),
    });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("continuing");
  });

  it("marks the cleanup failed, with a retryable message, when a pass removes nothing", async () => {
    sweepAcsProductsForConnection.mockResolvedValue({
      deleted: 0,
      found: 5_000,
      complete: false,
      error: new Error("ACS is down"),
    });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("failed");
    expect(writeSetupResetState).toHaveBeenLastCalledWith(
      "conn-1",
      expect.objectContaining({ status: "failed", error: expect.stringContaining("Retry") }),
    );
  });

  it("marks the cleanup failed when ACS cannot even be listed", async () => {
    sweepAcsProductsForConnection.mockRejectedValue(new Error("ACS is down"));

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("failed");
  });
});

describe("runSetupResetCleanupPass", () => {
  it("does nothing when no cleanup is waiting", async () => {
    await expect(runSetupResetCleanupPass()).resolves.toEqual([]);
    expect(claimSetupResetLease).not.toHaveBeenCalled();
  });

  it("carries the oldest waiting cleanup one pass further", async () => {
    listUnclaimedSetupResets.mockResolvedValue(["conn-1"]);
    sweepAcsProductsForConnection.mockResolvedValue({ deleted: 10, found: 10, complete: true });

    await expect(runSetupResetCleanupPass()).resolves.toEqual([{ connectionId: "conn-1", outcome: "done" }]);
  });
});

describe("restartAcsCleanup", () => {
  it("runs again with a free lease dated now, so it does not read as abandoned", async () => {
    await restartAcsCleanup("conn-1");

    const [patch] = patches();
    expect(patch).toMatchObject({ status: "running", error: null, finishedAt: null });
    expect(Date.now() - Date.parse(String(patch.leaseUntil))).toBeLessThan(5_000);
  });
});
