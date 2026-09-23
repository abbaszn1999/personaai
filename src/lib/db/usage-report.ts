import { db } from "@/lib/supabase/server";
import {
  isUsageTool,
  shopperKey,
  type ShopperUsage,
  type UsageAggregateRow,
  type UsageBucket,
  type UsageSourceFilter,
  type UsageTool,
} from "@/lib/billing/usage-report";

function surface(value: unknown): "store" | "preview" | null {
  return value === "store" || value === "preview" ? value : null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKey(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

export async function queryUsageReport(input: {
  ownerId: string;
  fromIso: string;
  toIso: string;
  bucket: UsageBucket;
  timeZone: string;
  source: UsageSourceFilter;
}): Promise<UsageAggregateRow[]> {
  const { data, error } = await db.rpc("usage_report", {
    p_owner: input.ownerId,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_bucket: input.bucket,
    p_tz: input.timeZone,
    p_source: input.source,
  });
  if (error) {
    console.error("[db/usage-report queryUsageReport]", error);
    throw error;
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => isUsageTool(String(row.tool)))
    .map((row) => ({
      bucket: dayKey(row.bucket),
      tool: String(row.tool) as UsageTool,
      quantity: num(row.quantity),
      units: num(row.units),
      nanos: num(row.nanos),
    }));
}

export async function queryUsageSessions(input: {
  ownerId: string;
  fromIso: string;
  toIso: string;
  source: UsageSourceFilter;
  tool: UsageTool | "all";
  limit: number;
  offset: number;
  sessionId?: string | null;
}): Promise<{ shoppers: ShopperUsage[]; shopperCount: number }> {
  const { data, error } = await db.rpc("usage_top_sessions", {
    p_owner: input.ownerId,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_source: input.source,
    p_tool: input.tool,
    p_limit: input.limit,
    p_offset: input.offset,
    p_session_id: input.sessionId ?? null,
  });
  if (error) {
    console.error("[db/usage-report queryUsageSessions]", error);
    throw error;
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const shoppers = rows.map((row) => ({
    sessionId: (row.session_id as string | null) ?? null,
    source: surface(row.source),
    email: (row.shopper_email as string | null) ?? null,
    chatCalls: num(row.chat_calls),
    chatUnits: num(row.chat_units),
    searches: num(row.searches),
    searchUnits: num(row.search_units),
    tryOnCount: num(row.try_on_count),
    tryOnUnits: num(row.try_on_units),
    avatarCount: num(row.avatar_count),
    avatarUnits: num(row.avatar_units),
    liveEvents: num(row.live_events),
    liveSeconds: num(row.live_seconds),
    firstSeen: (row.first_seen as string | null) ?? null,
    lastSeen: (row.last_seen as string | null) ?? null,
  }));
  return {
    shoppers,
    shopperCount: rows.length > 0 ? num(rows[0].shopper_count) : 0,
  };
}

export function sessionFilterId(sessionId: string | null): string {
  return shopperKey(sessionId);
}
