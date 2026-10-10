import { beforeEach, describe, expect, it } from "vitest";
import { allowEmbedRequest } from "./rate-limiter";

describe("allowEmbedRequest without a shared store", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    (globalThis as { __personaEmbedBuckets?: Map<string, unknown> }).__personaEmbedBuckets?.clear();
  });

  it("stops one client past its burst while other clients of the store carry on", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 21; i++) results.push(await allowEmbedRequest("tok", { kind: "paid", clientKey: "a" }));
    expect(results.slice(0, 20).every(Boolean)).toBe(true);
    expect(results[20]).toBe(false);
    expect(await allowEmbedRequest("tok", { kind: "paid", clientKey: "b" })).toBe(true);
  });

  it("lets a store's ceiling be raised for its traffic", async () => {
    process.env.EMBED_STORE_PAID_PER_MINUTE = "4";
    const allowed: boolean[] = [];
    for (let i = 0; i < 3; i++) allowed.push(await allowEmbedRequest("small", { kind: "paid", clientKey: `c${i}` }));
    delete process.env.EMBED_STORE_PAID_PER_MINUTE;
    // A burst of half the per-minute ceiling: two shoppers through, the third stopped.
    expect(allowed).toEqual([true, true, false]);
  });
});
