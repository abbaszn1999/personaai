import { afterEach, describe, expect, it } from "vitest";
import {
  getPurchaseKeyForPriceId,
  STRIPE_CATALOG,
  STRIPE_CURRENCY,
} from "./config";

const originalPrice = process.env.STRIPE_PRICE_SESSION_UNITS;

afterEach(() => {
  if (originalPrice === undefined) delete process.env.STRIPE_PRICE_SESSION_UNITS;
  else process.env.STRIPE_PRICE_SESSION_UNITS = originalPrice;
});

describe("Stripe server catalog", () => {
  it("keeps trusted prices and grants aligned with the commercial catalog", () => {
    expect(STRIPE_CURRENCY).toBe("usd");
    expect(STRIPE_CATALOG.plan_trial.amountCents).toBe(45_000);
    expect(STRIPE_CATALOG.plan_trial.tierId).toBe("trial");
    expect(STRIPE_CATALOG.plan_main.amountCents).toBe(150_000);
    expect(STRIPE_CATALOG.plan_main.tierId).toBe("main");
    expect(STRIPE_CATALOG.garment_units.amountCents).toBe(80);
    expect(STRIPE_CATALOG.garment_units.creditsPerUnit).toBe(100);
    expect(STRIPE_CATALOG.session_units.amountCents).toBe(250);
    expect(STRIPE_CATALOG.session_units.unitsPerUnit).toBe(1_000);
    expect(STRIPE_CATALOG.live_minutes.amountCents).toBe(120);
    expect(STRIPE_CATALOG.live_minutes.secondsPerUnit).toBe(60);
  });

  it("maps webhook Price IDs only through configured server values", () => {
    process.env.STRIPE_PRICE_SESSION_UNITS = "price_sessions_test";
    expect(getPurchaseKeyForPriceId("price_sessions_test")).toBe("session_units");
    expect(getPurchaseKeyForPriceId("price_client_tampered")).toBeNull();
  });
});
