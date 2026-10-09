import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_AUTO_MATCH, type AutoMatchJobState } from "@/lib/catalog/auto-match-state";
import { IDLE_SETUP_RESET } from "@/lib/catalog/setup-reset-state";

const afterTasks: Array<() => unknown> = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => afterTasks.push(task),
}));
vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/catalog/persona-auto-match", () => ({ startAutoMatch: vi.fn(), runAutoMatchJob: vi.fn() }));

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { runAutoMatchJob, startAutoMatch } from "@/lib/catalog/persona-auto-match";
import { GET, POST } from "./route";

function request(body: unknown = { categoryIds: ["tees"] }) {
  return new NextRequest("http://localhost/api/store-connection/persona-mapping/auto-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function connectionWith(autoMatchJob: AutoMatchJobState, setupReset = IDLE_SETUP_RESET) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    autoMatchJob,
    setupReset,
    personaAutoMatchCompletedAt: null,
  } as never;
}

describe("AI matching endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterTasks.length = 0;
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(connectionWith(IDLE_AUTO_MATCH));
    vi.mocked(startAutoMatch).mockResolvedValue({ ok: true, jobId: "job-1", categoryIds: ["tees"] });
  });

  it("answers at once and runs the match on the server after the response", async () => {
    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, jobId: "job-1", total: 1 });
    expect(runAutoMatchJob).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    expect(runAutoMatchJob).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "job-1", ["tees"]);
  });

  it("only passes the category ids on, never a scope from the page", async () => {
    await POST(request({ categoryIds: ["tees"], scope: { configured: true, enabledDeptIds: ["men"] } }));

    expect(startAutoMatch).toHaveBeenCalledWith(expect.anything(), ["tees"]);
  });

  it("reports why a run could not start, and schedules nothing", async () => {
    vi.mocked(startAutoMatch).mockResolvedValue({
      ok: false,
      status: 400,
      error: "Configure What You Sell before running AI matching.",
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Configure What You Sell before running AI matching." });
    expect(afterTasks).toHaveLength(0);
  });

  it("does not start while Start from scratch is unfinished", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      connectionWith(IDLE_AUTO_MATCH, { ...IDLE_SETUP_RESET, status: "failed", error: "stopped" }),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(startAutoMatch).not.toHaveBeenCalled();
  });

  it("reports a run that went silent as failed, so the page stops waiting on it", async () => {
    const longAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      connectionWith({ ...IDLE_AUTO_MATCH, status: "running", jobId: "job-1", startedAt: longAgo, heartbeatAt: longAgo }),
    );

    const data = await (await GET()).json();

    expect(data.autoMatch.status).toBe("failed");
    expect(data.autoMatch.error).toContain("interrupted");
  });

  it("requires a signed-in merchant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    expect((await POST(request())).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });
});
