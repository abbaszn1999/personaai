import { afterEach, describe, expect, it, vi } from "vitest";
import { bookSlot, buildPayload, sendLead } from "./booking";
import { tokenFields } from "./turnstile";
import { verifyTurnstile } from "./turnstile-verify";

const payload = buildPayload({
  name: "Sara Haddad",
  email: "sara@yourstore.com",
  store: "yourstore.com",
  platform: "WooCommerce",
  message: "We sell dresses and want a fitting room.",
});

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("verifyTurnstile", () => {
  const ok = () => json(200, { success: true });

  it("skips the check when no secret is configured", async () => {
    expect(await verifyTurnstile("token", "1.2.3.4", { secret: "" })).toBe("skipped");
  });

  it("fails without calling Cloudflare when the token is missing", async () => {
    const fetchImpl = vi.fn(ok);
    expect(await verifyTurnstile(undefined, "1.2.3.4", { secret: "s", fetchImpl })).toBe("failed");
    expect(await verifyTurnstile("", "1.2.3.4", { secret: "s", fetchImpl })).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the secret, token and visitor IP to siteverify", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ok());
    expect(await verifyTurnstile("tok", "1.2.3.4", { secret: "sec", fetchImpl: fetchImpl as unknown as typeof fetch })).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.body.get("secret")).toBe("sec");
    expect(init.body.get("response")).toBe("tok");
    expect(init.body.get("remoteip")).toBe("1.2.3.4");
  });

  it("does not send an unknown IP", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => ok());
    await verifyTurnstile("tok", "unknown", { secret: "sec", fetchImpl: fetchImpl as unknown as typeof fetch });
    const [, init] = fetchImpl.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(init.body.has("remoteip")).toBe(false);
  });

  it("reports a rejected token, and an unreachable Cloudflare, differently", async () => {
    const rejected = vi.fn(async () => json(200, { success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect(await verifyTurnstile("tok", undefined, { secret: "s", fetchImpl: rejected as unknown as typeof fetch })).toBe("failed");
    const down = vi.fn(async () => json(500));
    expect(await verifyTurnstile("tok", undefined, { secret: "s", fetchImpl: down as unknown as typeof fetch })).toBe("unavailable");
    const offline = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await verifyTurnstile("tok", undefined, { secret: "s", fetchImpl: offline as unknown as typeof fetch })).toBe("unavailable");
  });
});

describe("tokens in requests", () => {
  it("tokenFields sends both names, or nothing when Turnstile is off", () => {
    expect(tokenFields("abc")).toEqual({ turnstileToken: "abc", "cf-turnstile-response": "abc" });
    expect(tokenFields(undefined)).toEqual({});
  });

  it("sendLead puts a token in the shared request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendLead(payload, { honeypot: "", elapsedMs: 4200, getToken: async () => "tok-1" });
    expect(result).toEqual({ ok: true, via: "shared", bookingPass: null });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.turnstileToken).toBe("tok-1");
    expect(body["cf-turnstile-response"]).toBe("tok-1");
    expect(body.site).toBe("persona");
    expect(body.elapsedMs).toBe(4200);
    expect(body.hp).toBe("");
  });

  it("sendLead uses a fresh token for the local fallback", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return url.startsWith("/") ? json(200, { ok: true }) : json(503);
      }),
    );
    const tokens = ["tok-1", "tok-2"];
    const result = await sendLead(payload, { getToken: async () => tokens.shift() ?? null });
    expect(result).toEqual({ ok: true, via: "local", bookingPass: null });
    expect(calls).toHaveLength(2);
    expect(calls[0].body.turnstileToken).toBe("tok-1");
    expect(calls[1].url).toBe("/api/contact");
    expect(calls[1].body.turnstileToken).toBe("tok-2");
  });

  it("sendLead sends nothing when the check fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendLead(payload, { getToken: async () => null })).toEqual({ ok: false, code: "verification" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendLead sends no token fields when Turnstile is off", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await sendLead(payload, { getToken: async () => undefined });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect("turnstileToken" in body).toBe(false);
  });

  it("a local 403 reports a verification problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.startsWith("/") ? json(403) : json(503))),
    );
    expect(await sendLead(payload, { getToken: async () => "t" })).toEqual({ ok: false, code: "verification" });
  });

  it("sendLead hands back the booking pass the shared API issues", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { ok: true, bookingPass: "1790000000000.abc" })));
    expect(await sendLead(payload, { getToken: async () => "t" })).toEqual({
      ok: true,
      via: "shared",
      bookingPass: "1790000000000.abc",
    });
  });

  it("bookSlot sends the booking pass, start and time zone, and no Turnstile token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(200, { ok: true, start: "2026-10-21T10:00:00.000Z", end: "2026-10-21T10:45:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await bookSlot(payload, "2026-10-21T10:00:00.000Z", "Asia/Tokyo", "1790000000000.abc");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ start: "2026-10-21T10:00:00.000Z", timeZone: "Asia/Tokyo", bookingPass: "1790000000000.abc" });
    expect("turnstileToken" in body).toBe(false);
  });

  it("bookSlot leaves the pass out when there is none, and reports an expired one", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(403, { code: "verification_expired" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await bookSlot(payload, "2026-10-21T10:00:00.000Z", "Asia/Tokyo")).toEqual({ kind: "verification_expired" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect("bookingPass" in body).toBe(false);
  });
});