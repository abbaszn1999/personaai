import {
  GARMENT_UNIT_NANOS,
  LIVE_SECOND_NANOS,
  SESSION_UNIT_NANOS,
} from "./pricing";

export const USAGE_TOOLS = ["chat", "search", "try_on", "avatar", "live"] as const;
export type UsageTool = (typeof USAGE_TOOLS)[number];
export type UsageSourceFilter = "all" | "store" | "preview";
export type UsageBucket = "day" | "week";
export type UsageRangePreset = "cycle" | "previous" | "7d" | "30d" | "90d" | "custom";

export const UNATTRIBUTED_SESSION_ID = "__unattributed__";
const MAX_RANGE_MS = 366 * 86_400_000;
const DAY_MS = 86_400_000;

export interface UsageAggregateRow {
  bucket: string;
  tool: UsageTool;
  quantity: number;
  units: number;
  nanos: number;
}

export interface ShopperUsage {
  /** `acct:<id>` for a signed-in shopper (all their sessions together), else the browser session. */
  sessionId: string | null;
  source: "store" | "preview" | null;
  email: string | null;
  chatCalls: number;
  chatUnits: number;
  searches: number;
  searchUnits: number;
  tryOnCount: number;
  tryOnUnits: number;
  avatarCount: number;
  avatarUnits: number;
  liveEvents: number;
  liveSeconds: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface ToolBreakdownLine {
  tool: UsageTool;
  quantity: number;
  units: number;
  costNanos: number;
  share: number;
  changePercent: number | null;
}

export interface UsageSeriesPoint {
  bucket: string;
  chat: number;
  search: number;
  try_on: number;
  avatar: number;
  live: number;
}

export function isUsageTool(value: string): value is UsageTool {
  return (USAGE_TOOLS as readonly string[]).includes(value);
}

/** Billed nano-dollars for a tool. Session chat and search share the session-unit price. */
export function toolCostNanos(tool: UsageTool, units: number): number {
  const whole = Number.isFinite(units) ? Math.max(0, Math.floor(units)) : 0;
  if (tool === "chat" || tool === "search") return whole * SESSION_UNIT_NANOS;
  if (tool === "live") return whole * LIVE_SECOND_NANOS;
  return whole * GARMENT_UNIT_NANOS;
}

export function shopperCostNanos(shopper: ShopperUsage): number {
  return (
    toolCostNanos("chat", shopper.chatUnits) +
    toolCostNanos("search", shopper.searchUnits) +
    toolCostNanos("try_on", shopper.tryOnUnits) +
    toolCostNanos("avatar", shopper.avatarUnits) +
    toolCostNanos("live", shopper.liveSeconds)
  );
}

export function projectedCycleCostNanos(input: {
  sessionUnits: number;
  garmentUnits: number;
  liveMinutes: number;
}): number {
  const sessions = Number.isFinite(input.sessionUnits) ? Math.max(0, input.sessionUnits) : 0;
  const garments = Number.isFinite(input.garmentUnits) ? Math.max(0, input.garmentUnits) : 0;
  const minutes = Number.isFinite(input.liveMinutes) ? Math.max(0, input.liveMinutes) : 0;
  return sessions * SESSION_UNIT_NANOS + garments * GARMENT_UNIT_NANOS + minutes * 60 * LIVE_SECOND_NANOS;
}

export function changePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function costPerShopperNanos(costNanos: number, shoppers: number): number | null {
  if (!Number.isFinite(shoppers) || shoppers <= 0) return null;
  if (!Number.isFinite(costNanos) || costNanos < 0) return null;
  return costNanos / shoppers;
}

export function formatUsdFromNanos(nanos: number): string {
  const dollars = (Number.isFinite(nanos) ? nanos : 0) / 1_000_000_000;
  const abs = Math.abs(dollars);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}

export function shopperLabel(shopper: Pick<ShopperUsage, "sessionId" | "source" | "email">): string {
  if (shopper.email) return shopper.email;
  if (!shopper.sessionId) return "Unattributed (before tracking)";
  const short = shopper.sessionId.replace(/-/g, "").slice(0, 6);
  if (shopper.source === "preview") return `Preview #${short}`;
  return `Guest #${short}`;
}

export function shopperKey(sessionId: string | null): string {
  return sessionId ?? UNATTRIBUTED_SESSION_ID;
}

function zonedDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isoMonday(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

/** Local calendar buckets that overlap [from, to). Weeks start on Monday, matching Postgres. */
export function enumerateBuckets(
  fromIso: string,
  toIso: string,
  bucket: UsageBucket,
  timeZone: string
): string[] {
  const start = new Date(fromIso).getTime();
  const end = new Date(toIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const zone = timeZone || "UTC";
  const dates = new Set<string>();
  for (let cursor = start; cursor < end; cursor += 12 * 60 * 60 * 1000) {
    dates.add(zonedDateKey(new Date(cursor), zone));
  }
  dates.add(zonedDateKey(new Date(end - 1), zone));
  const sorted = [...dates].sort();
  if (bucket === "day") return sorted;
  return [...new Set(sorted.map(isoMonday))].sort();
}

export function fillSeries(
  rows: UsageAggregateRow[],
  buckets: string[],
  metric: "nanos" | "units",
  tools: readonly UsageTool[] = USAGE_TOOLS
): UsageSeriesPoint[] {
  const byBucket = new Map<string, UsageSeriesPoint>();
  for (const bucket of buckets) {
    byBucket.set(bucket, { bucket, chat: 0, search: 0, try_on: 0, avatar: 0, live: 0 });
  }
  for (const row of rows) {
    if (!tools.includes(row.tool)) continue;
    const point = byBucket.get(row.bucket);
    if (!point) continue;
    point[row.tool] += metric === "units" ? row.units : toolCostNanos(row.tool, row.units);
  }
  return buckets.map((bucket) => byBucket.get(bucket)!);
}

export function toolBreakdown(current: UsageAggregateRow[], previous: UsageAggregateRow[]): ToolBreakdownLine[] {
  const sum = (rows: UsageAggregateRow[], tool: UsageTool) =>
    rows.filter((row) => row.tool === tool).reduce(
      (acc, row) => {
        acc.quantity += row.quantity;
        acc.units += row.units;
        return acc;
      },
      { quantity: 0, units: 0 }
    );
  const lines = USAGE_TOOLS.map((tool) => {
    const now = sum(current, tool);
    const before = sum(previous, tool);
    return {
      tool,
      quantity: now.quantity,
      units: now.units,
      costNanos: toolCostNanos(tool, now.units),
      share: 0,
      changePercent: changePercent(toolCostNanos(tool, now.units), toolCostNanos(tool, before.units)),
    };
  });
  const total = lines.reduce((acc, line) => acc + line.costNanos, 0);
  for (const line of lines) {
    line.share = total > 0 ? line.costNanos / total : 0;
  }
  return lines;
}

export function totalCostNanos(rows: UsageAggregateRow[], tool: UsageTool | "all" = "all"): number {
  return rows
    .filter((row) => tool === "all" || row.tool === tool)
    .reduce((sum, row) => sum + toolCostNanos(row.tool, row.units), 0);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - date.getTime();
}

export function zonedDayStart(isoDate: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  const guess = Date.UTC(year, month - 1, day);
  const offset = timeZoneOffsetMs(new Date(guess), timeZone);
  let result = guess - offset;
  const corrected = timeZoneOffsetMs(new Date(result), timeZone);
  if (corrected !== offset) result = guess - corrected;
  return new Date(result);
}

export interface ResolvedUsageRange {
  preset: UsageRangePreset;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucket: UsageBucket;
  source: UsageSourceFilter;
  tool: UsageTool | "all";
  timeZone: string;
}

export function resolveUsageRange(input: {
  preset: string | null;
  bucket: string | null;
  source: string | null;
  tool: string | null;
  timeZone: string | null;
  customFrom: string | null;
  customTo: string | null;
  now: Date;
  cycleStart: Date;
  cycleEnd: Date;
}): ResolvedUsageRange | { error: string } {
  const preset = (input.preset || "cycle") as UsageRangePreset;
  if (!["cycle", "previous", "7d", "30d", "90d", "custom"].includes(preset)) {
    return { error: "Unknown range" };
  }
  const bucket: UsageBucket = input.bucket === "week" ? "week" : "day";
  if (input.bucket && input.bucket !== "day" && input.bucket !== "week") return { error: "Unknown bucket" };
  const source = (input.source || "all") as UsageSourceFilter;
  if (!["all", "store", "preview"].includes(source)) return { error: "Unknown source" };
  const tool = input.tool && input.tool !== "all" ? input.tool : "all";
  if (tool !== "all" && !isUsageTool(tool)) return { error: "Unknown tool" };
  const timeZone = input.timeZone && isSafeTimeZone(input.timeZone) ? input.timeZone : "UTC";

  let from: Date;
  let to: Date;
  if (preset === "cycle") {
    from = input.cycleStart;
    to = new Date(Math.min(input.now.getTime(), input.cycleEnd.getTime()));
    if (to.getTime() < from.getTime()) to = from;
  } else if (preset === "previous") {
    const length = Math.max(input.cycleEnd.getTime() - input.cycleStart.getTime(), 0);
    to = input.cycleStart;
    from = new Date(input.cycleStart.getTime() - length);
  } else if (preset === "custom") {
    const start = input.customFrom ? zonedDayStart(input.customFrom, timeZone) : null;
    const endDay = input.customTo ? zonedDayStart(input.customTo, timeZone) : null;
    if (!start || !endDay) return { error: "Custom range needs a start and end date" };
    from = start;
    to = new Date(endDay.getTime() + DAY_MS);
    if (to.getTime() <= from.getTime()) return { error: "The end date is before the start date" };
  } else {
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    to = input.now;
    from = new Date(input.now.getTime() - days * DAY_MS);
  }

  if (to.getTime() - from.getTime() > MAX_RANGE_MS) return { error: "Range cannot exceed 366 days" };
  const length = to.getTime() - from.getTime();
  return {
    preset,
    from,
    to,
    previousFrom: new Date(from.getTime() - length),
    previousTo: from,
    bucket,
    source,
    tool,
    timeZone,
  };
}

function isSafeTimeZone(value: string): boolean {
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function dollars(nanos: number): string {
  return (nanos / 1_000_000_000).toFixed(6);
}

export function usageCsv(input: { rows: UsageAggregateRow[]; shoppers: ShopperUsage[] }): string {
  const lines = ["section,bucket,tool,session,source,quantity,units,cost_usd"];
  const trend = [...input.rows].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.tool.localeCompare(b.tool));
  for (const row of trend) {
    if (row.quantity === 0 && row.units === 0) continue;
    lines.push(
      ["trend", row.bucket, row.tool, "", "", row.quantity, row.units, dollars(toolCostNanos(row.tool, row.units))]
        .map(csvCell)
        .join(",")
    );
  }
  for (const shopper of input.shoppers) {
    const rows: Array<[UsageTool, number, number]> = [
      ["chat", shopper.chatCalls, shopper.chatUnits],
      ["search", shopper.searches, shopper.searchUnits],
      ["try_on", shopper.tryOnCount, shopper.tryOnUnits],
      ["avatar", shopper.avatarCount, shopper.avatarUnits],
      ["live", shopper.liveEvents, shopper.liveSeconds],
    ];
    for (const [tool, quantity, units] of rows) {
      if (quantity === 0 && units === 0) continue;
      lines.push(
        [
          "shopper",
          "",
          tool,
          shopperLabel(shopper),
          shopper.source ?? "",
          quantity,
          units,
          dollars(toolCostNanos(tool, units)),
        ].map(csvCell).join(",")
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
