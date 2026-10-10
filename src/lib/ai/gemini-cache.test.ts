import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({ getGeminiClient: () => ({ caches: { create, update, delete: remove } }) }));

import { prefixCacheKey } from "./gemini-cache";

type CacheModule = typeof import("./gemini-cache");

const LONG = "x".repeat(13_000);
const HOUR = 3_600_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
const notFound = Object.assign(new Error('{"error":{"code":404,"message":"CachedContent not found","status":"NOT_FOUND"}}'), {
  status: 404,
});

let mod: CacheModule;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./gemini-cache");
  create.mockReset();
  update.mockReset();
  remove.mockReset().mockResolvedValue({});
  delete process.env.GEMINI_DISABLE_EXPLICIT_CACHE;
  process.env.GEMINI_EXPLICIT_CACHE_MIN_CALLS = "1";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_EXPLICIT_CACHE_MIN_CALLS;
});

describe("prefixCacheKey", () => {
  it("changes with the model and with any byte of the prefix", () => {
    expect(prefixCacheKey("m", "a")).toBe(prefixCacheKey("m", "a"));
    expect(prefixCacheKey("m", "a")).not.toBe(prefixCacheKey("n", "a"));
    expect(prefixCacheKey("m", "a")).not.toBe(prefixCacheKey("m", "a "));
  });
});

describe("resolvePrefixCache", () => {
  it("runs inline for prefixes below the cache minimum", () => {
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: "short", displayName: "t" })).toBeNull();
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: "x".repeat(12_000), displayName: "t" })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("runs inline first, creates in the background, then serves the cache and persists it", async () => {
    create.mockResolvedValue({ name: "cachedContents/abc", expireTime: inMs(HOUR), usageMetadata: { totalTokenCount: 4_500 } });
    const persist = vi.fn().mockResolvedValue(undefined);
    const input = { apiKey: "k", model: "m1", prefix: `${LONG}1`, displayName: "t", persist };

    expect(mod.resolvePrefixCache(input)).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ name: "cachedContents/abc", key: prefixCacheKey("m1", `${LONG}1`) }));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/created t name=cachedContents\/abc key=\w{12} tokens=4500/));
    expect(mod.resolvePrefixCache(input)).toBe("cachedContents/abc");
  });

  it("reuses a stored cache only when its key matches and it has not expired", async () => {
    const prefix = `${LONG}2`;
    const key = prefixCacheKey("m", prefix);
    const future = inMs(HOUR);
    expect(
      mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t", stored: { name: "c/stored", key, expiresAt: future } })
    ).toBe("c/stored");

    create.mockResolvedValue({ name: "c/new" });
    expect(
      mod.resolvePrefixCache({
        apiKey: "k",
        model: "m",
        prefix: `${LONG}3`,
        displayName: "t",
        stored: { name: "c/stored", key, expiresAt: future },
      })
    ).toBeNull();
    expect(
      mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t", stored: { name: "c/old", key, expiresAt: inMs(60_000) } })
    ).toBe("c/stored");
    await flush();
  });

  it("recreates a cache after it is forgotten", async () => {
    const prefix = `${LONG}4`;
    create.mockResolvedValue({ name: "c/four", expireTime: inMs(HOUR) });
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    mod.forgetPrefixCache("c/four");
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" })).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("ignores a stored cache Gemini already reported missing and creates a new one", async () => {
    const prefix = `${LONG}dead`;
    const stored = { name: "c/dead", key: prefixCacheKey("m", prefix), expiresAt: inMs(HOUR) };
    const persist = vi.fn().mockResolvedValue(undefined);
    const input = { apiKey: "k", model: "m", prefix, displayName: "t", stored, persist };
    expect(mod.resolvePrefixCache(input)).toBe("c/dead");

    mod.forgetPrefixCache("c/dead");
    create.mockResolvedValue({ name: "c/alive", expireTime: inMs(HOUR) });
    expect(mod.resolvePrefixCache(input)).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ name: "c/alive" }));
    expect(mod.resolvePrefixCache(input)).toBe("c/alive");
  });

  it("backs off after a failed create and can be disabled", async () => {
    const prefix = `${LONG}5`;
    create.mockRejectedValue(new Error("deadline exceeded"));
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    expect(create).toHaveBeenCalledTimes(1);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60_000);
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();
    expect(create).toHaveBeenCalledTimes(2);

    process.env.GEMINI_DISABLE_EXPLICIT_CACHE = "1";
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}6`, displayName: "t" })).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("never retries a prefix Gemini found too small", async () => {
    const prefix = `${LONG}small`;
    create.mockRejectedValue(new Error("Cached content is too small. total_token_count=3900, min_total_token_count=4096"));
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" });
    await flush();

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * HOUR);
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t" })).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("resolvePrefixCache busy threshold", () => {
  beforeEach(() => {
    delete process.env.GEMINI_EXPLICIT_CACHE_MIN_CALLS;
  });

  it("creates a cache only once the key was requested six times within ten minutes", async () => {
    create.mockResolvedValue({ name: "c/busy", expireTime: inMs(HOUR) });
    const input = { apiKey: "k", model: "m", prefix: `${LONG}busy`, displayName: "t" };
    for (let call = 0; call < 5; call += 1) expect(mod.resolvePrefixCache(input)).toBeNull();
    await flush();
    expect(create).not.toHaveBeenCalled();

    expect(mod.resolvePrefixCache(input)).toBeNull();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(mod.resolvePrefixCache(input)).toBe("c/busy");
  });

  it("does not count requests older than the window", async () => {
    create.mockResolvedValue({ name: "c/slow", expireTime: inMs(HOUR) });
    const input = { apiKey: "k", model: "m", prefix: `${LONG}slow`, displayName: "t" };
    const now = Date.now();
    const clock = vi.spyOn(Date, "now");
    for (let call = 0; call < 6; call += 1) {
      clock.mockReturnValue(now + call * 3 * 60_000);
      mod.resolvePrefixCache(input);
    }
    await flush();
    expect(create).not.toHaveBeenCalled();
  });

  it("serves a usable stored cache on the first request regardless of the counter", () => {
    const prefix = `${LONG}stored`;
    const stored = { name: "c/stored", key: prefixCacheKey("m", prefix), expiresAt: inMs(5 * 60_000) };
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t", stored })).toBe("c/stored");
    expect(update).not.toHaveBeenCalled();
  });

  it("honours the minimum-calls override", async () => {
    process.env.GEMINI_EXPLICIT_CACHE_MIN_CALLS = "2";
    create.mockResolvedValue({ name: "c/two", expireTime: inMs(HOUR) });
    const input = { apiKey: "k", model: "m", prefix: `${LONG}override`, displayName: "t" };
    mod.resolvePrefixCache(input);
    await flush();
    expect(create).not.toHaveBeenCalled();
    mod.resolvePrefixCache(input);
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("resolvePrefixCache extension", () => {
  it("extends a busy cache near its expiry and persists the new expiry", async () => {
    const prefix = `${LONG}extend`;
    const key = prefixCacheKey("m", prefix);
    const extended = inMs(HOUR);
    update.mockResolvedValue({ name: "c/near", expireTime: extended, usageMetadata: { totalTokenCount: 12_192 } });
    const persist = vi.fn().mockResolvedValue(undefined);
    const input = { apiKey: "k", model: "m", prefix, displayName: "t", persist, stored: { name: "c/near", key, expiresAt: inMs(5 * 60_000) } };

    expect(mod.resolvePrefixCache(input)).toBe("c/near");
    expect(mod.resolvePrefixCache(input)).toBe("c/near");
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ name: "c/near", config: { ttl: "3600s" } });
    expect(persist).toHaveBeenCalledWith({ name: "c/near", key, expiresAt: new Date(extended).toISOString() });
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/extended t name=c\/near key=\w{12} tokens=12192/));

    expect(mod.resolvePrefixCache(input)).toBe("c/near");
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves a cache far from expiry alone", async () => {
    const prefix = `${LONG}fresh`;
    const stored = { name: "c/fresh", key: prefixCacheKey("m", prefix), expiresAt: inMs(30 * 60_000) };
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix, displayName: "t", stored })).toBe("c/fresh");
    await flush();
    expect(update).not.toHaveBeenCalled();
  });

  it("creates a new cache when the one being extended is already gone", async () => {
    const prefix = `${LONG}gone`;
    const key = prefixCacheKey("m", prefix);
    update.mockRejectedValue(notFound);
    create.mockResolvedValue({ name: "c/replacement", expireTime: inMs(HOUR) });
    const persist = vi.fn().mockResolvedValue(undefined);
    const input = { apiKey: "k", model: "m", prefix, displayName: "t", persist, stored: { name: "c/gone", key, expiresAt: inMs(5 * 60_000) } };

    expect(mod.resolvePrefixCache(input)).toBe("c/gone");
    await flush();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ name: "c/replacement", key }));
    expect(mod.resolvePrefixCache(input)).toBe("c/replacement");
  });

  it("keeps serving the cache and backs off when an extension fails for another reason", async () => {
    const prefix = `${LONG}flaky`;
    update.mockRejectedValue(new Error("internal error"));
    const input = {
      apiKey: "k",
      model: "m",
      prefix,
      displayName: "t",
      stored: { name: "c/flaky", key: prefixCacheKey("m", prefix), expiresAt: inMs(5 * 60_000) },
    };
    expect(mod.resolvePrefixCache(input)).toBe("c/flaky");
    await flush();
    expect(mod.resolvePrefixCache(input)).toBe("c/flaky");
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("resolvePrefixCache superseded caches", () => {
  it("deletes the cache a changed prefix replaced under the same display name", async () => {
    create.mockResolvedValueOnce({ name: "c/one", expireTime: inMs(HOUR) }).mockResolvedValueOnce({ name: "c/two", expireTime: inMs(HOUR) });
    const first = { apiKey: "k", model: "m", prefix: `${LONG}v1`, displayName: "persona:s1" };
    mod.resolvePrefixCache(first);
    await flush();
    expect(remove).not.toHaveBeenCalled();

    mod.resolvePrefixCache({ ...first, prefix: `${LONG}v2` });
    await flush();
    expect(remove).toHaveBeenCalledWith({ name: "c/one" });
    expect(mod.resolvePrefixCache({ ...first, stored: { name: "c/one", key: prefixCacheKey("m", `${LONG}v1`), expiresAt: inMs(HOUR) } })).toBeNull();
    await flush();
  });

  it("leaves caches of other display names alone and swallows a failed delete", async () => {
    create
      .mockResolvedValueOnce({ name: "c/a", expireTime: inMs(HOUR) })
      .mockResolvedValueOnce({ name: "c/b", expireTime: inMs(HOUR) })
      .mockResolvedValueOnce({ name: "c/a2", expireTime: inMs(HOUR) });
    remove.mockRejectedValue(new Error("backend unavailable"));
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}a`, displayName: "persona:a" });
    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}b`, displayName: "persona:b" });
    await flush();
    expect(remove).not.toHaveBeenCalled();

    mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}a2`, displayName: "persona:a" });
    await flush();
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({ name: "c/a" });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}b`, displayName: "persona:b" })).toBe("c/b");
  });
});

describe("resolvePrefixCache memory bounds", () => {
  it("forgets the oldest cache once more than 500 keys are tracked", async () => {
    create.mockImplementation(async ({ config }: { config: { displayName: string } }) => ({
      name: `c/${config.displayName}`,
      expireTime: inMs(HOUR),
    }));
    for (let index = 0; index <= 500; index += 1) {
      mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}${index}`, displayName: `s${index}` });
    }
    await flush();
    expect(create).toHaveBeenCalledTimes(501);

    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}500`, displayName: "s500" })).toMatch(/^c\/s500:/);
    expect(mod.resolvePrefixCache({ apiKey: "k", model: "m", prefix: `${LONG}0`, displayName: "s0" })).toBeNull();
  });
});

describe("resolvePrefixCache cost", () => {
  it("charges creation tokens plus the storage hours bought, once, to the call that started it", async () => {
    create.mockResolvedValue({ name: "c/new", expireTime: inMs(HOUR), usageMetadata: { totalTokenCount: 12_000 } });
    const onCost = vi.fn();
    const tracked: Promise<void>[] = [];
    const input = { apiKey: "k", model: "gemini-3.8-flash", prefix: `${LONG}cost`, displayName: "t", onCost, track: (task: Promise<void>) => tracked.push(task) };

    mod.resolvePrefixCache(input);
    mod.resolvePrefixCache(input);
    await Promise.all(tracked);

    expect(tracked).toHaveLength(1);
    expect(onCost).toHaveBeenCalledTimes(1);
    const [[charge]] = onCost.mock.calls;
    // 12,000 tokens at the input rate, plus about an hour of storage at $0.50 per 1M tokens per hour.
    expect(charge).toMatchObject({ tokens: 12_000, created: true, name: "c/new" });
    expect(charge.nanos).toBeGreaterThan(12_000 * 750);
    expect(charge.nanos).toBeLessThanOrEqual(12_000 * 750 + 12_000 * 500 + 1);
  });

  it("charges storage from when Google created the cache, not from when the answer arrived", async () => {
    const now = Date.now();
    const createTime = new Date(now - 30 * 60_000).toISOString();
    const expireTime = new Date(now + 30 * 60_000).toISOString();
    create.mockResolvedValue({ name: "c/slow", createTime, expireTime, usageMetadata: { totalTokenCount: 12_000 } });
    const onCost = vi.fn();
    const tracked: Promise<void>[] = [];

    mod.resolvePrefixCache({ apiKey: "k", model: "gemini-3.8-flash", prefix: `${LONG}created-at`, displayName: "t", onCost, track: (task: Promise<void>) => tracked.push(task) });
    await Promise.all(tracked);

    const [[charge]] = onCost.mock.calls;
    // The full hour Google stores it: 12,000 tokens as input plus 12,000 token-hours of storage.
    expect(charge.nanos).toBe(12_000 * 750 + 12_000 * 500);
  });

  it("charges an extension only the storage hours it added", async () => {
    const prefix = `${LONG}extend-cost`;
    const key = prefixCacheKey("gemini-3.8-flash", prefix);
    update.mockResolvedValue({ name: "c/near", expireTime: inMs(HOUR), usageMetadata: { totalTokenCount: 12_000 } });
    const onCost = vi.fn();
    const tracked: Promise<void>[] = [];
    const input = {
      apiKey: "k",
      model: "gemini-3.8-flash",
      prefix,
      displayName: "t",
      onCost,
      track: (task: Promise<void>) => tracked.push(task),
      stored: { name: "c/near", key, expiresAt: inMs(5 * 60_000) },
    };

    mod.resolvePrefixCache(input);
    await Promise.all(tracked);

    const [[charge]] = onCost.mock.calls;
    expect(charge.created).toBe(false);
    // 55 more minutes of storage, no creation charge.
    expect(charge.nanos).toBeGreaterThan(0);
    expect(charge.nanos).toBeLessThan(12_000 * 500);
  });
});
