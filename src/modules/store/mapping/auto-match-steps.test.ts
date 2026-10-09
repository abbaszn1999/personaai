import { describe, expect, it } from "vitest";
import { IDLE_AUTO_MATCH, type AutoMatchJobState } from "@/lib/catalog/auto-match-state";
import { autoMatchResultSummary, autoMatchSteps, formatElapsed } from "./auto-match-steps";

function job(overrides: Partial<AutoMatchJobState>): AutoMatchJobState {
  return { ...IDLE_AUTO_MATCH, status: "running", jobId: "job-1", phase: "sampling", total: 376, ...overrides };
}

describe("autoMatchSteps", () => {
  it("shows title reading with its progress while the store is read", () => {
    const [reading, classifying, saving] = autoMatchSteps(job({ sampled: 94 }));

    expect(reading).toEqual(expect.objectContaining({ state: "active", detail: "94 of 376 categories", percent: 25 }));
    expect(classifying.state).toBe("waiting");
    expect(saving.state).toBe("waiting");
  });

  it("moves to the AI step once every title is read", () => {
    const [reading, classifying] = autoMatchSteps(job({ phase: "classifying", sampled: 376 }));

    expect(reading.state).toBe("done");
    expect(classifying).toEqual(expect.objectContaining({ state: "active", detail: expect.stringContaining("376 categories") }));
  });

  it("marks every step done with the result when the run finished", () => {
    const steps = autoMatchSteps(
      job({ status: "done", phase: null, sampled: 376, result: { mapped: 300, excluded: 6, unmapped: 70, withoutSamples: 0 } }),
    );

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done"]);
    expect(steps[2].detail).toBe("300 mapped, 6 excluded as non-clothing, 70 left for you to map");
  });

  it("marks the step a failed run stopped on, and only that one", () => {
    const steps = autoMatchSteps(job({ status: "failed", phase: "classifying", error: "Credits are depleted." }));

    expect(steps.map((step) => step.state)).toEqual(["done", "failed", "waiting"]);
    expect(steps[1].detail).toBe("Credits are depleted.");
  });
});

describe("autoMatchResultSummary", () => {
  it("says plainly when the AI matched nothing", () => {
    expect(autoMatchResultSummary({ mapped: 0, excluded: 0, unmapped: 4, withoutSamples: 0 })).toContain("could not safely match");
  });
});

describe("formatElapsed", () => {
  it("formats minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_400)).toBe("1:05");
    expect(formatElapsed(600_000)).toBe("10:00");
  });
});
