import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn(async () => ({ apiKey: "ek_test", expiresAt: "later" })));

vi.mock("@decartai/sdk", () => ({ createDecartClient: () => ({ tokens: { create } }) }));

import {
  DecartApiError,
  REALTIME_TRYON_MIN_SESSION_SECONDS,
  REALTIME_TRYON_SESSION_CAP_SECONDS,
  createDecartClientToken,
} from "./decart";

const requestedMaxSession = () =>
  (create.mock.calls.at(-1) as unknown as [{ constraints: { realtime: { maxSessionDuration: number } } }])[0].constraints
    .realtime.maxSessionDuration;

describe("createDecartClientToken", () => {
  beforeEach(() => {
    create.mockClear();
    vi.stubEnv("DECART_API_KEY", "dct_test");
  });

  it("caps the session at the 90 second limit", async () => {
    await createDecartClientToken(10_000);
    expect(requestedMaxSession()).toBe(REALTIME_TRYON_SESSION_CAP_SECONDS);
  });

  it("passes through a remaining allowance between Decart's minimum and the cap", async () => {
    await createDecartClientToken(45.9);
    expect(requestedMaxSession()).toBe(45);
    await createDecartClientToken(REALTIME_TRYON_MIN_SESSION_SECONDS);
    expect(requestedMaxSession()).toBe(REALTIME_TRYON_MIN_SESSION_SECONDS);
  });

  it("refuses with a clear 402 instead of sending Decart a duration it rejects", async () => {
    const error = (await createDecartClientToken(9).catch((e) => e)) as DecartApiError;
    expect(error).toBeInstanceOf(DecartApiError);
    expect(error.status).toBe(402);
    expect(error.message).toMatch(/enough live try-on time/);
    expect(create).not.toHaveBeenCalled();
  });
});
