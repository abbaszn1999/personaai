import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrainResult } from "./process-queue";

const runCatalogEnqueuePass = vi.fn(async () => [] as Array<{ connectionId: string; enqueued: number }>);
const getCatalogQueueDepth = vi.fn(async () => 0);
const drainCatalogQueue = vi.fn(async () => drainResult());
const settleFinishedRuns = vi.fn(async () => 0);
const runSizingJobPass = vi.fn(async () => []);

vi.mock("./jobs", () => ({ runCatalogEnqueuePass: () => runCatalogEnqueuePass() }));
vi.mock("@/lib/sizing/jobs", () => ({ runSizingJobPass: () => runSizingJobPass() }));
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
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("runs by default on a long-lived server", () => {
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
