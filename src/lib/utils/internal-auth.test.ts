import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { hashVisitorSignal, verifyHmacSignature } from "./internal-auth";
import { isWooWebhookPing } from "@/lib/attribution/woo-ping";

describe("verifyHmacSignature", () => {
  const body = '{"id":1}';
  const secret = "shop-secret";
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64");

  it("accepts the Shopify and WooCommerce base64 HMAC", () => {
    expect(verifyHmacSignature(body, signature, secret)).toBe(true);
  });

  it("rejects a different secret or a missing signature", () => {
    expect(verifyHmacSignature(body, signature, "other")).toBe(false);
    expect(verifyHmacSignature(body, null, secret)).toBe(false);
  });
});

describe("isWooWebhookPing", () => {
  it("recognizes the unsigned creation ping and ignores a real payload", () => {
    expect(isWooWebhookPing("webhook_id=12")).toBe(true);
    expect(isWooWebhookPing("webhook_id=12\n")).toBe(true);
    expect(isWooWebhookPing('{"id":1}')).toBe(false);
  });
});

describe("hashVisitorSignal", () => {
  const previous = process.env.INTERNAL_JOB_SECRET;

  afterEach(() => {
    process.env.INTERNAL_JOB_SECRET = previous;
  });

  it("is stable for the same device and different for another address", () => {
    process.env.INTERNAL_JOB_SECRET = "root-secret";
    const first = hashVisitorSignal("owner-1", "ip", "203.0.113.5");
    expect(hashVisitorSignal("owner-1", "ip", "203.0.113.5")).toBe(first);
    expect(hashVisitorSignal("owner-1", "ip", "203.0.113.6")).not.toBe(first);
    expect(first).not.toContain("203.0.113.5");
  });
});
