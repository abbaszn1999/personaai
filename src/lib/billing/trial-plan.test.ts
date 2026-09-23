import { describe, expect, it } from "vitest";
import { pickCurrentSubscription } from "./current-subscription";
import { subscriptionCheckoutBlock } from "./plan-checkout";
import {
  shouldBillRemainingOnDelete,
  shouldStopTrialRenewal,
  trialCarryoverAmount,
  trialPeriodOpen,
  trialWasPaid,
} from "./trial-carryover";
import type { PlanTierId } from "@/modules/billing/types";

function row(status: string, tierId: PlanTierId, updatedAt: string) {
  return { status, tierId, updatedAt };
}

describe("pickCurrentSubscription", () => {
  it("keeps a live Main plan ahead of a Trial row that was updated later", () => {
    const picked = pickCurrentSubscription([
      row("canceled", "trial", "2026-09-23T12:00:00.000Z"),
      row("active", "main", "2026-09-23T11:00:00.000Z"),
    ]);
    expect(picked?.tierId).toBe("main");
    expect(picked?.status).toBe("active");
  });

  it("keeps a paid Trial current while the Main payment is still incomplete", () => {
    const picked = pickCurrentSubscription([
      row("active", "trial", "2026-09-23T10:00:00.000Z"),
      row("incomplete", "main", "2026-09-23T11:00:00.000Z"),
    ]);
    expect(picked?.tierId).toBe("trial");
  });

  it("prefers Main when both plans are live during an upgrade", () => {
    const picked = pickCurrentSubscription([
      row("active", "trial", "2026-09-23T12:00:00.000Z"),
      row("active", "main", "2026-09-23T11:00:00.000Z"),
    ]);
    expect(picked?.tierId).toBe("main");
  });
});

describe("subscriptionCheckoutBlock", () => {
  it("refuses a second Trial", () => {
    expect(
      subscriptionCheckoutBlock({
        purchaseKey: "plan_trial",
        trialUsed: true,
        hasLiveSubscription: false,
        hasLiveMain: false,
      })
    ).toBe("Trial has already been used on this account.");
  });

  it("allows Main while Trial is still live", () => {
    expect(
      subscriptionCheckoutBlock({
        purchaseKey: "plan_main",
        trialUsed: true,
        hasLiveSubscription: true,
        hasLiveMain: false,
      })
    ).toBeNull();
  });

  it("refuses a second Main subscription", () => {
    expect(
      subscriptionCheckoutBlock({
        purchaseKey: "plan_main",
        trialUsed: true,
        hasLiveSubscription: true,
        hasLiveMain: true,
      })
    ).toBe("An active or pending subscription already exists");
  });
});

describe("trialCarryoverAmount", () => {
  it("returns the unused include", () => {
    expect(trialCarryoverAmount(50_000, 12_000)).toBe(38_000);
  });

  it("returns nothing when the include is used up or exceeded", () => {
    expect(trialCarryoverAmount(50_000, 50_000)).toBe(0);
    expect(trialCarryoverAmount(50_000, 60_000)).toBe(0);
    expect(trialCarryoverAmount(0, 0)).toBe(0);
  });
});

describe("trial webhook decisions", () => {
  it("stops a live Trial from renewing", () => {
    expect(shouldStopTrialRenewal({ tierId: "trial", status: "active", cancelAtPeriodEnd: false })).toBe(true);
    expect(shouldStopTrialRenewal({ tierId: "trial", status: "active", cancelAtPeriodEnd: true })).toBe(false);
    expect(shouldStopTrialRenewal({ tierId: "main", status: "active", cancelAtPeriodEnd: false })).toBe(false);
    expect(shouldStopTrialRenewal({ tierId: "trial", status: "canceled", cancelAtPeriodEnd: false })).toBe(false);
  });

  it("does not bill remaining GMV when Trial is deleted", () => {
    expect(shouldBillRemainingOnDelete("trial")).toBe(false);
    expect(shouldBillRemainingOnDelete(null)).toBe(false);
    expect(shouldBillRemainingOnDelete("main")).toBe(true);
  });

  it("carries only from a Trial that was paid", () => {
    expect(trialWasPaid("active")).toBe(true);
    expect(trialWasPaid("incomplete")).toBe(false);
    expect(trialWasPaid("past_due")).toBe(false);
  });

  it("carries only while the Trial period is still open", () => {
    expect(trialPeriodOpen("2026-09-30T00:00:00.000Z", Date.parse("2026-09-23T00:00:00.000Z"))).toBe(true);
    expect(trialPeriodOpen("2026-09-23T00:00:00.000Z", Date.parse("2026-09-23T00:00:00.000Z"))).toBe(false);
  });
});
