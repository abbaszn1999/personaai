import { describe, expect, it } from "vitest";
import { isScanIncomplete, stageForRun } from "./server-types";
import type { SizingRun, SizingRunStage, SizingRunStatus } from "./server-types";

function run(stage: SizingRunStage, status: SizingRunStatus): SizingRun {
  return {
    id: "run-1",
    connectionId: "conn-1",
    kind: "setup",
    status,
    stage,
    productsScanned: 5461,
    phase: null,
    phaseDone: null,
    phaseTotal: null,
    researchBrandKeys: [],
    researchCurrentBrandKey: null,
    researchForce: false,
    error: null,
    publishedAt: null,
    createdAt: "2026-09-10T12:52:24Z",
    updatedAt: "2026-09-10T13:02:28Z",
  };
}

describe("stageForRun", () => {
  it("starts at the beginning when no run has ever been made", () => {
    expect(stageForRun(null)).toBe(1);
  });

  it("watches a scan in flight on stage 3, which owns the progress screen", () => {
    expect(stageForRun(run("scan", "running"))).toBe(3);
    expect(stageForRun(run("classify", "running"))).toBe(3);
    // The same condition stage 3 uses to swap its table for that screen.
    expect(isScanIncomplete(run("scan", "running"))).toBe(true);
  });

  it("lands a run parked after classification on stage 4, not stage 3", () => {
    // This inverts the old rule, and the inversion is the point. `research`/`blocked` used to mean "the
    // merchant has not yet authorised a bulk search", and the authorisation was the Continue press on
    // stage 3 — so a parked run was sent back there. Stage 4 now owns that decision per brand, which
    // makes `research`/`blocked` the idle state of the brand queue rather than a pending decision one
    // screen earlier.
    expect(stageForRun(run("research", "blocked"))).toBe(4);
  });

  it("stays on stage 4 for every other research state", () => {
    expect(stageForRun(run("research", "pending"))).toBe(4);
    expect(stageForRun(run("research", "running"))).toBe(4);
    expect(stageForRun(run("research", "failed"))).toBe(4);
  });

  it("fills gaps on stage 4 too, since Part 4 made that a modal rather than a step", () => {
    expect(stageForRun(run("gap_fill", "blocked"))).toBe(4);
  });

  it("returns a merchant mid-assignment to stage 5 rather than to the research they finished", () => {
    expect(stageForRun(run("assign", "blocked"))).toBe(5);
  });

  it("lands a finished run on the overview", () => {
    expect(stageForRun(run("resolve", "running"))).toBe(6);
    expect(stageForRun(run("publish", "complete"))).toBe(6);
  });
});
