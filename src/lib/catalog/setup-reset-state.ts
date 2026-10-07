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
  /** ACS documents removed so far. */
  deleted: number;
  error: string | null;
}

export const IDLE_SETUP_RESET: SetupResetState = {
  status: "idle",
  scope: null,
  startedAt: null,
  finishedAt: null,
  deleted: 0,
  error: null,
};

/**
 * A cleanup still marked running after this long was cut off, by a deploy or a crash, since the
 * slowest real walk of the shared catalog takes a few minutes. It is then offered as failed, so the
 * merchant can retry instead of waiting on a job that no longer exists.
 */
export const SETUP_RESET_STALE_MS = 30 * 60_000;

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
    error: typeof row.setup_reset_error === "string" ? row.setup_reset_error : null,
  };
}

/** The state as the screen should treat it: a cleanup cut off long ago reads as failed. */
export function effectiveSetupResetState(state: SetupResetState, now = Date.now()): SetupResetState {
  if (state.status !== "running" || !state.startedAt) return state;
  if (now - Date.parse(state.startedAt) < SETUP_RESET_STALE_MS) return state;
  return { ...state, status: "failed", error: state.error ?? "The cleanup was interrupted before it finished." };
}

/** Whether old products are still being removed, so nothing may write a new catalog yet. */
export function setupResetRunning(state: SetupResetState, now = Date.now()): boolean {
  return effectiveSetupResetState(state, now).status === "running";
}
