import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn();
vi.mock("next/server", () => ({ after: (fn: () => unknown) => after(fn) }));

import { chargeAfterResponse } from "./charge-after-response";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  after.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => errorSpy.mockRestore());

describe("chargeAfterResponse", () => {
  it("does not charge until the response is out", async () => {
    const charge = vi.fn().mockResolvedValue(5);
    await chargeAfterResponse("user=1", charge);
    expect(charge).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);

    await after.mock.calls[0][0]();
    expect(charge).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("charges right away when it is called outside a request", async () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const charge = vi.fn().mockResolvedValue(5);
    await chargeAfterResponse("user=1", charge);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("logs a charge the balance could not cover, with who and how much", async () => {
    await chargeAfterResponse("user=42 costNanos=1000", vi.fn().mockResolvedValue(null));
    await after.mock.calls[0][0]();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("user=42 costNanos=1000"));
  });

  it("logs and swallows a charge that throws, so the background task never rejects", async () => {
    await chargeAfterResponse("user=42", vi.fn().mockRejectedValue(new Error("db down")));
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("user=42"), expect.any(Error));
  });
});
