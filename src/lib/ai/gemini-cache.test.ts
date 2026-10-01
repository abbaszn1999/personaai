import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({ getGeminiClient: () => ({ caches: { create } }) }));

import { forgetPrefixCache, prefixCacheKey, resolvePrefixCache } from "./gemini-cache";

const LONG = "x".repeat(5_000);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("prefixCacheKey", () => {
  it("changes with the model and with any byte of the prefix", () => {
    expect(prefixCacheKey("m", "a")).toBe(prefixCacheKey("m", "a"));
    expect(prefixCacheKey("m", "a")).not.toBe(prefixCacheKey("n", "a"));
    expect(prefixCacheKey("m", "a")).not.toBe(prefixCacheKey("m", "a "));
  });
});

describe("resolvePrefixCache", () => {
  beforeEach(() => {
    create.mockReset();
    delete process.env.GEMINI_DISABLE_EXPLICIT_CACHE;
  });

  it("runs inline for prefixes below the cache minimum", () => {
    expect(resolvePrefixCache({ apiKey: "k", model: "m", prefix: "short", displayName: "t" })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("runs inline first, creates in the background, then serves the cache and persists it", async () => {
    const expireTime = new Date(Date.now() + 3_600_000).toISOString();
    create.mockResolvedValue({ name: "cachedContents/abc", expireTime });
    const persist = vi.fn().mockResolvedValue(undefined);
    const input = { apiKey: "k", model: "m1", prefix: `${LONG}1`, displayName: "t", persist };

    expect(resolvePrefixCache(input)).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ name: "cachedContents/abc", key: prefixCacheKey("m1", `${LONG}1`) }));
    expect(resolvePrefixCache(input)).toBe("cachedContents/abc");
  });

  it("reuses a stored cache only when its key matches and it has not expired", () => {
    const prefix = `${LONG}2`;
    const key = prefixCacheKey("m", prefix);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(
      resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t", stored: { name: "c/stored", key, expiresAt: future } })
    ).toBe("c/stored");

    create.mockResolvedValue({ name: "c/new" });
    const other = `${LONG}3`;
    expect(
      resolvePrefixCache({ apiKey: "k", model: "m", prefix: other, displayName: "t", stored: { name: "c/stored", key, expiresAt: future } })
    ).toBeNull();
  });

  it("recreates a cache after it is forgotten", async () => {
    const prefix = `${LONG}4`;
    create.mockResolvedValue({ name: "c/four", expireTime: new Date(Date.now() + 3_600_000).toISOString() });
    resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    forgetPrefixCache("c/four");
    expect(resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" })).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("backs off after a failed create and can be disabled", async () => {
    const prefix = `${LONG}5`;
    create.mockRejectedValue(new Error("too small"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    process.env.GEMINI_DISABLE_EXPLICIT_CACHE = "1";
    expect(resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}6`, displayName: "t" })).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
