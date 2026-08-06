import { describe, expect, it } from "vitest";
import { resolveEntitlement } from "./entitlement";
import type { BillingSubscriptionRow } from "@/lib/db/billing";

function subscription(
  status: string,
  currentPeriodEnd = "2026-08-05T00:00:00.000Z"
): BillingSubscriptionRow {
  return {
    userId: "user-1",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    stripePriceId: "price_test",
    workspaceMode: "wearable",
    tierId: "fixed",
    status,
    currentPeriodStart: "2026-07-05T00:00:00.000Z",
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
  };
}

describe("resolveEntitlement", () => {
  it("always permits explicitly grandfathered test accounts", () => {
    expect(resolveEntitlement("legacy_test", null)).toEqual({
      status: "legacy_test",
      entitled: true,
    });
  });

  it("permits active and trialing Stripe subscriptions", () => {
    expect(resolveEntitlement("stripe", subscription("active")).entitled).toBe(true);
    expect(resolveEntitlement("stripe", subscription("trialing")).entitled).toBe(true);
  });

  it("applies the configured past-due grace period and then blocks access", () => {
    const withinGrace = resolveEntitlement(
      "stripe",
      subscription("past_due"),
      new Date("2026-08-07T00:00:00.000Z")
    );
    expect(withinGrace.status).toBe("past_due_grace");
    expect(withinGrace.entitled).toBe(true);

    const expired = resolveEntitlement(
      "stripe",
      subscription("past_due"),
      new Date("2026-08-09T00:00:00.000Z")
    );
    expect(expired.status).toBe("past_due");
    expect(expired.entitled).toBe(false);
  });

  it("blocks canceled or missing subscriptions", () => {
    expect(resolveEntitlement("stripe", subscription("canceled")).entitled).toBe(false);
    expect(resolveEntitlement("stripe", null).entitled).toBe(false);
  });
});
