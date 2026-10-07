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
const deleteAllAcsProductsForConnection = vi.fn();

vi.mock("@/lib/db/setup-reset", () => ({
  writeSetupResetState: (id: string, patch: Record<string, unknown>) => writeSetupResetState(id, patch),
  resetSetupColumns: (id: string, scope: string) => resetSetupColumns(id, scope),
  wipeSetupTables: () => wipeSetupTables(),
  wipeAcsMirror: () => wipeAcsMirror(),
}));
vi.mock("@/lib/db/catalog-queue", () => ({ purgeConnectionFromQueue: () => purgeConnectionFromQueue() }));
vi.mock("@/lib/catalog/acs/catalog-reads", () => ({
  deleteAllAcsProductsForConnection: (...args: unknown[]) => deleteAllAcsProductsForConnection(...args),
}));
vi.mock("@/lib/catalog/path-config/rebuild", () => ({ markPathConfigStale: vi.fn(async () => undefined) }));
vi.mock("@/lib/catalog/acs/stage-five-preview", () => ({ clearGeneratedStageFiveCache: vi.fn() }));
vi.mock("@/lib/catalog/acs/stage-five-listing", () => ({ clearAcsStageFiveCache: vi.fn() }));

const { cleanAcsAfterReset, resetSetupData } = await import("./start-from-scratch");

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("resetSetupData", () => {
  it("marks the cleanup running first, then stops writers, then deletes the setup data", async () => {
    await expect(resetSetupData("conn-1", "setup")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["state:running", "columns:setup", "queue", "tables"]);
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
  it("records progress as documents go and the total when it ends", async () => {
    deleteAllAcsProductsForConnection.mockImplementation(
      async (_id: string, options: { onProgress: (n: number) => Promise<void> }) => {
        await options.onProgress(100);
        await options.onProgress(250);
        await options.onProgress(300);
        return 300;
      },
    );

    await cleanAcsAfterReset("conn-1");

    const patches = writeSetupResetState.mock.calls.map(([, patch]) => patch);
    expect(patches).toContainEqual({ deleted: 250 });
    expect(patches).not.toContainEqual({ deleted: 100 });
    expect(patches.at(-1)).toMatchObject({ status: "done", deleted: 300, error: null });
    expect(wipeAcsMirror).toHaveBeenCalled();
  });

  it("marks the cleanup failed, with a retryable message, when ACS refuses", async () => {
    deleteAllAcsProductsForConnection.mockRejectedValue(new Error("ACS is down"));

    await cleanAcsAfterReset("conn-1");

    expect(writeSetupResetState).toHaveBeenLastCalledWith(
      "conn-1",
      expect.objectContaining({ status: "failed", error: expect.stringContaining("Retry") }),
    );
  });
});
