import type { SetupResetState } from "@/lib/catalog/setup-reset-state";

/** ACS's observed delete rate, for the time-left estimate only. */
const REMOVED_PER_MINUTE = 1_200;

export type ResetStepState = "done" | "active" | "waiting" | "failed";

export interface ResetStep {
  label: string;
  state: ResetStepState;
  detail?: string;
  /** 0 to 100, for the step that removes products. */
  percent?: number;
}

/**
 * The three steps of a Start from scratch as the server reports them. The setup data is cleared
 * before the request returns, so the first step is always done; the last is the check that ACS and
 * the setup tables hold nothing of this store, and the server reports "done" only after it.
 */
export function resetSteps(reset: SetupResetState): ResetStep[] {
  const { status, deleted, total } = reset;
  const listed = total !== null;
  const allRemoved = listed && deleted >= total;

  const cleared: ResetStep = {
    label:
      reset.scope === "mapping"
        ? "Category mapping and all five Setup stages cleared"
        : "All five Setup stages cleared; your category mapping is kept",
    state: "done",
  };

  let removing: ResetStep;
  if (status === "done" || allRemoved) {
    removing = {
      label: "Old products removed from ACS",
      state: "done",
      detail: total ? `${deleted.toLocaleString()} removed` : "This store had no products in ACS",
    };
  } else if (!listed) {
    removing = {
      label: "Finding this store's products in ACS",
      state: status === "failed" ? "failed" : "active",
      detail: status === "failed" ? (reset.error ?? undefined) : undefined,
    };
  } else {
    const minutesLeft = Math.ceil((total - deleted) / REMOVED_PER_MINUTE);
    removing = {
      label: "Removing this store's old products from ACS",
      state: status === "failed" ? "failed" : "active",
      detail:
        status === "failed"
          ? `${reset.error ?? "The cleanup stopped."} ${deleted.toLocaleString()} of ${total.toLocaleString()} were removed.`
          : `${deleted.toLocaleString()} of ${total.toLocaleString()} removed${minutesLeft > 1 ? `, about ${minutesLeft} minutes left` : ""}`,
      percent: total > 0 ? Math.min(100, Math.round((deleted / total) * 100)) : 0,
    };
  }

  const removingDone = removing.state === "done";
  const verifying: ResetStep = {
    label: "Final check that nothing of this store is left",
    state: status === "done" ? "done" : !removingDone ? "waiting" : status === "failed" ? "failed" : "active",
    detail:
      status === "done"
        ? "ACS and the setup data hold nothing of this store"
        : status === "failed" && removingDone
          ? (reset.error ?? undefined)
          : undefined,
  };

  return [cleared, removing, verifying];
}
