import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn(async () => ({ apiKey: "ek_direct", expiresAt: "later" })));
vi.mock("@decartai/sdk", () => ({ createDecartClient: () => ({ tokens: { create } }) }));

import { verifyLiveGrant } from "../../../scripts/live-grant.mjs";
import { DecartApiError } from "@/lib/ai/decart";
import { isLiveMeteringEnabled, issueLiveAccess } from "./live-access";

const SECRET = "access-secret-0123456789";
const base = { ownerId: "owner-1", source: "store" as const, sessionId: "shopper-1" };

describe("issueLiveAccess", () => {
  beforeEach(() => {
    create.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("DECART_API_KEY", "dct_test");
  });

  it("hands out a Decart token when metering isn't configured", async () => {
    const access = await issueLiveAccess({ ...base, remainingSeconds: 500 });
    expect(isLiveMeteringEnabled()).toBe(false);
    expect(access).toMatchObject({ apiKey: "ek_direct", metered: false });
    expect(create).toHaveBeenCalledOnce();
  });

  it("never hands out a Decart token once metering is on", async () => {
    vi.stubEnv("DECART_REALTIME_PROXY_URL", "wss://proxy.example.com");
    vi.stubEnv("LIVE_PROXY_SECRET", SECRET);
    const access = await issueLiveAccess({ ...base, remainingSeconds: 500 });
    expect(access.metered).toBe(true);
    expect(access.realtimeBaseUrl).toBe("wss://proxy.example.com");
    expect(create).not.toHaveBeenCalled();
    expect(verifyLiveGrant(access.apiKey, SECRET)).toMatchObject({
      ownerId: "owner-1",
      source: "store",
      sessionId: "shopper-1",
      maxSeconds: 90,
    });
  });

  it("caps the grant to the merchant's remaining seconds and refuses under Decart's minimum", async () => {
    vi.stubEnv("DECART_REALTIME_PROXY_URL", "wss://proxy.example.com");
    vi.stubEnv("LIVE_PROXY_SECRET", SECRET);
    const access = await issueLiveAccess({ ...base, remainingSeconds: 42.7 });
    expect(verifyLiveGrant(access.apiKey, SECRET)?.maxSeconds).toBe(42);
    const error = await issueLiveAccess({ ...base, remainingSeconds: 9 }).catch((e) => e);
    expect(error).toBeInstanceOf(DecartApiError);
    expect((error as DecartApiError).status).toBe(402);
  });
});
