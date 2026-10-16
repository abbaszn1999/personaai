import { describe, expect, it, vi } from "vitest";
import {
  classifyTryOnResponse,
  newTryOnRequestId,
  requestTryOnImage,
  TryOnRequestError,
} from "./try-on-request";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fast = { sleep: async () => {}, backoffMs: [0, 0] as const };

describe("classifyTryOnResponse", () => {
  it("repeats gateway errors that did not come from our route", () => {
    for (const status of [502, 503, 504]) {
      const failure = classifyTryOnResponse(status, null);
      expect(failure.kind).toBe("network");
      expect(failure.autoRetry).toBe(true);
    }
  });

  it("trusts the server's own verdict and does not repeat what it already retried", () => {
    const timeout = classifyTryOnResponse(504, { code: "timeout", retryable: true });
    expect(timeout.kind).toBe("timeout");
    expect(timeout.retryable).toBe(true);
    expect(timeout.autoRetry).toBe(false);
  });

  it("repeats a full server queue on its own", () => {
    expect(classifyTryOnResponse(503, { code: "busy", retryable: true }).autoRetry).toBe(true);
  });

  it("treats a refusal or an empty balance as final and unavailable", () => {
    for (const code of ["rejected", "insufficient_balance", "not_configured", "unauthorized"]) {
      const failure = classifyTryOnResponse(402, { code, retryable: false });
      expect(failure.kind).toBe("unavailable");
      expect(failure.retryable).toBe(false);
    }
  });

  it("maps an unreachable garment picture", () => {
    expect(classifyTryOnResponse(400, { code: "garment_image", retryable: true }).kind).toBe("garment");
  });
});

describe("requestTryOnImage", () => {
  it("returns the image on success", async () => {
    const send = vi.fn().mockResolvedValue(json(200, { imageUrl: "data:image/png;base64,AAAA" }));
    await expect(requestTryOnImage(send, fast)).resolves.toBe("data:image/png;base64,AAAA");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("recovers from a dropped connection without the shopper noticing", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(200, { imageUrl: "data:image/png;base64,BBBB" }));
    await expect(requestTryOnImage(send, fast)).resolves.toBe("data:image/png;base64,BBBB");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("recovers from a gateway error", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }))
      .mockResolvedValueOnce(json(200, { imageUrl: "data:image/png;base64,CCCC" }));
    await expect(requestTryOnImage(send, fast)).resolves.toBe("data:image/png;base64,CCCC");
  });

  it("gives up after the maximum attempts with a network failure, never a raw message", async () => {
    const send = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await requestTryOnImage(send, fast).catch((e) => e);
    expect(error).toBeInstanceOf(TryOnRequestError);
    expect((error as TryOnRequestError).kind).toBe("network");
    expect((error as TryOnRequestError).message).not.toMatch(/failed to fetch/i);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not repeat a server-coded failure", async () => {
    const send = vi.fn().mockResolvedValue(json(502, { code: "no_image", retryable: true }));
    const error = (await requestTryOnImage(send, fast).catch((e) => e)) as TryOnRequestError;
    expect(error.kind).toBe("busy");
    expect(error.retryable).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not repeat an out-of-balance answer", async () => {
    const send = vi.fn().mockResolvedValue(json(402, { code: "insufficient_balance", retryable: false }));
    const error = (await requestTryOnImage(send, fast).catch((e) => e)) as TryOnRequestError;
    expect(error.kind).toBe("unavailable");
    expect(error.retryable).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("aborts an attempt that outlives its timeout and treats it as a timeout", async () => {
    const send = vi.fn(
      (signal: AbortSignal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })
    );
    const error = (await requestTryOnImage(send, {
      ...fast,
      attemptTimeoutMs: 20,
      maxAttempts: 2,
      minAttemptMs: 0,
    }).catch((e) => e)) as TryOnRequestError;
    expect(error.kind).toBe("timeout");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when the total budget is spent", async () => {
    let clock = 0;
    const send = vi.fn().mockImplementation(async () => {
      clock += 100_000;
      throw new TypeError("Failed to fetch");
    });
    await requestTryOnImage(send, { ...fast, now: () => clock, totalBudgetMs: 175_000 }).catch(() => {});
    expect(send).toHaveBeenCalledTimes(1 + 1);
  });
});

describe("newTryOnRequestId", () => {
  it("is unique and fits the server's accepted shape", () => {
    const a = newTryOnRequestId();
    const b = newTryOnRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
