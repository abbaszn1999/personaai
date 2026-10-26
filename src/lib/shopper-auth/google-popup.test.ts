import { describe, expect, it } from "vitest";
import { encodeFlowCookie, normalizeOrigin, renderPopupResult, SHOPPER_GOOGLE_MESSAGE_SOURCE } from "./google-popup";
import { parsePopupMessage } from "@/lib/embed/client/google-popup";

describe("normalizeOrigin", () => {
  it("keeps only the origin of an http(s) URL", () => {
    expect(normalizeOrigin("https://shop.example.com/products/x?y=1")).toBe("https://shop.example.com");
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("refuses anything that is not a plain web origin", () => {
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("data:text/html,hi")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
  });
});

describe("renderPopupResult", () => {
  const ok = { source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: true, email: "a@b.co", ticket: "t0ken" } as const;

  it("posts only to the page that opened the popup, and is never cached", async () => {
    const res = renderPopupResult(ok, "https://shop.example.com");
    const html = await res.text();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(html).toContain('var origin="https://shop.example.com"');
    expect(html).toContain("window.opener.postMessage(payload,origin)");
    expect(html).not.toContain('"*"');
  });

  it("keeps hostile text from breaking out of the script", async () => {
    const html = await renderPopupResult(
      { source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: false, error: "</script><script>alert(1)</script>\u2028" },
      "https://shop.example.com"
    ).text();
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("\u2028");
  });

  it("posts nothing when there is no safe origin to tell", async () => {
    const html = await renderPopupResult(ok, null).text();
    expect(html).toContain("var origin=null");
  });
});

describe("flow cookie", () => {
  it("round-trips through a url-safe string", () => {
    const value = encodeFlowCookie({ state: "s", embedToken: "e", origin: "https://x.test" });
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(value, "base64url").toString())).toEqual({
      state: "s",
      embedToken: "e",
      origin: "https://x.test",
    });
  });
});

describe("parsePopupMessage (widget side)", () => {
  it("reads a success message", () => {
    expect(parsePopupMessage({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: true, email: "a@b.co", ticket: "t" })).toEqual({
      ok: true,
      email: "a@b.co",
      ticket: "t",
    });
  });

  it("reads a failure and a cancellation", () => {
    expect(parsePopupMessage({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: false, error: "nope" })).toEqual({
      ok: false,
      error: "nope",
      cancelled: false,
    });
    expect(parsePopupMessage({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: false, cancelled: true })).toMatchObject({
      ok: false,
      cancelled: true,
    });
  });

  it("ignores messages that are not ours, and never trusts a success without a ticket", () => {
    expect(parsePopupMessage(null)).toBeNull();
    expect(parsePopupMessage("hello")).toBeNull();
    expect(parsePopupMessage({ source: "something-else", ok: true, email: "a", ticket: "t" })).toBeNull();
    expect(parsePopupMessage({ source: SHOPPER_GOOGLE_MESSAGE_SOURCE, ok: true, email: "a@b.co" })).toMatchObject({
      ok: false,
    });
  });
});
