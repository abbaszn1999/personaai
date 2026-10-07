import { describe, expect, it } from "vitest";
import {
  effectiveSetupResetState,
  IDLE_SETUP_RESET,
  parseSetupResetState,
  SETUP_RESET_STALE_MS,
  setupResetRunning,
} from "./setup-reset-state";

describe("setup reset state", () => {
  it("reads the stored columns, and defaults to idle when they are missing", () => {
    expect(parseSetupResetState({})).toEqual(IDLE_SETUP_RESET);
    expect(
      parseSetupResetState({
        setup_reset_status: "running",
        setup_reset_scope: "mapping",
        setup_reset_started_at: "2026-10-07T20:00:00.000Z",
        setup_reset_deleted: 400,
      }),
    ).toMatchObject({ status: "running", scope: "mapping", deleted: 400 });
    expect(parseSetupResetState({ setup_reset_status: "weird", setup_reset_scope: "all" })).toMatchObject({
      status: "idle",
      scope: null,
    });
  });

  it("treats a cleanup as running only until it is old enough to have been cut off", () => {
    const startedAt = "2026-10-07T20:00:00.000Z";
    const running = { ...IDLE_SETUP_RESET, status: "running" as const, startedAt };
    const start = Date.parse(startedAt);

    expect(setupResetRunning(running, start + 60_000)).toBe(true);
    expect(setupResetRunning(running, start + SETUP_RESET_STALE_MS + 1)).toBe(false);
    expect(effectiveSetupResetState(running, start + SETUP_RESET_STALE_MS + 1)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("interrupted"),
    });
  });

  it("never blocks anything once the cleanup has finished or failed", () => {
    expect(setupResetRunning({ ...IDLE_SETUP_RESET, status: "done" })).toBe(false);
    expect(setupResetRunning({ ...IDLE_SETUP_RESET, status: "failed" })).toBe(false);
  });
});
