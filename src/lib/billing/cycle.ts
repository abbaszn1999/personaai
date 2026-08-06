const MONTHS_PER_YEAR = 12;

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function anniversaryForMonth(anchor: Date, year: number, monthIndex: number): Date {
  const normalizedYear = year + Math.floor(monthIndex / MONTHS_PER_YEAR);
  const normalizedMonth = ((monthIndex % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(normalizedYear, normalizedMonth));
  return new Date(
    Date.UTC(
      normalizedYear,
      normalizedMonth,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

export interface BillingCycle {
  start: Date;
  end: Date;
}

/** Returns the rolling monthly cycle anchored to the account creation timestamp. */
export function getCurrentBillingCycle(createdAtIso: string, now = new Date()): BillingCycle {
  const anchor = new Date(createdAtIso);
  if (Number.isNaN(anchor.getTime())) throw new Error("Invalid account creation timestamp");

  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let start = anniversaryForMonth(anchor, year, month);

  if (start > now) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    start = anniversaryForMonth(anchor, year, month);
  }

  const end = anniversaryForMonth(anchor, year, month + 1);
  return { start, end };
}

export function getCurrentBillingCycleStart(createdAtIso: string, now = new Date()): Date {
  return getCurrentBillingCycle(createdAtIso, now).start;
}

export function resolveAccountBillingCycle(input: {
  accountCreatedAtIso: string;
  accessMode: "stripe" | "legacy_test";
  stripePeriodStartIso?: string | null;
  stripePeriodEndIso?: string | null;
  now?: Date;
}): BillingCycle {
  if (
    input.accessMode === "stripe" &&
    input.stripePeriodStartIso &&
    input.stripePeriodEndIso
  ) {
    const start = new Date(input.stripePeriodStartIso);
    const end = new Date(input.stripePeriodEndIso);
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start < end
    ) {
      return { start, end };
    }
  }
  return getCurrentBillingCycle(input.accountCreatedAtIso, input.now);
}
