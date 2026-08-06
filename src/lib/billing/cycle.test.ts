import { describe, expect, it } from "vitest";
import { getCurrentBillingCycle, resolveAccountBillingCycle } from "./cycle";

describe("getCurrentBillingCycle", () => {
  it("uses the account creation day and time as the monthly anchor", () => {
    const cycle = getCurrentBillingCycle(
      "2026-01-15T10:30:00.000Z",
      new Date("2026-08-04T12:00:00.000Z")
    );
    expect(cycle.start.toISOString()).toBe("2026-07-15T10:30:00.000Z");
    expect(cycle.end.toISOString()).toBe("2026-08-15T10:30:00.000Z");
  });

  it("clamps month-end anchors without drifting the following cycle", () => {
    const february = getCurrentBillingCycle(
      "2026-01-31T00:00:00.000Z",
      new Date("2026-02-28T12:00:00.000Z")
    );
    expect(february.start.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(february.end.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});

describe("resolveAccountBillingCycle", () => {
  it("uses Stripe's exact subscription period for Stripe accounts", () => {
    const cycle = resolveAccountBillingCycle({
      accountCreatedAtIso: "2026-01-15T10:30:00.000Z",
      accessMode: "stripe",
      stripePeriodStartIso: "2026-08-01T00:00:00.000Z",
      stripePeriodEndIso: "2026-09-01T00:00:00.000Z",
    });
    expect(cycle.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(cycle.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("keeps the anniversary cycle for temporary legacy accounts", () => {
    const cycle = resolveAccountBillingCycle({
      accountCreatedAtIso: "2026-01-15T10:30:00.000Z",
      accessMode: "legacy_test",
      stripePeriodStartIso: "2026-08-01T00:00:00.000Z",
      stripePeriodEndIso: "2026-09-01T00:00:00.000Z",
      now: new Date("2026-08-04T12:00:00.000Z"),
    });
    expect(cycle.start.toISOString()).toBe("2026-07-15T10:30:00.000Z");
  });
});
