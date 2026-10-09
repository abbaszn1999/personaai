import { describe, expect, it } from "vitest";
import {
  AUTO_MATCH_DEADLINE_MS,
  AUTO_MATCH_STALE_MS,
  IDLE_AUTO_MATCH,
  autoMatchRunning,
  effectiveAutoMatchState,
  parseAutoMatchJobState,
  type AutoMatchJobState,
} from "./auto-match-state";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");

function running(startedAgoMs: number, silentForMs: number): AutoMatchJobState {
  return {
    ...IDLE_AUTO_MATCH,
    status: "running",
    jobId: "job-1",
    phase: "sampling",
    startedAt: new Date(NOW - startedAgoMs).toISOString(),
    heartbeatAt: new Date(NOW - silentForMs).toISOString(),
    total: 10,
  };
}

describe("effectiveAutoMatchState", () => {
  it("keeps a run that reports in as running", () => {
    expect(effectiveAutoMatchState(running(60_000, 5_000), NOW).status).toBe("running");
    expect(autoMatchRunning(running(60_000, 5_000), NOW)).toBe(true);
  });

  it("reads a run whose server went silent as failed", () => {
    const state = effectiveAutoMatchState(running(120_000, AUTO_MATCH_STALE_MS + 1), NOW);

    expect(state.status).toBe("failed");
    expect(state.error).toContain("interrupted");
  });

  it("reads a run past its 10-minute deadline as failed even if it still reports in", () => {
    const state = effectiveAutoMatchState(running(AUTO_MATCH_DEADLINE_MS + 2 * 60_000, 1_000), NOW);

    expect(state.status).toBe("failed");
    expect(state.error).toContain("10 minutes");
  });

  it("leaves finished runs as they are", () => {
    const done = { ...IDLE_AUTO_MATCH, status: "done" as const };
    expect(effectiveAutoMatchState(done, NOW)).toBe(done);
    expect(autoMatchRunning(undefined, NOW)).toBe(false);
  });
});

describe("parseAutoMatchJobState", () => {
  it("reads the columns, and treats a database without them as no run", () => {
    expect(parseAutoMatchJobState({})).toEqual(IDLE_AUTO_MATCH);
    expect(
      parseAutoMatchJobState({
        persona_auto_match_status: "done",
        persona_auto_match_job_id: "job-1",
        persona_auto_match_phase: "bogus",
        persona_auto_match_sampled: 7,
        persona_auto_match_total: 9,
        persona_auto_match_result: { mapped: 5, excluded: 1, unmapped: 3, withoutSamples: "x" },
      }),
    ).toEqual(
      expect.objectContaining({
        status: "done",
        jobId: "job-1",
        phase: null,
        sampled: 7,
        total: 9,
        result: { mapped: 5, excluded: 1, unmapped: 3, withoutSamples: 0 },
      }),
    );
  });
});
