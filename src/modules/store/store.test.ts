import { describe, it, expect, vi, beforeEach } from "vitest";
import { useStoreConnectionStore } from "./store";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("useStoreConnectionStore.updateStyleGuide", () => {
  beforeEach(() => {
    useStoreConnectionStore.setState({ styleGuide: null });
    vi.restoreAllMocks();
  });

  it("PATCHes styleGuide and updates local state on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ styleGuide: "lean minimalist" }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStoreConnectionStore.getState().updateStyleGuide("lean minimalist");

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store-connection",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ styleGuide: "lean minimalist" }),
      })
    );
    expect(useStoreConnectionStore.getState().styleGuide).toBe("lean minimalist");
  });

  it("PATCHes null to clear the style guide", async () => {
    useStoreConnectionStore.setState({ styleGuide: "old guidance" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ styleGuide: null }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStoreConnectionStore.getState().updateStyleGuide(null);

    expect(ok).toBe(true);
    expect(useStoreConnectionStore.getState().styleGuide).toBeNull();
  });

  it("returns false and leaves state untouched on a failed response", async () => {
    useStoreConnectionStore.setState({ styleGuide: "existing" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "Style guide must be 1000 characters or fewer" }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStoreConnectionStore.getState().updateStyleGuide("too long");

    expect(ok).toBe(false);
    expect(useStoreConnectionStore.getState().styleGuide).toBe("existing");
  });

  it("returns false on a network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStoreConnectionStore.getState().updateStyleGuide("anything");

    expect(ok).toBe(false);
  });
});

describe("useStoreConnectionStore.disconnect", () => {
  beforeEach(() => {
    useStoreConnectionStore.setState({ styleGuide: "keep me", syncError: null, isDisconnecting: false });
    vi.restoreAllMocks();
  });

  it("exposes a loading state immediately while cleanup is running", async () => {
    let finishRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
        finishRequest = resolve;
      }))
    );

    const request = useStoreConnectionStore.getState().disconnect();

    expect(useStoreConnectionStore.getState().isDisconnecting).toBe(true);
    finishRequest(jsonResponse({ success: true }));
    await request;
    expect(useStoreConnectionStore.getState().isDisconnecting).toBe(false);
  });

  it("clears local store data only after server cleanup succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true })));

    await useStoreConnectionStore.getState().disconnect();

    expect(useStoreConnectionStore.getState().styleGuide).toBeNull();
  });

  it("keeps local store data when ACS cleanup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Could not remove catalog from ACS" }, false, 502))
    );

    await useStoreConnectionStore.getState().disconnect();

    expect(useStoreConnectionStore.getState().styleGuide).toBe("keep me");
    expect(useStoreConnectionStore.getState().syncError).toContain("ACS");
    expect(useStoreConnectionStore.getState().isDisconnecting).toBe(false);
  });
});
