import { describe, expect, it, vi } from "vitest";
import { createShortLivedCache } from "./short-lived";

describe("createShortLivedCache", () => {
  it("shares one read between concurrent callers and reuses it until it expires", async () => {
    vi.useFakeTimers();
    const cache = createShortLivedCache<number>({ ttlMs: 1_000, maxEntries: 10 });
    const read = vi.fn(async () => 7);

    const [a, b] = await Promise.all([cache.get("k", read), cache.get("k", read)]);
    expect([a, b]).toEqual([7, 7]);
    expect(await cache.get("k", read)).toBe(7);
    expect(read).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    await cache.get("k", read);
    expect(read).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("never remembers a failed read", async () => {
    const cache = createShortLivedCache<number>({ ttlMs: 60_000, maxEntries: 10 });
    await expect(cache.get("k", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await cache.get("k", async () => 3)).toBe(3);
  });

  it("evicts the oldest key past its size", async () => {
    const cache = createShortLivedCache<string>({ ttlMs: 60_000, maxEntries: 2 });
    await cache.get("a", async () => "a");
    await cache.get("b", async () => "b");
    await cache.get("c", async () => "c");
    const read = vi.fn(async () => "a2");
    expect(await cache.get("a", read)).toBe("a2");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
