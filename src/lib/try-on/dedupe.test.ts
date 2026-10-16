import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDedupedRequests, dedupeRequest, parseRequestId } from "./dedupe";

beforeEach(() => clearDedupedRequests());

describe("parseRequestId", () => {
  it("accepts only plain bounded ids", () => {
    expect(parseRequestId("tryon_0123456789abcdef")).toBe("tryon_0123456789abcdef");
    expect(parseRequestId("short")).toBeNull();
    expect(parseRequestId("has spaces in it!!")).toBeNull();
    expect(parseRequestId("x".repeat(65))).toBeNull();
    expect(parseRequestId(42)).toBeNull();
  });
});

describe("dedupeRequest", () => {
  it("joins a retry to the render already running", async () => {
    const run = vi.fn().mockResolvedValue("image");
    const [a, b] = await Promise.all([
      dedupeRequest("owner", "tryon_aaaaaaaa", run),
      dedupeRequest("owner", "tryon_aaaaaaaa", run),
    ]);
    expect(a).toBe("image");
    expect(b).toBe("image");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns the stored result to a retry that arrives after the render finished", async () => {
    const run = vi.fn().mockResolvedValue("image");
    await dedupeRequest("owner", "tryon_bbbbbbbb", run);
    await expect(dedupeRequest("owner", "tryon_bbbbbbbb", run)).resolves.toBe("image");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("forgets a failure so the retry renders again", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("image");
    await expect(dedupeRequest("owner", "tryon_cccccccc", run)).rejects.toThrow("boom");
    await Promise.resolve();
    await expect(dedupeRequest("owner", "tryon_cccccccc", run)).resolves.toBe("image");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps different accounts apart", async () => {
    const run = vi.fn().mockResolvedValueOnce("one").mockResolvedValueOnce("two");
    await expect(dedupeRequest("owner-1", "tryon_dddddddd", run)).resolves.toBe("one");
    await expect(dedupeRequest("owner-2", "tryon_dddddddd", run)).resolves.toBe("two");
  });

  it("does not dedupe a request without an id", async () => {
    const run = vi.fn().mockResolvedValue("image");
    await dedupeRequest("owner", null, run);
    await dedupeRequest("owner", null, run);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
