import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ShopperUsage, UsageToolLine } from "@/lib/billing/usage-report";
import type { UsageReportPayload } from "../types";
import { FilterBar } from "./filter-bar";
import { KpiRow } from "./kpi-row";
import { ShoppersTable } from "./shoppers-table";
import { ToolBreakdownTable } from "./tool-breakdown-table";

const filters = {
  range: "cycle",
  source: "all",
  tool: "all",
  bucket: "day",
  view: "usd" as const,
  from: "",
  to: "",
  page: 0,
  shopper: "",
};

const shopper: ShopperUsage = {
  sessionId: "abc-123",
  source: "store",
  email: null,
  chatCalls: 4,
  chatUnits: 2,
  searches: 2,
  searchUnits: 2,
  tryOnCount: 1,
  tryOnUnits: 1,
  avatarCount: 0,
  avatarUnits: 0,
  liveEvents: 0,
  liveSeconds: 0,
  firstSeen: null,
  lastSeen: null,
};

const tools: UsageToolLine[] = [
  { tool: "chat", quantity: 4, units: 2 },
  { tool: "search", quantity: 2, units: 2 },
  { tool: "try_on", quantity: 1, units: 1 },
  { tool: "avatar", quantity: 3, units: 3 },
  { tool: "live", quantity: 0, units: 0 },
];

const hiddenReport: UsageReportPayload = {
  generatedAt: "2026-10-19T00:00:00.000Z",
  range: {
    preset: "cycle",
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-19T00:00:00.000Z",
    previousFrom: "2026-09-01T00:00:00.000Z",
    previousTo: "2026-10-01T00:00:00.000Z",
    bucket: "day",
    source: "all",
    tool: "all",
    timeZone: "UTC",
  },
  showCosts: false,
  shopperCount: 7,
  previousShopperCount: 5,
  seriesUnits: [],
  tools,
};

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("usage page with costs hidden", () => {
  it("swaps the dollar cards for four quantity cards", () => {
    const markup = html(createElement(KpiRow, { report: hiddenReport, summary: null, loading: false }));
    for (const label of ["Active shoppers", "Conversations", "Catalog searches", "Try-ons and avatars"]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toMatch(/Spend|Cost per shopper|Projected this cycle|\$\d/);
    // 4 cards: shoppers 7, conversations 4, searches 2, try-ons + avatars 1 + 3.
    expect(markup.match(/font-display font-extrabold/g)).toHaveLength(4);
    expect(markup).toContain(">7<");
    expect(markup).toContain(">4<");
    expect(markup).toContain(">2<");
  });

  it("drops the cost, share and change columns from the tool table", () => {
    const markup = html(createElement(ToolBreakdownTable, { lines: tools, showCosts: false }));
    expect(markup).toContain("Usage by tool");
    for (const heading of ["Tool", "Quantity", "Units"]) expect(markup).toContain(heading);
    expect(markup).not.toMatch(/>Cost<|>Share<|>Change<|Spend by tool|\$\d/);
    expect(markup).not.toContain("NaN");
    // The idle live line stays hidden, the four used tools show.
    expect(markup.match(/<tr /g)).toHaveLength(1 + 4);
  });

  it("drops the cost column from the shoppers table", () => {
    const markup = html(
      createElement(ShoppersTable, {
        shoppers: [shopper],
        shopperCount: 1,
        showCosts: false,
        page: 0,
        pageSize: 25,
        onPage: () => {},
        onOpen: () => {},
      })
    );
    expect(markup).toContain("Most recent first");
    expect(markup).not.toMatch(/>Cost<|\$\d|Highest spend/);
    expect(markup.match(/<th /g)).toHaveLength(8);
    expect(markup.match(/<td /g)).toHaveLength(8);
  });

  it("hides the Dollars and Units toggle", () => {
    const markup = html(createElement(FilterBar, { filters, generatedAt: null, showCosts: false, onChange: () => {} }));
    expect(markup).not.toMatch(/Dollars|>Units</);
    expect(markup).toContain("Group by");
  });
});

describe("usage page with costs shown", () => {
  const shownReport: UsageReportPayload = {
    ...hiddenReport,
    showCosts: true,
    spendNanos: 10_000_000,
    previousSpendNanos: 5_000_000,
    changePercent: 100,
    seriesNanos: [],
    tools: tools.map((line) => ({ ...line, costNanos: 1_000_000, share: 0.25, changePercent: 10 })),
  };

  it("keeps the dollar cards", () => {
    const markup = html(createElement(KpiRow, { report: shownReport, summary: null, loading: false }));
    for (const label of ["Spend", "Active shoppers", "Cost per shopper", "Projected this cycle"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("$0.01");
  });

  it("keeps cost, share and change in the tool table and the cost column in the shoppers table", () => {
    const toolMarkup = html(createElement(ToolBreakdownTable, { lines: shownReport.tools, showCosts: true }));
    expect(toolMarkup).toMatch(/>Cost<[\s\S]*>Share<[\s\S]*>Change</);
    const shopperMarkup = html(
      createElement(ShoppersTable, {
        shoppers: [{ ...shopper, costNanos: 10_000_000 }],
        shopperCount: 1,
        showCosts: true,
        page: 0,
        pageSize: 25,
        onPage: () => {},
        onOpen: () => {},
      })
    );
    expect(shopperMarkup).toContain(">Cost<");
    expect(shopperMarkup).toContain("Highest spend first");
  });

  it("shows the Dollars and Units toggle", () => {
    const markup = html(createElement(FilterBar, { filters, generatedAt: null, showCosts: true, onChange: () => {} }));
    expect(markup).toContain("Dollars");
    expect(markup).toContain("Units");
  });
});
