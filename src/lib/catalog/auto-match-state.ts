export type AutoMatchStatus = "idle" | "running" | "done" | "failed";

/** What a running AI match is doing: reading product titles, waiting on the AI, or saving. */
export type AutoMatchPhase = "sampling" | "classifying" | "saving";

export interface AutoMatchResult {
  mapped: number;
  excluded: number;
  unmapped: number;
  /** Categories the store returned no product titles for, which the AI could only judge by name. */
  withoutSamples: number;
}

/** Where the store's last AI match stands. The job runs on the server; the Mapping page follows it. */
export interface AutoMatchJobState {
  status: AutoMatchStatus;
  /** Identifies the run. A run whose id is no longer stored was replaced or cleared and must not write. */
  jobId: string | null;
  phase: AutoMatchPhase | null;
  startedAt: string | null;
  /** The running job's last sign of life. */
  heartbeatAt: string | null;
  finishedAt: string | null;
  /** Categories whose product titles have been read so far. */
  sampled: number;
  total: number;
  result: AutoMatchResult | null;
  error: string | null;
}

export const IDLE_AUTO_MATCH: AutoMatchJobState = {
  status: "idle",
  jobId: null,
  phase: null,
  startedAt: null,
  heartbeatAt: null,
  finishedAt: null,
  sampled: 0,
  total: 0,
  result: null,
  error: null,
};

/** The longest a run may take, start to saved. The job stops itself here and reports a failure. */
export const AUTO_MATCH_DEADLINE_MS = 10 * 60_000;
export const AUTO_MATCH_HEARTBEAT_MS = 10_000;
/** A running job silent this long died with its server (a deploy or restart) and is reported as failed. */
export const AUTO_MATCH_STALE_MS = 90_000;
/** How far past the deadline a run may still report running, so its own timeout can be written. */
export const AUTO_MATCH_DEADLINE_GRACE_MS = 60_000;

const STATUSES = new Set<AutoMatchStatus>(["idle", "running", "done", "failed"]);
const PHASES = new Set<AutoMatchPhase>(["sampling", "classifying", "saving"]);

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseResult(value: unknown): AutoMatchResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    mapped: count(raw.mapped),
    excluded: count(raw.excluded),
    unmapped: count(raw.unmapped),
    withoutSamples: count(raw.withoutSamples),
  };
}

export function parseAutoMatchJobState(row: Record<string, unknown>): AutoMatchJobState {
  const status = row.persona_auto_match_status;
  const phase = row.persona_auto_match_phase;
  return {
    status: STATUSES.has(status as AutoMatchStatus) ? (status as AutoMatchStatus) : "idle",
    jobId: text(row.persona_auto_match_job_id),
    phase: PHASES.has(phase as AutoMatchPhase) ? (phase as AutoMatchPhase) : null,
    startedAt: text(row.persona_auto_match_started_at),
    heartbeatAt: text(row.persona_auto_match_heartbeat_at),
    finishedAt: text(row.persona_auto_match_finished_at),
    sampled: count(row.persona_auto_match_sampled),
    total: count(row.persona_auto_match_total),
    result: parseResult(row.persona_auto_match_result),
    error: text(row.persona_auto_match_error),
  };
}

/**
 * The state as the screen should treat it. A run that stopped reporting, or outlived its deadline,
 * no longer exists on any server, so it reads as failed and the merchant can start another.
 */
export function effectiveAutoMatchState(state: AutoMatchJobState, now = Date.now()): AutoMatchJobState {
  if (state.status !== "running") return state;
  const startedAt = state.startedAt ? Date.parse(state.startedAt) : NaN;
  const lastSeen = state.heartbeatAt ? Date.parse(state.heartbeatAt) : startedAt;
  if (Number.isFinite(startedAt) && now - startedAt > AUTO_MATCH_DEADLINE_MS + AUTO_MATCH_DEADLINE_GRACE_MS) {
    return { ...state, status: "failed", error: state.error ?? "AI matching did not finish within 10 minutes." };
  }
  if (!Number.isFinite(lastSeen) || now - lastSeen > AUTO_MATCH_STALE_MS) {
    return {
      ...state,
      status: "failed",
      error: state.error ?? "AI matching was interrupted because the server restarted. Run it again.",
    };
  }
  return state;
}

export function autoMatchRunning(state: AutoMatchJobState | undefined, now = Date.now()): boolean {
  return state !== undefined && effectiveAutoMatchState(state, now).status === "running";
}
