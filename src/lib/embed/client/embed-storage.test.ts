import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearShopperToken,
  getOrCreateEmbedSessionId,
  isGuestMode,
  loadShopperToken,
  saveShopperToken,
  setGuestMode,
} from "./embed-storage";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const TOKEN = "embed-token";

describe("guest storage routing", () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    local = fakeStorage();
    session = fakeStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a signed-in shopper on the device", () => {
    saveShopperToken(TOKEN, "bearer");
    expect(local.length).toBe(1);
    expect(session.length).toBe(0);
    expect(loadShopperToken(TOKEN)).toBe("bearer");
  });

  it("keeps a guest in the tab only, so nothing is left on the device", () => {
    setGuestMode(TOKEN, true);
    saveShopperToken(TOKEN, "guest-bearer");
    getOrCreateEmbedSessionId(TOKEN);

    expect(isGuestMode(TOKEN)).toBe(true);
    expect(loadShopperToken(TOKEN)).toBe("guest-bearer");
    expect(local.length).toBe(0);
  });

  it("does not let a guest see a signed-in shopper's token, or the reverse", () => {
    saveShopperToken(TOKEN, "account-bearer");
    setGuestMode(TOKEN, true);
    expect(loadShopperToken(TOKEN)).toBeNull();

    saveShopperToken(TOKEN, "guest-bearer");
    setGuestMode(TOKEN, false);
    expect(loadShopperToken(TOKEN)).toBe("account-bearer");
  });

  it("clears the guest's token from the tab storage it was saved in", () => {
    setGuestMode(TOKEN, true);
    saveShopperToken(TOKEN, "guest-bearer");
    clearShopperToken(TOKEN);
    setGuestMode(TOKEN, false);
    expect(loadShopperToken(TOKEN)).toBeNull();
    expect(session.getItem(`autoshopping_shopper_token:${TOKEN}`)).toBeNull();
  });

  it("scopes the guest flag to one store", () => {
    setGuestMode(TOKEN, true);
    expect(isGuestMode("another-store")).toBe(false);
  });
});
