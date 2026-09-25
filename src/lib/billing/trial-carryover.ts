/** Unused included units from a Trial period. Usage past the allowance carries nothing. */
export function trialCarryoverAmount(allowance: number, used: number): number {
  if (!Number.isFinite(allowance) || !Number.isFinite(used)) return 0;
  const remaining = Math.floor(allowance) - Math.floor(used);
  return remaining > 0 ? remaining : 0;
}

/** Only a Trial that was actually paid for has units to move. An admin-comped Trial never does. */
export function trialWasPaid(status: string, comped = false): boolean {
  if (comped) return false;
  return status === "active" || status === "trialing";
}

/** True while the Trial period has not ended. A missing end is treated as still open. */
export function trialPeriodOpen(periodEndIso: string | null, now = Date.now()): boolean {
  if (!periodEndIso) return true;
  const end = Date.parse(periodEndIso);
  return Number.isFinite(end) && end > now;
}

/** Trial is a one-month Stripe price. Stop it from renewing, including a portal "renew". */
export function shouldStopTrialRenewal(input: {
  tierId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
}): boolean {
  const live = input.status === "active" || input.status === "trialing" || input.status === "past_due";
  return input.tierId === "trial" && live && !input.cancelAtPeriodEnd;
}

/** The closing commission invoice belongs to Main. Canceling Trial must not send one. */
export function shouldBillRemainingOnDelete(tierId: string | null): boolean {
  return tierId === "main";
}
