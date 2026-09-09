import { db } from "@/lib/supabase/server";

/**
 * Server-side state for one pass of the size-intelligence pipeline.
 *
 * Exists so the setup pipeline resumes from the server rather than from browser state. Before this,
 * "which stage am I on" lived only in a Zustand store, so a refresh mid-pipeline lost every stage's
 * progress — including work that had already been paid for. It is also the gate the final index
 * reads: a merchant cannot publish sizing attributes from a run that never finished.
 */

export const SIZING_RUN_STAGES = ["scan", "classify", "research", "gap_fill", "resolve", "publish"] as const;
export type SizingRunStage = (typeof SIZING_RUN_STAGES)[number];

/** `blocked` is distinct from `running` on purpose: it means the run is waiting on the merchant to
 *  fill a gap template, not on a job. That distinction is what lets the UI block "Continue"
 *  server-side instead of trusting an in-memory list of open gaps. */
export const SIZING_RUN_STATUSES = ["pending", "running", "blocked", "complete", "failed"] as const;
export type SizingRunStatus = (typeof SIZING_RUN_STATUSES)[number];

export interface SizingRunRow {
  id: string;
  connectionId: string;
  kind: "setup" | "delta";
  status: SizingRunStatus;
  stage: SizingRunStage;
  productsScanned: number;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToRun(row: Record<string, unknown>): SizingRunRow {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    kind: (row.kind as "setup" | "delta") ?? "setup",
    status: row.status as SizingRunStatus,
    stage: row.stage as SizingRunStage,
    productsScanned: (row.products_scanned as number) ?? 0,
    error: (row.error as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Statuses that mean a run still owns this connection. Mirrors `sizing_runs_active_idx`, which is
 *  what actually enforces one-live-run-per-connection. */
const LIVE_STATUSES: SizingRunStatus[] = ["pending", "running", "blocked"];

/**
 * Starts a run, or returns the live one if a run is already open.
 *
 * The partial unique index means a second insert fails rather than forking a second scan writing the
 * same coverage rows, which is exactly what a double-clicked "Start" would otherwise do. That
 * conflict is treated as success — the caller wanted a live run and there is one.
 */
export async function createSizingRun(connectionId: string, kind: "setup" | "delta" = "setup"): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .insert({ connection_id: connectionId, kind, status: "pending", stage: "scan" })
    .select("*")
    .maybeSingle();

  if (error) {
    // 23505 is unique_violation: the active-run index rejected this because one is already open.
    if (error.code === "23505") return getActiveSizingRun(connectionId);
    console.error("[db/sizing-runs createSizingRun]", error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

export async function getActiveSizingRun(connectionId: string): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .select("*")
    .eq("connection_id", connectionId)
    .in("status", LIVE_STATUSES)
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs getActiveSizingRun]", error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

/** The run the UI reports on: the live one if there is one, otherwise the most recent finished run
 *  so a merchant returning to a completed pipeline sees its result rather than an empty pipeline. */
export async function getLatestSizingRun(connectionId: string): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .select("*")
    .eq("connection_id", connectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs getLatestSizingRun]", error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

export interface SizingRunPatch {
  status?: SizingRunStatus;
  stage?: SizingRunStage;
  productsScanned?: number;
  /** Cleared by passing null, which every successful transition should do — a stale error left on a
   *  now-running row is indistinguishable from a fresh failure to anything reading the row. */
  error?: string | null;
  publishedAt?: string | null;
}

export async function updateSizingRun(runId: string, patch: SizingRunPatch): Promise<SizingRunRow | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.productsScanned !== undefined) update.products_scanned = patch.productsScanned;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;

  const { data, error } = await db.from("sizing_runs").update(update).eq("id", runId).select("*").maybeSingle();

  if (error) {
    console.error("[db/sizing-runs updateSizingRun]", runId, error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

/**
 * Claims a pending run for this worker.
 *
 * The status guard in the `WHERE` clause is the claim: two workers ticking at once both try the same
 * transition and exactly one updates a row, so the loser sees no row back and skips the run instead
 * of walking the same catalog a second time.
 */
export async function claimSizingRun(runId: string): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .update({ status: "running", error: null, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs claimSizingRun]", runId, error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

/**
 * Everything a worker tick needs to act on, in one query.
 *
 * `pending` and `running` are read together rather than as two queries because this runs on every
 * tick of a loop that is idle almost all the time — and an idle install should cost one cheap
 * indexed read, not two. Splitting them out is the caller's job.
 *
 * `stalled` are runs claiming to be `running` whose worker died (a dev-server restart, a serverless
 * teardown). They matter because the active-run unique index permits one live run per connection, so
 * an abandoned `running` row blocks that merchant from starting another until something clears it.
 */
export async function listActionableSizingRuns(
  stalledBefore: string
): Promise<{ pending: SizingRunRow[]; stalled: SizingRunRow[] }> {
  const { data, error } = await db
    .from("sizing_runs")
    .select("*")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[db/sizing-runs listActionableSizingRuns]", error);
    return { pending: [], stalled: [] };
  }

  const rows = ((data as Array<Record<string, unknown>>) ?? []).map(rowToRun);

  return {
    pending: rows.filter((run) => run.status === "pending"),
    stalled: rows.filter((run) => run.status === "running" && run.updatedAt < stalledBefore),
  };
}

/**
 * Unblocks the live run's current stage so the worker picks it up on its next tick — what a
 * merchant clicking "Continue" past a `blocked` stage (classify -> research being the first one)
 * actually does server-side.
 *
 * Guarded on `status = 'blocked'` for the same reason `claimSizingRun` guards on `pending`: two
 * double-fired clicks should not both be reported as having (re)started the same paid work.
 */
export async function resumeBlockedRun(connectionId: string): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .update({ status: "pending", error: null, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("status", "blocked")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs resumeBlockedRun]", connectionId, error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

/**
 * Sends the live run back to a stage it has already passed, queued to run again.
 *
 * The pipeline had no way to go backwards at all: `POST /sizing/run` 409s while a run is live, and
 * `continue` only moves `blocked` to `pending` at the same stage. So a run parked after a research
 * pass that produced bad charts was simply stuck there — every fix to extraction was untestable
 * without deleting the run by hand in SQL, which is not something a merchant can do at all.
 *
 * Accepts any live status rather than only `blocked`, because the states worth rewinding from
 * include `failed`-adjacent ones. It deliberately does not touch a `complete` run: re-running
 * research on a published catalog is a delta run, which is its own thing.
 */
export async function rewindRun(connectionId: string, stage: SizingRunStage): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .update({ stage, status: "pending", error: null, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .in("status", LIVE_STATUSES)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs rewindRun]", connectionId, stage, error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

export async function failSizingRun(runId: string, message: string): Promise<void> {
  // Truncated because this is surfaced verbatim in the merchant-facing pipeline, and a platform
  // error can carry a whole HTML error page as its message.
  await updateSizingRun(runId, { status: "failed", error: message.slice(0, 500) });
}
