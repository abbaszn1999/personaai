import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { useStoreConnectionStore } from "./store";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";

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

describe("useStoreConnectionStore.saveSizeTypes", () => {
  beforeEach(() => {
    useStoreConnectionStore.setState({ storeSizeSettings: { default: "Alpha", overrides: {} } });
    vi.restoreAllMocks();
  });

  it("merges a default-only change with the previously saved overrides", async () => {
    useStoreConnectionStore.setState({ storeSizeSettings: { default: "Alpha", overrides: { nike: "EU" } } });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ storeSizeSettings: { default: "US", overrides: { nike: "EU" } } }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStoreConnectionStore.getState().saveSizeTypes({ default: "US" });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store-connection",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ storeSizeSettings: { default: "US", overrides: { nike: "EU" } } }),
      })
    );
    expect(useStoreConnectionStore.getState().storeSizeSettings).toEqual({ default: "US", overrides: { nike: "EU" } });
  });

  it("merges an overrides-only change with the previously saved default", async () => {
    useStoreConnectionStore.setState({ storeSizeSettings: { default: "EU", overrides: {} } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ storeSizeSettings: { default: "EU", overrides: { nike: "US" } } }))
    );

    const ok = await useStoreConnectionStore.getState().saveSizeTypes({ overrides: { nike: "US" } });

    expect(ok).toBe(true);
    expect(useStoreConnectionStore.getState().storeSizeSettings).toEqual({ default: "EU", overrides: { nike: "US" } });
  });

  it("rolls back to the previous settings on a failed response", async () => {
    const previous = { default: "Alpha" as const, overrides: {} };
    useStoreConnectionStore.setState({ storeSizeSettings: previous });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, false, 400)));

    const ok = await useStoreConnectionStore.getState().saveSizeTypes({ default: "US" });

    expect(ok).toBe(false);
    expect(useStoreConnectionStore.getState().storeSizeSettings).toEqual(previous);
  });
});

describe("useStoreConnectionStore.resetFieldMappings", () => {
  const saved = {
    sources: { brand: { kind: "field" as const, key: "sku" } },
    customAttributes: [
      { key: "fit_note", name: "Fit Note", type: "text" as const, source: { kind: "meta" as const, key: "meta.fit" } },
    ],
    optionRoles: { colour: "color" as const },
  };

  beforeEach(() => {
    useStoreConnectionStore.setState({
      acsMapping: { approved: true, mapperVersion: 1 },
      mapping: {
        columns: [],
        brands: [],
        document: saved,
        sizeChart: { bound: false, withData: 0, sampled: 0 },
        sampled: 0,
        categoriesSample: null,
        discoveryStatus: "idle",
        discoveryScanned: 0,
        isLoading: false,
        hasLoaded: true,
        savingKey: null,
        isAddingCustomAttribute: false,
        isApproving: false,
        isResetting: false,
        error: null,
      },
    });
    vi.restoreAllMocks();
  });

  it("clears every part of the mapping and reopens the approval gate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ mapping: EMPTY_ACS_MAPPING }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStoreConnectionStore.getState().resetFieldMappings();

    expect(ok).toBe(true);
    // Every part sent explicitly empty rather than omitted: the route only replaces a part it
    // receives, so omitting one would leave it saved and make this a partial reset.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/store-connection/mapping-options",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ sources: {}, customAttributes: [], optionRoles: {} }),
      })
    );
    const state = useStoreConnectionStore.getState();
    expect(state.mapping.document).toEqual(EMPTY_ACS_MAPPING);
    expect(state.mapping.isResetting).toBe(false);
    // The saved mapping no longer matches the approved hash, so Stage 1 has to be approved again
    // before any of this reaches a real index.
    expect(state.acsMapping.approved).toBe(false);
  });

  it("leaves the saved mapping untouched and surfaces an error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 500)));

    const ok = await useStoreConnectionStore.getState().resetFieldMappings();

    expect(ok).toBe(false);
    const state = useStoreConnectionStore.getState();
    expect(state.mapping.document).toEqual(saved);
    expect(state.mapping.error).toBe("nope");
    expect(state.mapping.isResetting).toBe(false);
  });

  it("returns false on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const ok = await useStoreConnectionStore.getState().resetFieldMappings();

    expect(ok).toBe(false);
    expect(useStoreConnectionStore.getState().mapping.isResetting).toBe(false);
  });
});

describe("useStoreConnectionStore.refreshColumnCoverage", () => {
  beforeEach(() => {
    useStoreConnectionStore.setState({
      mapping: {
        columns: [],
        brands: [],
        document: EMPTY_ACS_MAPPING,
        sizeChart: { bound: false, withData: 0, sampled: 0 },
        sampled: 0,
        categoriesSample: null,
        discoveryStatus: "idle",
        discoveryScanned: 0,
        isLoading: false,
        hasLoaded: true,
        savingKey: null,
        isAddingCustomAttribute: false,
        isApproving: false,
        isResetting: false,
        error: null,
      },
    });
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Starts the walk, polls it to "running" then "done", and reloads the columns exactly once —
  // the full life cycle the "Scan full catalog" button in Stage 1 drives.
  it("starts a walk, polls it to completion, then reloads the columns", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ status: "running" });
      if (url === "/api/store-connection/cms-columns/discover") {
        return jsonResponse({ status: "done", scanned: 500 });
      }
      // The reload `loadMapping` triggers once the walk reports done.
      return jsonResponse({ columns: [], brands: [], mapping: EMPTY_ACS_MAPPING, sampled: 25 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const run = useStoreConnectionStore.getState().refreshColumnCoverage();
    await vi.advanceTimersByTimeAsync(3000);
    await run;

    expect(useStoreConnectionStore.getState().mapping.discoveryStatus).toBe("done");
    expect(useStoreConnectionStore.getState().mapping.discoveryScanned).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith("/api/store-connection/cms-columns/discover", { method: "POST" });
  });

  it("keeps polling every tick while the walk is still running, then settles once it finishes", async () => {
    let discoveryGets = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ status: "running" });
      if (url === "/api/store-connection/cms-columns/discover") {
        discoveryGets += 1;
        // The first two polls see the walk still running; every one after (including the final
        // hydration read `loadMapping` does once polling stops) sees it done.
        return jsonResponse({ status: discoveryGets <= 2 ? "running" : "done", scanned: discoveryGets * 100 });
      }
      return jsonResponse({ columns: [], brands: [], mapping: EMPTY_ACS_MAPPING, sampled: 25 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const run = useStoreConnectionStore.getState().refreshColumnCoverage();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await run;

    // At least the two "still running" polls plus the one that finally reports "done".
    expect(discoveryGets).toBeGreaterThanOrEqual(3);
    expect(useStoreConnectionStore.getState().mapping.discoveryStatus).toBe("done");
  });

  it("does nothing further when starting the walk fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 500)));

    await useStoreConnectionStore.getState().refreshColumnCoverage();

    expect(useStoreConnectionStore.getState().mapping.discoveryStatus).toBe("idle");
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
