import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrainResult } from "./process-queue";

const runCatalogEnqueuePass = vi.fn(async () => [] as Array<{ connectionId: string; enqueued: number }>);
const getCatalogQueueDepth = vi.fn(async () => 0);
const drainCatalogQueue = vi.fn(async () => drainResult());
const settleFinishedRuns = vi.fn(async () => 0);
const runSizingJobPass = vi.fn(async () => []);
const runCmsColumnDiscoveryPass = vi.fn(async () => []);
const runSetupResetCleanupPass = vi.fn(async () => []);
const claimScheduledJob = vi.fn<(name: string, everySeconds: number) => Promise<boolean>>(async () => false);
const runCatalogReconcilePass = vi.fn(async () => ({ reconciled: [], pathConfigs: [], billingGaps: 0 }));

vi.mock("./jobs", () => ({ runCatalogEnqueuePass: () => runCatalogEnqueuePass() }));
vi.mock("@/lib/db/scheduled-jobs", () => ({
  claimScheduledJob: (name: string, everySeconds: number) => claimScheduledJob(name, everySeconds),
}));
vi.mock("./reconcile", () => ({
  RECONCILE_JOB: "catalog-reconcile",
  RECONCILE_EVERY_SECONDS: 3600,
  runCatalogReconcilePass: () => runCatalogReconcilePass(),
}));
vi.mock("./start-from-scratch", () => ({ runSetupResetCleanupPass: () => runSetupResetCleanupPass() }));
vi.mock("@/lib/sizing/jobs", () => ({ runSizingJobPass: () => runSizingJobPass() }));
vi.mock("./discover-cms-columns", () => ({ runCmsColumnDiscoveryPass: () => runCmsColumnDiscoveryPass() }));
vi.mock("@/lib/db/catalog-queue", () => ({ getCatalogQueueDepth: () => getCatalogQueueDepth() }));
vi.mock("./process-queue", () => ({
  drainCatalogQueue: () => drainCatalogQueue(),
  settleFinishedRuns: () => settleFinishedRuns(),
}));

const { isCatalogWorkerEnabled, runCatalogTick } = await import("./worker");

function drainResult(patch: Partial<DrainResult> = {}): DrainResult {
  return {
    claimed: 0,
    indexed: 0,
    failed: 0,
    remaining: 0,
    batches: 1,
    orphaned: 0,
    ...patch,
  };
}

describe("isCatalogWorkerEnabled", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.CATALOG_WORKER;
    delete process.env.VERCEL;
    delete process.env.RENDER;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("runs by default on the Render host", () => {
    process.env.RENDER = "true";
    expect(isCatalogWorkerEnabled()).toBe(true);
  });

  // A laptop or forgotten server pointed at the shared database would otherwise claim scans
  // with whatever code it happens to have checked out.
  it("stays off on any other machine unless asked for explicitly", () => {
    expect(isCatalogWorkerEnabled()).toBe(false);

    process.env.CATALOG_WORKER = "1";
    expect(isCatalogWorkerEnabled()).toBe(true);
  });

  // A loop started in a serverless instance dies as soon as the invocation ends, so those
  // deployments must fall back to the pg_cron schedule instead of silently indexing nothing.
  it("stays off on Vercel unless asked for explicitly", () => {
    process.env.VERCEL = "1";
    expect(isCatalogWorkerEnabled()).toBe(false);

    process.env.CATALOG_WORKER = "1";
    expect(isCatalogWorkerEnabled()).toBe(true);
  });

  it("can be turned off explicitly", () => {
    process.env.CATALOG_WORKER = "0";
    expect(isCatalogWorkerEnabled()).toBe(false);
  });
});

describe("runCatalogTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCatalogQueueDepth.mockResolvedValue(0);
    drainCatalogQueue.mockResolvedValue(drainResult());
  });

  it("does not touch the queue machinery when there is nothing queued", async () => {
    await runCatalogTick();

    expect(runCatalogEnqueuePass).toHaveBeenCalledTimes(1);
    expect(drainCatalogQueue).not.toHaveBeenCalled();
  });

  // Sizing shares this loop, and an idle catalog queue is the common case — a scan that only ran
  // when there happened to be indexing work would sit pending indefinitely on a settled store.
  it("advances sizing runs even when the catalog queue is idle", async () => {
    await runCatalogTick();

    expect(runSizingJobPass).toHaveBeenCalledTimes(1);
  });

  // Same reasoning as the sizing pass above: a full-catalog column walk shares this loop rather
  // than getting its own, so it must advance on every tick regardless of catalog queue depth.
  it("advances full-catalog column discovery walks every tick", async () => {
    await runCatalogTick();

    expect(runCmsColumnDiscoveryPass).toHaveBeenCalledTimes(1);
  });

  it("carries a Start from scratch cleanup forward without waiting on it", async () => {
    let finish: () => void = () => undefined;
    runSetupResetCleanupPass.mockImplementationOnce(
      () => new Promise<never[]>((resolve) => (finish = () => resolve([]))),
    );

    await runCatalogTick();
    await runCatalogTick();
    expect(runSetupResetCleanupPass).toHaveBeenCalledTimes(1);

    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runCatalogTick();
    expect(runSetupResetCleanupPass).toHaveBeenCalledTimes(2);
  });

  it("still concludes an unfinished run when there is nothing left to drain", async () => {
    // The drain path is where a run normally ends, and a run stranded by an earlier drain can
    // never reach it again — there is nothing to drain. Without this the catalog stays
    // unsearchable to the agent indefinitely.
    await runCatalogTick();

    expect(settleFinishedRuns).toHaveBeenCalledTimes(1);
  });

  it("drains when work is queued and comes straight back while any remains", async () => {
    getCatalogQueueDepth.mockResolvedValue(120);
    drainCatalogQueue.mockResolvedValue(drainResult({ indexed: 60, remaining: 60 }));

    await expect(runCatalogTick()).resolves.toBe(0);
    expect(drainCatalogQueue).toHaveBeenCalledTimes(1);
  });

  it("idles once the queue empties", async () => {
    getCatalogQueueDepth.mockResolvedValue(60);
    drainCatalogQueue.mockResolvedValue(drainResult({ indexed: 60, remaining: 0 }));

    await expect(runCatalogTick()).resolves.toBeGreaterThan(0);
  });
});

describe("hourly reconcile", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  let clock = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    claimScheduledJob.mockReset().mockResolvedValue(false);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Each test starts past the previous test's next check.
    clock += 10 * 60_000;
    vi.setSystemTime(clock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the reconcile only when this instance wins the hour's claim", async () => {
    claimScheduledJob.mockResolvedValueOnce(true);

    await runCatalogTick();
    await settle();

    expect(claimScheduledJob).toHaveBeenCalledWith("catalog-reconcile", 3600);
    expect(runCatalogReconcilePass).toHaveBeenCalledTimes(1);
  });

  it("does not run it when another instance holds the claim", async () => {
    claimScheduledJob.mockResolvedValueOnce(false);

    await runCatalogTick();
    await settle();

    expect(runCatalogReconcilePass).not.toHaveBeenCalled();
  });

  it("asks at most once a minute, and never while a pass is still running", async () => {
    let finish: () => void = () => undefined;
    claimScheduledJob.mockResolvedValue(true);
    runCatalogReconcilePass.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ reconciled: [], pathConfigs: [], billingGaps: 0 }))),
    );

    await runCatalogTick();
    await settle();
    clock += 2 * 60_000;
    vi.setSystemTime(clock);
    await runCatalogTick();
    expect(runCatalogReconcilePass).toHaveBeenCalledTimes(1);

    finish();
    await settle();
    await runCatalogTick();
    await settle();
    expect(claimScheduledJob).toHaveBeenCalledTimes(2);

    await runCatalogTick();
    expect(claimScheduledJob).toHaveBeenCalledTimes(2);
  });
});
