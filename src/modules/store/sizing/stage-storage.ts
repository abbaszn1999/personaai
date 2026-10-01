import { LAST_STAGE, type StageNumber } from "./types";

const PREFIX = "persona:sizing-setup-stage:";

export function readStoredSizingStage(connectionId: string): StageNumber | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(`${PREFIX}${connectionId}`));
  return Number.isInteger(value) && value >= 1 && value <= LAST_STAGE
    ? value as StageNumber
    : null;
}

export function storeSizingStage(connectionId: string, stage: StageNumber): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${PREFIX}${connectionId}`, String(stage));
}
