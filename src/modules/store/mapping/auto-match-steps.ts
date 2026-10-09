import type { AutoMatchJobState, AutoMatchPhase, AutoMatchResult } from "@/lib/catalog/auto-match-state";

export type AutoMatchStepState = "done" | "active" | "waiting" | "failed";

export interface AutoMatchStep {
  label: string;
  state: AutoMatchStepState;
  detail?: string;
  /** 0 to 100, for the step that reads product titles. */
  percent?: number;
}

const PHASES: AutoMatchPhase[] = ["sampling", "classifying", "saving"];

export function autoMatchResultSummary(result: AutoMatchResult | null): string {
  if (!result || result.mapped + result.excluded === 0) {
    return "The AI could not safely match these categories, so they stay unmapped for you to map by hand.";
  }
  const parts = [`${result.mapped} mapped`];
  if (result.excluded > 0) parts.push(`${result.excluded} excluded as non-clothing`);
  if (result.unmapped > 0) parts.push(`${result.unmapped} left for you to map`);
  return parts.join(", ");
}

/**
 * The three steps of an AI match as the server reports them: reading product titles, the one AI
 * call, and saving. A failed run marks the step it stopped on.
 */
export function autoMatchSteps(job: AutoMatchJobState): AutoMatchStep[] {
  const { status, sampled, total } = job;
  const current = status === "done" ? PHASES.length : Math.max(0, PHASES.indexOf(job.phase ?? "sampling"));
  const stateOf = (index: number): AutoMatchStepState => {
    if (index < current) return "done";
    if (index > current) return "waiting";
    return status === "failed" ? "failed" : "active";
  };
  const failedDetail = job.error ?? "AI matching stopped.";

  const reading = stateOf(0);
  const classifying = stateOf(1);
  const saving = stateOf(2);
  const categories = `${total} ${total === 1 ? "category" : "categories"}`;

  return [
    {
      label: "Reading product titles from your store",
      state: reading,
      detail:
        reading === "failed"
          ? failedDetail
          : reading === "done"
            ? `Titles read for ${categories}`
            : `${Math.min(sampled, total)} of ${categories}`,
      percent: total > 0 ? Math.min(100, Math.round((sampled / total) * 100)) : 0,
    },
    {
      label: "AI matching each category to one of your Persona paths",
      state: classifying,
      detail:
        classifying === "failed"
          ? failedDetail
          : classifying === "active"
            ? `One AI request for all ${categories}. This usually takes one to three minutes.`
            : undefined,
    },
    {
      label: "Saving the matches",
      state: saving,
      detail: saving === "failed" ? failedDetail : saving === "done" ? autoMatchResultSummary(job.result) : undefined,
    },
  ];
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
