/** The word the merchant types to confirm. A click alone is too easy for something this destructive. */
export const SETUP_RESET_CONFIRM_WORD = "RESET";

/** Which "Start from scratch" was pressed: Setup keeps the mapping, Mapping clears it too. */
export type SetupResetScope = "setup" | "mapping";

export type SetupResetStatus = "idle" | "running" | "done" | "failed";

/** Where the background ACS cleanup of the last "Start from scratch" stands. */
export interface SetupResetState {
  status: SetupResetStatus;
  scope: SetupResetScope | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** ACS documents removed so far, across every pass. */
  deleted: number;
  /** The store's documents in ACS when the cleanup began; unknown until the first pass has listed them. */
  total: number | null;
  /**
   * Until when the pass now removing documents holds the cleanup. A pass extends it as it works and
   * releases it, by setting it to the moment it stopped, when it ends, so it also dates the last
   * sign of life.
   */
  leaseUntil: string | null;
  error: string | null;
}

export const IDLE_SETUP_RESET: SetupResetState = {
  status: "idle",
  scope: null,
  startedAt: null,
  finishedAt: null,
  deleted: 0,
  total: null,
  leaseUntil: null,
  error: null,
};

/**
 * A running cleanup with no pass at work for this long was abandoned: the schedule that carries it
 * from one pass to the next fires every minute. It is then offered as failed, so the merchant can
 * retry instead of waiting on a job that no longer exists.
 */
export const SETUP_RESET_STALE_MS = 10 * 60_000;

export function isSetupResetScope(value: unknown): value is SetupResetScope {
  return value === "setup" || value === "mapping";
}

export function parseSetupResetState(row: Record<string, unknown>): SetupResetState {
  const status = row.setup_reset_status;
  return {
    status: status === "running" || status === "done" || status === "failed" ? status : "idle",
    scope: isSetupResetScope(row.setup_reset_scope) ? row.setup_reset_scope : null,
    startedAt: typeof row.setup_reset_started_at === "string" ? row.setup_reset_started_at : null,
    finishedAt: typeof row.setup_reset_finished_at === "string" ? row.setup_reset_finished_at : null,
    deleted: typeof row.setup_reset_deleted === "number" ? row.setup_reset_deleted : 0,
    total: typeof row.setup_reset_total === "number" ? row.setup_reset_total : null,
    leaseUntil: typeof row.setup_reset_lease_until === "string" ? row.setup_reset_lease_until : null,
    error: typeof row.setup_reset_error === "string" ? row.setup_reset_error : null,
  };
}

/** The state as the screen should treat it: a cleanup nothing has worked on for long reads as failed. */
export function effectiveSetupResetState(state: SetupResetState, now = Date.now()): SetupResetState {
  const lastActive = state.leaseUntil ?? state.startedAt;
  if (state.status !== "running" || !lastActive) return state;
  if (now - Date.parse(lastActive) < SETUP_RESET_STALE_MS) return state;
  return { ...state, status: "failed", error: state.error ?? "The cleanup was interrupted before it finished." };
}

/** Whether old products are still being removed, so nothing may write a new catalog yet. */
export function setupResetRunning(state: SetupResetState, now = Date.now()): boolean {
  return effectiveSetupResetState(state, now).status === "running";
}

/**
 * Whether the last Start from scratch has not finished: still removing, or stopped with old products
 * or setup rows left behind. Setup and Mapping stay closed, and refuse changes, until it is done.
 */
export function setupResetPending(state: SetupResetState | undefined, now = Date.now()): boolean {
  if (!state) return false;
  const status = effectiveSetupResetState(state, now).status;
  return status === "running" || status === "failed";
}
