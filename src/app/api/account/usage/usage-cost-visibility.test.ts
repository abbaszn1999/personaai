import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ showCosts: false }));

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: async () => ({ id: "owner-1" }) }));
vi.mock("@/lib/billing/account", () => ({
  getAccountBillingContext: async () => ({
    user: { show_usage_costs: state.showCosts },
    cycleStartIso: "2026-10-01T00:00:00.000Z",
    cycleEndIso: "2026-11-01T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/db/usage-report", () => ({
  queryUsageReport: async () => [
    { bucket: "2026-10-05", tool: "chat", quantity: 4, units: 2, nanos: 5_000_000 },
    { bucket: "2026-10-05", tool: "search", quantity: 2, units: 2, nanos: 5_000_000 },
  ],
  queryUsageSessions: async () => ({
    shopperCount: 1,
    shoppers: [
      {
        sessionId: "abc-123",
        source: "store",
        email: null,
        chatCalls: 4,
        chatUnits: 2,
        searches: 2,
        searchUnits: 2,
        tryOnCount: 0,
        tryOnUnits: 0,
        avatarCount: 0,
        avatarUnits: 0,
        liveEvents: 0,
        liveSeconds: 0,
        costNanos: 10_000_000,
        firstSeen: null,
        lastSeen: null,
      },
    ],
  }),
}));

import { GET as getReport } from "./report/route";
import { GET as getSessions } from "./sessions/route";
import { GET as getExport } from "./export/route";

const request = (path: string) => new NextRequest(`http://localhost/api/account/usage/${path}?range=cycle&tz=UTC`);

describe("usage cost visibility", () => {
  beforeEach(() => {
    state.showCosts = false;
  });

  it("leaves every cost out of the report when costs are hidden", async () => {
    const body = await (await getReport(request("report"))).json();
    expect(body.showCosts).toBe(false);
    for (const key of ["spendNanos", "previousSpendNanos", "changePercent", "seriesNanos"]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body.seriesUnits.length).toBeGreaterThan(0);
    expect(body.tools.length).toBeGreaterThan(0);
    for (const line of body.tools) {
      expect(line).not.toHaveProperty("costNanos");
      expect(line).not.toHaveProperty("share");
      expect(line).not.toHaveProperty("changePercent");
    }
    expect(JSON.stringify(body)).not.toMatch(/nanos/i);
  });

  it("includes costs in the report when an admin turned them on", async () => {
    state.showCosts = true;
    const body = await (await getReport(request("report"))).json();
    expect(body.showCosts).toBe(true);
    expect(body.spendNanos).toBe(10_000_000);
    expect(body.seriesNanos.length).toBeGreaterThan(0);
    expect(body.tools.find((line: { tool: string }) => line.tool === "chat").costNanos).toBe(5_000_000);
  });

  it("strips shopper costs from the sessions list when hidden", async () => {
    const hidden = await (await getSessions(request("sessions"))).json();
    expect(hidden.shoppers[0]).not.toHaveProperty("costNanos");
    expect(hidden.shoppers[0].chatCalls).toBe(4);

    state.showCosts = true;
    const shown = await (await getSessions(request("sessions"))).json();
    expect(shown.shoppers[0].costNanos).toBe(10_000_000);
  });

  it("drops the cost_usd column from the export when hidden", async () => {
    const hidden = await (await getExport(request("export"))).text();
    expect(hidden.split("\n")[0]).toBe("section,bucket,tool,session,source,quantity,units");
    expect(hidden).not.toContain("cost");

    state.showCosts = true;
    const shown = await (await getExport(request("export"))).text();
    expect(shown.split("\n")[0]).toContain("cost_usd");
  });
});
