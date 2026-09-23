import { describe, expect, it } from "vitest";
import { matchWooOrderLines, type WooCartCandidate, type WooOrderForMatch } from "./woo-match";

const order: WooOrderForMatch = {
  dateCreated: "2026-09-10T12:00:00.000Z",
  ipHash: "ip-a",
  uaHash: "ua-a",
  lines: [{ id: "line-1", itemId: "42", name: "Coat", total: 80 }],
};

function event(overrides: Partial<WooCartCandidate>): WooCartCandidate {
  return {
    platformItemId: "42",
    sessionId: "sess-1",
    ipHash: "ip-a",
    uaHash: "ua-a",
    createdAt: "2026-09-09T12:00:00.000Z",
    ...overrides,
  };
}

describe("matchWooOrderLines", () => {
  it("matches the same item from the same device inside the window", () => {
    const matched = matchWooOrderLines(order, [event({})]);
    expect(matched).toEqual([
      { lineId: "line-1", itemId: "42", name: "Coat", total: 80, sessionId: "sess-1" },
    ]);
  });

  it("ignores an add from before the window", () => {
    const matched = matchWooOrderLines(order, [event({ createdAt: "2026-09-01T12:00:00.000Z" })]);
    expect(matched).toEqual([]);
  });

  it("ignores a different device", () => {
    const matched = matchWooOrderLines(order, [event({ ipHash: "ip-b" })]);
    expect(matched).toEqual([]);
  });

  it("prefers the session whose browser matches when two devices-sessions added the item", () => {
    const matched = matchWooOrderLines(order, [
      event({ sessionId: "older", uaHash: "ua-b", createdAt: "2026-09-10T11:00:00.000Z" }),
      event({ sessionId: "browser", uaHash: "ua-a", createdAt: "2026-09-08T11:00:00.000Z" }),
    ]);
    expect(matched[0]?.sessionId).toBe("browser");
  });

  it("uses the latest session when no browser matches", () => {
    const matched = matchWooOrderLines(order, [
      event({ sessionId: "older", uaHash: "ua-b", createdAt: "2026-09-08T11:00:00.000Z" }),
      event({ sessionId: "newer", uaHash: "ua-c", createdAt: "2026-09-10T11:00:00.000Z" }),
    ]);
    expect(matched[0]?.sessionId).toBe("newer");
  });
});
