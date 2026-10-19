import type { ShopperUsage, UsageSeriesPoint, UsageToolLine } from "@/lib/billing/usage-report";

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
  /** False when an admin has hidden costs for this merchant. The cost fields below are then absent. */
  showCosts: boolean;
  spendNanos?: number;
  previousSpendNanos?: number;
  changePercent?: number | null;
  shopperCount: number;
  previousShopperCount: number;
  seriesNanos?: UsageSeriesPoint[];
  seriesUnits: UsageSeriesPoint[];
  tools: UsageToolLine[];
}

export interface UsageSessionsPayload {
  shoppers: ShopperUsage[];
  showCosts?: boolean;
  shopperCount: number;
  page: number;
  pageSize: number;
}
