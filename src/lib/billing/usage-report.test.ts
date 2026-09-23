import { describe, expect, it } from "vitest";
import {
  changePercent,
  costPerShopperNanos,
  enumerateBuckets,
  fillSeries,
  formatUsdFromNanos,
  projectedCycleCostNanos,
  resolveUsageRange,
  shopperCostNanos,
  shopperLabel,
  toolBreakdown,
  toolCostNanos,
  totalCostNanos,
  usageCsv,
  type ShopperUsage,
  type UsageAggregateRow,
} from "./usage-report";

const row = (partial: Partial<UsageAggregateRow> & Pick<UsageAggregateRow, "tool" | "units">): UsageAggregateRow => ({
  bucket: "2026-09-01",
  quantity: 1,
  nanos: 0,
  ...partial,
});

describe("tool prices", () => {
  it("prices each tool from the same unit the invoice uses", () => {
    expect(toolCostNanos("chat", 1)).toBe(2_500_000);
    expect(toolCostNanos("search", 4)).toBe(10_000_000);
    expect(toolCostNanos("try_on", 1)).toBe(8_000_000);
    expect(toolCostNanos("avatar", 2)).toBe(16_000_000);
    expect(toolCostNanos("live", 60)).toBe(1_200_000_000);
  });

  it("formats small session costs with extra digits and minutes as dollars", () => {
    expect(formatUsdFromNanos(2_500_000)).toBe("$0.0025");
    expect(formatUsdFromNanos(1_200_000_000)).toBe("$1.20");
  });

  it("projects a cycle from the three wallet totals", () => {
    expect(projectedCycleCostNanos({ sessionUnits: 1000, garmentUnits: 100, liveMinutes: 1 })).toBe(
      1000 * 2_500_000 + 100 * 8_000_000 + 60 * 20_000_000
    );
  });
});

describe("comparisons", () => {
  it("returns null when the previous period had no spend", () => {
    expect(changePercent(10, 0)).toBeNull();
    expect(changePercent(0, 0)).toBe(0);
    expect(changePercent(15, 10)).toBe(50);
  });

  it("does not invent a cost per shopper when nobody showed up", () => {
    expect(costPerShopperNanos(10, 0)).toBeNull();
    expect(costPerShopperNanos(10, 2)).toBe(5);
  });
});

describe("series", () => {
  it("fills missing days with zero and keeps billed nanos", () => {
    const rows = [row({ bucket: "2026-09-02", tool: "chat", units: 2, quantity: 3 })];
    const series = fillSeries(rows, ["2026-09-01", "2026-09-02"], "nanos");
    expect(series[0]).toMatchObject({ bucket: "2026-09-01", chat: 0, live: 0 });
    expect(series[1].chat).toBe(5_000_000);
  });

  it("enumerates UTC days and Monday weeks", () => {
    expect(enumerateBuckets("2026-09-23T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "day", "UTC")).toEqual([
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(enumerateBuckets("2026-09-23T00:00:00.000Z", "2026-09-25T00:00:00.000Z", "week", "UTC")).toEqual([
      "2026-09-21",
    ]);
  });

  it("shares spend across tools and compares with the previous window", () => {
    const current = [row({ tool: "chat", units: 1 }), row({ tool: "live", units: 60 })];
    const previous = [row({ tool: "chat", units: 2 })];
    const lines = toolBreakdown(current, previous);
    const chat = lines.find((line) => line.tool === "chat")!;
    const live = lines.find((line) => line.tool === "live")!;
    expect(totalCostNanos(current)).toBe(chat.costNanos + live.costNanos);
    expect(chat.share + live.share).toBeCloseTo(1);
    expect(chat.changePercent).toBe(-50);
    expect(live.changePercent).toBeNull();
  });
});

describe("shoppers and csv", () => {
  const shopper: ShopperUsage = {
    sessionId: "abc-123",
    source: "store",
    chatCalls: 2,
    chatUnits: 1,
    searches: 0,
    searchUnits: 0,
    tryOnCount: 0,
    tryOnUnits: 0,
    avatarCount: 0,
    avatarUnits: 0,
    liveEvents: 0,
    liveSeconds: 0,
    firstSeen: null,
    lastSeen: null,
  };

  it("labels store, preview, and unattributed sessions", () => {
    expect(shopperLabel("abc-123", "store")).toBe("Shopper #abc123");
    expect(shopperLabel("abc-123", "preview")).toBe("Preview #abc123");
    expect(shopperLabel(null, null)).toBe("Unattributed (before tracking)");
    expect(shopperCostNanos(shopper)).toBe(2_500_000);
  });

  it("quotes commas and keeps units next to dollars", () => {
    const csv = usageCsv({
      rows: [row({ tool: "chat", units: 1, quantity: 2, bucket: "2026-09-01" })],
      shoppers: [{ ...shopper, sessionId: "a,b" }],
    });
    expect(csv).toContain("trend,2026-09-01,chat,,,2,1,0.002500");
    expect(csv).toContain('"Shopper #a,b"');
  });
});

describe("resolveUsageRange", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");
  const cycleStart = new Date("2026-09-01T00:00:00.000Z");
  const cycleEnd = new Date("2026-10-01T00:00:00.000Z");

  it("clips the current cycle at now and mirrors it for the comparison window", () => {
    const range = resolveUsageRange({
      preset: "cycle",
      bucket: "day",
      source: "all",
      tool: "all",
      timeZone: "UTC",
      customFrom: null,
      customTo: null,
      now,
      cycleStart,
      cycleEnd,
    });
    expect("error" in range).toBe(false);
    if ("error" in range) return;
    expect(range.to.toISOString()).toBe(now.toISOString());
    expect(range.previousTo.toISOString()).toBe(cycleStart.toISOString());
  });

  it("treats a custom end date as inclusive and rejects an inverted range", () => {
    const range = resolveUsageRange({
      preset: "custom",
      bucket: "week",
      source: "store",
      tool: "live",
      timeZone: "UTC",
      customFrom: "2026-09-01",
      customTo: "2026-09-02",
      now,
      cycleStart,
      cycleEnd,
    });
    expect("error" in range).toBe(false);
    if ("error" in range) return;
    expect(range.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(range.tool).toBe("live");

    const inverted = resolveUsageRange({
      preset: "custom",
      bucket: null,
      source: null,
      tool: null,
      timeZone: "UTC",
      customFrom: "2026-09-05",
      customTo: "2026-09-01",
      now,
      cycleStart,
      cycleEnd,
    });
    expect(inverted).toEqual({ error: "The end date is before the start date" });
  });
});
