import { afterEach, describe, expect, it } from "vitest";
import {
  getPurchaseKeyForPriceId,
  STRIPE_CATALOG,
  STRIPE_CURRENCY,
} from "./config";

const originalPrice = process.env.STRIPE_PRICE_CREDITS_STARTER;

afterEach(() => {
  if (originalPrice === undefined) delete process.env.STRIPE_PRICE_CREDITS_STARTER;
  else process.env.STRIPE_PRICE_CREDITS_STARTER = originalPrice;
});

describe("Stripe server catalog", () => {
  it("keeps trusted prices and grants aligned with the commercial catalog", () => {
    expect(STRIPE_CURRENCY).toBe("usd");
    expect(STRIPE_CATALOG.wearable_fixed.amountCents).toBe(200_000);
    expect(STRIPE_CATALOG.unwearable_fixed.amountCents).toBe(150_000);
    expect(STRIPE_CATALOG.credits_starter.creditsPerUnit).toBe(500);
    expect(STRIPE_CATALOG.credits_growth.creditsPerUnit).toBe(1_500);
    expect(STRIPE_CATALOG.credits_scale.creditsPerUnit).toBe(3_300);
    expect(STRIPE_CATALOG.live_minutes.amountCents).toBe(120);
    expect(STRIPE_CATALOG.live_minutes.secondsPerUnit).toBe(60);
  });

  it("maps webhook Price IDs only through configured server values", () => {
    process.env.STRIPE_PRICE_CREDITS_STARTER = "price_starter_test";
    expect(getPurchaseKeyForPriceId("price_starter_test")).toBe("credits_starter");
    expect(getPurchaseKeyForPriceId("price_client_tampered")).toBeNull();
  });
});
