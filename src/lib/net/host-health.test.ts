import { beforeEach, describe, expect, it, vi } from "vitest";
import { hostnameOf, isHostBlocked, recordHostFailure, recordHostSuccess, resetHostHealth } from "./host-health";

const HOST = "shop.example.com";

beforeEach(() => {
  resetHostHealth();
  vi.useRealTimers();
});

describe("hostnameOf", () => {
  it("lowercases the host and ignores the rest of the URL", () => {
    expect(hostnameOf("https://Shop.Example.com/wp-content/uploads/a.webp?x=1")).toBe("shop.example.com");
  });

  it("returns null rather than throwing on a value that isn't a URL", () => {
    expect(hostnameOf("")).toBeNull();
    expect(hostnameOf("/relative/path.webp")).toBeNull();
  });
});

describe("host circuit", () => {
  it("tolerates isolated failures without blocking", () => {
    // One missing image is not an outage, and treating it as one would hide every other image
    // on the same host behind a fallback.
    recordHostFailure(HOST);
    recordHostFailure(HOST);
    expect(isHostBlocked(HOST)).toBe(false);
  });

  it("blocks on the third consecutive failure", () => {
    for (let i = 0; i < 3; i++) recordHostFailure(HOST);
    expect(isHostBlocked(HOST)).toBe(true);
  });

  it("backs off further the longer the host stays down", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) recordHostFailure(HOST);

    // 30s block: expired, so the next request probes again.
    vi.advanceTimersByTime(31_000);
    expect(isHostBlocked(HOST)).toBe(false);

    // That probe fails too, and the next block is longer — an outage lasting hours must not be
    // re-probed by every request every thirty seconds.
    recordHostFailure(HOST);
    vi.advanceTimersByTime(31_000);
    expect(isHostBlocked(HOST)).toBe(true);
  });

  it("clears the record on a success so a recovered host is trusted again", () => {
    for (let i = 0; i < 3; i++) recordHostFailure(HOST);
    recordHostSuccess(HOST);

    expect(isHostBlocked(HOST)).toBe(false);
    // And the count restarts, rather than the next single failure re-opening the circuit.
    recordHostFailure(HOST);
    expect(isHostBlocked(HOST)).toBe(false);
  });

  it("tracks hosts independently", () => {
    for (let i = 0; i < 3; i++) recordHostFailure(HOST);
    expect(isHostBlocked("cdn.other.com")).toBe(false);
  });

  it("never blocks an unparseable host", () => {
    recordHostFailure(null);
    expect(isHostBlocked(null)).toBe(false);
  });
});
