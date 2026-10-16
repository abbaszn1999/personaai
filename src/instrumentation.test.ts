import { describe, expect, it } from "vitest";
import { isTransientNetworkError } from "@/lib/runtime/process-guards";

describe("isTransientNetworkError", () => {
  it("recognises undici and socket failures", () => {
    expect(isTransientNetworkError(Object.assign(new Error("x"), { code: "UND_ERR_SOCKET" }))).toBe(true);
    expect(isTransientNetworkError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(isTransientNetworkError(new TypeError("terminated"))).toBe(true);
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(
      isTransientNetworkError(new Error("x", { cause: Object.assign(new Error("socket"), { code: "UND_ERR_SOCKET" }) })),
    ).toBe(true);
    expect(isTransientNetworkError(new TypeError("fetch failed", { cause: new Error("boom") }))).toBe(true);
  });

  it("does not excuse a genuine bug", () => {
    expect(isTransientNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isTransientNetworkError("boom")).toBe(false);
  });
});
