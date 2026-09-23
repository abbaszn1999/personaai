import type { ShopperUsage, ToolBreakdownLine, UsageSeriesPoint } from "@/lib/billing/usage-report";

export interface UsageReportPayload {
  generatedAt: string;
  range: {
    preset: string;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    bucket: "day" | "week";
    source: string;
    tool: string;
    timeZone: string;
  };
  spendNanos: number;
  previousSpendNanos: number;
  changePercent: number | null;
  shopperCount: number;
  previousShopperCount: number;
  seriesNanos: UsageSeriesPoint[];
  seriesUnits: UsageSeriesPoint[];
  tools: ToolBreakdownLine[];
}

export interface UsageSessionsPayload {
  shoppers: ShopperUsage[];
  shopperCount: number;
  page: number;
  pageSize: number;
}
