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
const setupTablesWithRows = vi.fn(async (): Promise<string[] | null> => []);
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
  setupTablesWithRows: () => setupTablesWithRows(),
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

/** What a sweep of a store with nothing left in ACS returns. */
const NOTHING_LEFT = { deleted: 0, found: 0, complete: true };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  claimSetupResetLease.mockResolvedValue({ deleted: 0 });
  listUnclaimedSetupResets.mockResolvedValue([]);
  setupTablesWithRows.mockResolvedValue([]);
  sweepAcsProductsForConnection.mockReset();
  sweepAcsProductsForConnection.mockResolvedValue(NOTHING_LEFT);
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

  it("finishes only after a second listing proves nothing of the store is left", async () => {
    sweepAcsProductsForConnection.mockResolvedValueOnce({ deleted: 300, found: 300, complete: true });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("done");

    expect(sweepAcsProductsForConnection).toHaveBeenCalledTimes(2);
    expect(patches().at(-1)).toMatchObject({ status: "done", deleted: 300, total: 300, error: null });
  });

  it("deletes what a job wrote mid-cleanup before finishing", async () => {
    sweepAcsProductsForConnection
      .mockResolvedValueOnce({ deleted: 300, found: 300, complete: true })
      .mockResolvedValueOnce({ deleted: 5, found: 5, complete: true });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("done");

    expect(sweepAcsProductsForConnection).toHaveBeenCalledTimes(3);
    expect(patches().at(-1)).toMatchObject({ status: "done", deleted: 305 });
  });

  it("clears the setup tables again and counts them empty before it reports done", async () => {
    await cleanAcsAfterReset("conn-1");

    expect(wipeSetupTables).toHaveBeenCalledTimes(1);
    expect(setupTablesWithRows).toHaveBeenCalledTimes(1);
    expect(patches().at(-1)).toMatchObject({ status: "done" });
  });

  it("is not done while setup rows are still there", async () => {
    setupTablesWithRows.mockResolvedValue(["sizing_coverage"]);

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("failed");
    expect(patches().at(-1)).toMatchObject({ status: "failed", error: expect.stringContaining("Retry") });
  });

  it("is not done when the setup tables cannot be counted", async () => {
    setupTablesWithRows.mockResolvedValue(null);

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("failed");
  });

  it("stops at its time budget and leaves the rest running for the next pass", async () => {
    sweepAcsProductsForConnection.mockResolvedValueOnce({ deleted: 4_000, found: 19_740, complete: false });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("continuing");

    const [, options] = sweepAcsProductsForConnection.mock.calls[0] as [string, { until: number }];
    expect(options.until).toBeGreaterThan(Date.now());
    const last = patches().at(-1);
    expect(last).toMatchObject({ deleted: 4_000, total: 19_740 });
    expect(last).not.toHaveProperty("status");
    expect(wipeSetupTables).not.toHaveBeenCalled();
  });

  it("adds to what earlier passes removed, so the count and total stay whole", async () => {
    claimSetupResetLease.mockResolvedValue({ deleted: 6_000 });
    sweepAcsProductsForConnection.mockResolvedValueOnce({ deleted: 13_740, found: 13_740, complete: true });

    await cleanAcsAfterReset("conn-1");

    expect(patches().at(-1)).toMatchObject({ status: "done", deleted: 19_740, total: 19_740 });
  });

  it("reports progress on a heartbeat, and only extends its lease while still listing", async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    sweepAcsProductsForConnection.mockImplementationOnce(async (_id: string, options: { onProgress: Progress }) => {
      now += 12_000;
      await options.onProgress({ deleted: 0, found: 200 });
      now += 2_000;
      await options.onProgress({ deleted: 100, found: 500 });
      now += 10_000;
      await options.onProgress({ deleted: 300, found: 500 });
      return { deleted: 500, found: 500, complete: true };
    });

    await cleanAcsAfterReset("conn-1");
    clock.mockRestore();

    const beats = patches().filter((patch) => !("status" in patch));
    expect(beats).toEqual([
      { leaseUntil: expect.any(String) },
      { deleted: 300, total: 500, leaseUntil: expect.any(String) },
      { deleted: 500, total: 500, leaseUntil: expect.any(String) },
    ]);
  });

  it("gives up on a store whose listing never settles, instead of listing forever", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    sweepAcsProductsForConnection.mockResolvedValue({ deleted: 0, found: 3, complete: true });

    const pending = cleanAcsAfterReset("conn-1");
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    await expect(pending).resolves.toBe("failed");
    expect(sweepAcsProductsForConnection).toHaveBeenCalledTimes(3);
  });

  it("keeps going after a refused delete when the pass still made progress", async () => {
    sweepAcsProductsForConnection.mockResolvedValueOnce({
      deleted: 1_000,
      found: 5_000,
      complete: false,
      error: new Error("ACS is down"),
    });

    await expect(cleanAcsAfterReset("conn-1")).resolves.toBe("continuing");
  });

  it("marks the cleanup failed, with a retryable message, when a pass removes nothing", async () => {
    sweepAcsProductsForConnection.mockResolvedValueOnce({
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
    sweepAcsProductsForConnection.mockResolvedValueOnce({ deleted: 10, found: 10, complete: true });

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
