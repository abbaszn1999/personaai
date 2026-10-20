import { describe, expect, it } from "vitest";
import {
  signLiveGrant,
  signUsageReport,
  verifyLiveGrant,
  verifyUsageReport,
} from "../../../scripts/live-grant.mjs";

const SECRET = "test-secret-0123456789";
const now = Date.now();
const payload = {
  ownerId: "11111111-2222-3333-4444-555555555555",
  source: "store" as const,
  sessionId: "shopper-session",
  grantId: "grant-0001",
  maxSeconds: 90,
  exp: Math.floor(now / 1000) + 600,
};

describe("live grants", () => {
  it("round-trips a signed grant", () => {
    const grant = signLiveGrant(payload, SECRET);
    expect(verifyLiveGrant(grant, SECRET, { now })).toEqual({ v: 1, ...payload });
  });

  it("has two parts so the Decart SDK never treats it as a JWT", () => {
    expect(signLiveGrant(payload, SECRET).split(".")).toHaveLength(2);
  });

  it("rejects a tampered payload, a wrong secret and a missing secret", () => {
    const grant = signLiveGrant(payload, SECRET);
    const [, signature] = grant.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ v: 1, ...payload, maxSeconds: 90, ownerId: "someone-else" })).toString(
      "base64url"
    );
    expect(verifyLiveGrant(`${forgedBody}.${signature}`, SECRET, { now })).toBeNull();
    expect(verifyLiveGrant(grant, "other-secret", { now })).toBeNull();
    expect(verifyLiveGrant(grant, undefined, { now })).toBeNull();
  });

  it("refuses an expired grant unless expiry is explicitly ignored (usage reports)", () => {
    const grant = signLiveGrant({ ...payload, exp: Math.floor(now / 1000) - 1 }, SECRET);
    expect(verifyLiveGrant(grant, SECRET, { now })).toBeNull();
    expect(verifyLiveGrant(grant, SECRET, { now, ignoreExpiry: true })?.ownerId).toBe(payload.ownerId);
  });

  it("refuses grants outside Decart's 10-90 second session window", () => {
    expect(verifyLiveGrant(signLiveGrant({ ...payload, maxSeconds: 9 }, SECRET), SECRET, { now })).toBeNull();
    expect(verifyLiveGrant(signLiveGrant({ ...payload, maxSeconds: 91 }, SECRET), SECRET, { now })).toBeNull();
  });

  it("refuses a Decart JWT and junk", () => {
    expect(verifyLiveGrant("eyJhbGciOi.eyJzdWIi.c2ln", SECRET, { now })).toBeNull();
    expect(verifyLiveGrant(42, SECRET, { now })).toBeNull();
  });

  it("signs usage report bodies", () => {
    const body = JSON.stringify({ seconds: 12 });
    const signature = signUsageReport(body, SECRET);
    expect(verifyUsageReport(body, signature, SECRET)).toBe(true);
    expect(verifyUsageReport(JSON.stringify({ seconds: 13 }), signature, SECRET)).toBe(false);
    expect(verifyUsageReport(body, null, SECRET)).toBe(false);
  });
});
