import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SETUP_RESET, type SetupResetState } from "@/lib/catalog/setup-reset-state";

const afterTasks: Array<() => unknown> = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => afterTasks.push(task),
}));
vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/db/sizing-runs", () => ({ getLastPublishedAt: vi.fn(async () => null) }));
vi.mock("@/lib/catalog/start-from-scratch", () => ({
  resetSetupData: vi.fn(async () => ({ ok: true })),
  cleanAcsAfterReset: vi.fn(async () => undefined),
  restartAcsCleanup: vi.fn(async () => true),
}));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { getLastPublishedAt } from "@/lib/db/sizing-runs";
import { cleanAcsAfterReset, resetSetupData, restartAcsCleanup } from "@/lib/catalog/start-from-scratch";
import { GET, POST } from "./route";

function connectionWith(setupReset: SetupResetState) {
  return { id: "conn-1", setupReset } as never;
}

function post(body: unknown) {
  return POST(new Request("http://localhost/api/store-connection/start-from-scratch", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
  vi.mocked(getStoreConnectionByOwner).mockResolvedValue(connectionWith(IDLE_SETUP_RESET));
});

describe("start from scratch", () => {
  it("refuses without the confirm word, and changes nothing", async () => {
    const response = await post({ scope: "setup", confirm: "yes" });

    expect(response.status).toBe(400);
    expect(resetSetupData).not.toHaveBeenCalled();
  });

  it("refuses an unknown scope", async () => {
    expect((await post({ scope: "everything", confirm: "RESET" })).status).toBe(400);
  });

  it("resets the database now and leaves the ACS cleanup to run after the response", async () => {
    const response = await post({ scope: "mapping", confirm: "reset" });

    expect(response.status).toBe(200);
    expect(resetSetupData).toHaveBeenCalledWith("conn-1", "mapping");
    expect(cleanAcsAfterReset).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    expect(cleanAcsAfterReset).toHaveBeenCalledWith("conn-1");
  });

  it("refuses a second reset while the first is still removing products", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(
      connectionWith({ ...IDLE_SETUP_RESET, status: "running", startedAt: new Date().toISOString() }),
    );

    expect((await post({ scope: "setup", confirm: "RESET" })).status).toBe(409);
    expect(resetSetupData).not.toHaveBeenCalled();
  });

  it("retries only a failed cleanup, without touching the setup the merchant has redone since", async () => {
    expect((await post({ retry: true })).status).toBe(409);

    vi.mocked(getStoreConnectionByOwner).mockResolvedValue(connectionWith({ ...IDLE_SETUP_RESET, status: "failed" }));
    const response = await post({ retry: true });

    expect(response.status).toBe(200);
    expect(restartAcsCleanup).toHaveBeenCalledWith("conn-1");
    expect(resetSetupData).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);
  });

  it("tells the dialog whether the store is live", async () => {
    vi.mocked(getLastPublishedAt).mockResolvedValue("2026-10-01T00:00:00.000Z");
    const data = await (await GET()).json();

    expect(data).toMatchObject({ live: true, reset: { status: "idle" } });
  });
});
