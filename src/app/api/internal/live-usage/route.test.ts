import { beforeEach, describe, expect, it, vi } from "vitest";
import { signLiveGrant, signUsageReport } from "../../../../../scripts/live-grant.mjs";

const record = vi.hoisted(() => vi.fn(async () => 120));
const billing = vi.hoisted(() =>
  vi.fn(async () => ({ cycleStartIso: "2026-10-01T00:00:00.000Z", tier: { monthlyLiveTryOnSeconds: 600 } }))
);
vi.mock("@/lib/db/realtime-tryon-events", () => ({ recordMeteredLiveSessionSeconds: record }));
vi.mock("@/lib/billing/account", () => ({ getAccountBillingContext: billing }));

import { POST } from "./route";

const SECRET = "usage-route-secret-0123456789";
const grant = signLiveGrant(
  {
    ownerId: "owner-1",
    source: "preview",
    sessionId: "dash-session",
    grantId: "grant-route-1",
    maxSeconds: 90,
    // Expired on purpose: a long session's final report arrives after its dial window.
    exp: Math.floor(Date.now() / 1000) - 60,
  },
  SECRET
);

function request(body: unknown, signWith: string | null = SECRET) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signWith) headers["x-live-proxy-signature"] = signUsageReport(raw, signWith);
  return new Request("http://app/api/internal/live-usage", { method: "POST", headers, body: raw });
}

describe("POST /api/internal/live-usage", () => {
  beforeEach(() => {
    record.mockClear();
    billing.mockClear();
    vi.stubEnv("LIVE_PROXY_SECRET", SECRET);
  });

  it("bills the grant's merchant for Decart's total, keyed per upstream session", async () => {
    const response = await POST(request({ grant, connectionId: "conn-123456", seconds: 37.9, final: true }));
    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledWith({
      ownerId: "owner-1",
      sessionId: "dash-session",
      idempotencyKey: "live:conn-123456",
      totalSeconds: 37,
      cycleStartIso: "2026-10-01T00:00:00.000Z",
      includedAllowanceSeconds: 600,
      source: "preview",
    });
  });

  it("rejects unsigned or wrongly signed reports", async () => {
    expect((await POST(request({ grant, connectionId: "conn-123456", seconds: 5 }, null))).status).toBe(401);
    expect((await POST(request({ grant, connectionId: "conn-123456", seconds: 5 }, "other"))).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects a grant the app didn't sign and nonsense seconds", async () => {
    const foreign = signLiveGrant(
      { ownerId: "x", source: "store", sessionId: "s", grantId: "grant-foreign", maxSeconds: 90, exp: 0 },
      "someone-elses-secret"
    );
    expect((await POST(request({ grant: foreign, connectionId: "conn-123456", seconds: 5 }))).status).toBe(400);
    expect((await POST(request({ grant, connectionId: "conn-123456", seconds: -1 }))).status).toBe(400);
    expect((await POST(request({ grant, connectionId: "conn-123456", seconds: 99_999 }))).status).toBe(400);
    expect((await POST(request({ grant, connectionId: "c", seconds: 5 }))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it("records nothing for a session that never generated", async () => {
    const response = await POST(request({ grant, connectionId: "conn-123456", seconds: 0 }));
    expect(response.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });
});
