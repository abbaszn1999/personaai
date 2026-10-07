import { describe, expect, it } from "vitest";
import { refuseDuringSetupReset } from "./setup-reset-guard";
import { IDLE_SETUP_RESET, SETUP_RESET_STALE_MS } from "./setup-reset-state";

const now = new Date().toISOString();

describe("refuseDuringSetupReset", () => {
  it.each([
    ["idle", { ...IDLE_SETUP_RESET }],
    ["done", { ...IDLE_SETUP_RESET, status: "done" as const, finishedAt: now }],
  ])("lets changes through once the reset is %s", (_label, setupReset) => {
    expect(refuseDuringSetupReset({ setupReset })).toBeNull();
  });

  it("lets changes through for a connection read without reset columns", () => {
    expect(refuseDuringSetupReset({})).toBeNull();
  });

  it("refuses while old data is still being removed", async () => {
    const response = refuseDuringSetupReset({
      setupReset: { ...IDLE_SETUP_RESET, status: "running", startedAt: now, leaseUntil: now },
    });

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: "setup_reset_pending" });
  });

  it("refuses after a failed cleanup, until Retry finishes it", () => {
    expect(refuseDuringSetupReset({ setupReset: { ...IDLE_SETUP_RESET, status: "failed" } })?.status).toBe(409);
  });

  it("refuses a cleanup nothing has touched for a while, which now reads as failed", () => {
    const longAgo = new Date(Date.now() - SETUP_RESET_STALE_MS - 1).toISOString();
    expect(
      refuseDuringSetupReset({ setupReset: { ...IDLE_SETUP_RESET, status: "running", startedAt: longAgo } })?.status,
    ).toBe(409);
  });
});
