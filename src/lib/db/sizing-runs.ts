import { db } from "@/lib/supabase/server";

/**
 * Server-side state for one pass of the size-intelligence pipeline.
 *
 * Exists so the setup pipeline resumes from the server rather than from browser state. Before this,
 * "which stage am I on" lived only in a Zustand store, so a refresh mid-pipeline lost every stage's
 * progress — including work that had already been paid for. It is also the gate the final index
 * reads: a merchant cannot publish sizing attributes from a run that never finished.
 */

export const SIZING_RUN_STAGES = [
  "scan",
  "classify",
  "research",
  "gap_fill",
  /** Stage 5's own stage, so a refresh returns to Chart Assignment rather than to the research
   *  screen the merchant already finished with. */
  "assign",
  "resolve",
  "publish",
] as const;
export type SizingRunStage = (typeof SIZING_RUN_STAGES)[number];

/** `blocked` is distinct from `running` on purpose: it means the run is waiting on the merchant to
 *  fill a gap template, not on a job. That distinction is what lets the UI block "Continue"
 *  server-side instead of trusting an in-memory list of open gaps. */
export const SIZING_RUN_STATUSES = ["pending", "running", "blocked", "complete", "failed"] as const;
export type SizingRunStatus = (typeof SIZING_RUN_STATUSES)[number];

/**
 * What a stage is doing inside itself, and how far through it is.
 *
 * `scan` has two because it is two things: it walks the merchant's store and then aggregates the
 * mapped fields. `researching` is the third, and it exists so Stage 4's progress bar has a real
 * denominator. A scoped pass spans several worker ticks and the run's brand scope is *drained* as each
 * brand finishes, so the row alone cannot say how many the merchant asked for — by the time three of
 * five are done it says two. The size of the request is recorded here once, when it is made.
 *
 * Brand classification has no phase: it is one request over the complete distinct brand list.
 */
export const SIZING_RUN_PHASES = ["walking", "aggregating", "researching"] as const;
export type SizingRunPhase = (typeof SIZING_RUN_PHASES)[number];

export interface SizingRunRow {
  id: string;
  connectionId: string;
  kind: "setup" | "delta";
  status: SizingRunStatus;
  stage: SizingRunStage;
  productsScanned: number;
  /** Null between passes, and on any run written before phases existed. */
  phase: SizingRunPhase | null;
  /** Units done within the phase, null where the phase cannot count them. */
  phaseDone: number | null;
  /** Units the phase expects, null while unknown — the walk has no denominator until it ends. */
  phaseTotal: number | null;
  /**
   * The brands the research stage is authorised to search, drained as each one finishes.
   *
   * Empty means "do nothing", and that is the state a parked run sits in — research is no longer an
   * automatic bulk pass, so a worker that found the stage `pending` with no scope would be spending
   * the merchant's money on a request nobody made. Null and empty are treated the same by every
   * reader; null is only what a run written before this column existed reads back as.
   */
  researchBrandKeys: string[];
  /** The brand a tick is inside right now, so Stage 4 can name it. Null between brands. */
  researchCurrentBrandKey: string | null;
  /** Regenerate rather than Generate: re-search brands that already hold a chart above the
   *  confidence bar, instead of reusing what the shared registry already has. */
  researchForce: boolean;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toPhase(value: unknown): SizingRunPhase | null {
  return SIZING_RUN_PHASES.includes(value as SizingRunPhase) ? (value as SizingRunPhase) : null;
}

function rowToRun(row: Record<string, unknown>): SizingRunRow {
  return {
    id: row.id as string,
    connectionId: row.connection_id as string,
    kind: (row.kind as "setup" | "delta") ?? "setup",
    status: row.status as SizingRunStatus,
    stage: row.stage as SizingRunStage,
    productsScanned: (row.products_scanned as number) ?? 0,
    phase: toPhase(row.phase),
    phaseDone: (row.phase_done as number | null) ?? null,
    phaseTotal: (row.phase_total as number | null) ?? null,
    researchBrandKeys: Array.isArray(row.research_brand_keys)
      ? (row.research_brand_keys as unknown[]).filter((key): key is string => typeof key === "string")
      : [],
    researchCurrentBrandKey: (row.research_current_brand_key as string | null) ?? null,
    researchForce: row.research_force === true,
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
  /** Null on leaving the scan stage, for the same reason `error` is cleared: a phase left behind
   *  describes work that is no longer happening. */
  phase?: SizingRunPhase | null;
  phaseDone?: number | null;
  phaseTotal?: number | null;
  /** Pass `[]` to revoke the authorisation entirely, which is what parking after a scoped pass does.
   *  Omitting it leaves the stored scope alone. */
  researchBrandKeys?: string[];
  researchCurrentBrandKey?: string | null;
  researchForce?: boolean;
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
  if (patch.phase !== undefined) update.phase = patch.phase;
  if (patch.phaseDone !== undefined) update.phase_done = patch.phaseDone;
  if (patch.phaseTotal !== undefined) update.phase_total = patch.phaseTotal;
  if (patch.researchBrandKeys !== undefined) update.research_brand_keys = patch.researchBrandKeys;
  if (patch.researchCurrentBrandKey !== undefined) {
    update.research_current_brand_key = patch.researchCurrentBrandKey;
  }
  if (patch.researchForce !== undefined) update.research_force = patch.researchForce;
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
 * Moves a parked run forward to the next stage the merchant has reached — what "Continue" does
 * server-side.
 *
 * Advances the stage rather than unblocking the current one, which is what this used to do. That
 * older behaviour was written when leaving Stage 3 was also the authorisation to spend on research:
 * one press meant both "I have seen the brands" and "start searching". Stage 4 now owns the second
 * half of that (see `queueScopedResearch`), so a Continue press must not start anything — it only
 * records that the merchant is done with the screen behind them.
 *
 * `from` is checked rather than assumed so a double-fired click cannot walk two stages, and so a run
 * parked somewhere else is left exactly where it is instead of being dragged into `to`.
 */
export async function advanceBlockedRun(
  connectionId: string,
  from: readonly SizingRunStage[],
  to: SizingRunStage
): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .update({ stage: to, status: "blocked", error: null, updated_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .eq("status", "blocked")
    .in("stage", from as SizingRunStage[])
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs advanceBlockedRun]", connectionId, to, error);
    return null;
  }

  return data ? rowToRun(data) : null;
}

/**
 * Authorises research for an explicit list of brands and queues the worker to do it.
 *
 * The one way research ever starts. Before this, finishing classification left the run
 * `research`/`pending` and the worker searched every global brand it could find — so a merchant who
 * simply walked forward through the pipeline paid for a bulk pass they never asked for, and had no
 * way to try a single brand first.
 *
 * The scope is written to the row rather than held by the request, because a pass is bounded per
 * tick: a store with twenty brands comes back through the worker many times, and a scope living in
 * the request that started it would be gone by the second tick.
 */
export async function queueScopedResearch(
  connectionId: string,
  brandKeys: readonly string[],
  options: { force?: boolean } = {}
): Promise<SizingRunRow | null> {
  const { data, error } = await db
    .from("sizing_runs")
    .update({
      stage: "research",
      status: "pending",
      error: null,
      research_brand_keys: [...new Set(brandKeys)],
      research_force: options.force === true,
      research_current_brand_key: null,
      // Recorded here because this is the only moment the size of the request is known: the scope
      // below is drained brand by brand, so nothing downstream can reconstruct what was asked for.
      phase: "researching",
      phase_done: 0,
      phase_total: new Set(brandKeys).size,
      updated_at: new Date().toISOString(),
    })
    .eq("connection_id", connectionId)
    .in("status", LIVE_STATUSES)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[db/sizing-runs queueScopedResearch]", connectionId, error);
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
