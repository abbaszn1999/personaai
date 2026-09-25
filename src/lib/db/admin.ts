import { db } from "@/lib/supabase/server";
import { pickCurrentSubscription } from "@/lib/billing/current-subscription";
import { getAccountBillingContext } from "@/lib/billing/account";
import { summarizeGmv } from "@/lib/db/gmv";
import { addImageCredits, addLiveTryOnMinutes } from "@/lib/db/users";
import type { PlanTierId } from "@/modules/billing/types";

const MAIN_MONTHLY_USD = 1500;
const PAGE_SIZE_MAX = 50;

export interface MerchantListRow {
  id: string;
  email: string;
  name: string;
  storeName: string | null;
  storeStatus: string;
  tierId: string | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  credits: number;
  sessionUnits: number;
  liveSeconds: number;
  sessionsLeft: number;
  liveMinutesLeft: number;
  garmentsLeft: number;
  embedEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantListResult {
  rows: MerchantListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminOverview {
  merchants: number;
  activeSubscriptions: number;
  trials: number;
  pastDue: number;
  mrrUsd: number;
  churned30d: number;
  churnRate: number;
  signupsByDay: { day: string; count: number }[];
}

export interface AuditEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

const USER_LIST_COLUMNS =
  "id, email, first_name, last_name, store_name, store_status, credits, session_units_balance, live_tryon_seconds_balance, embed_enabled, created_at, updated_at";

function cleanSearch(value: string): string {
  return value.replace(/[%_,.()]/g, " ").trim().slice(0, 80);
}

function displayName(row: { first_name: string | null; last_name: string | null; email: string }): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email;
}

interface SubSnap {
  userId: string;
  tierId: PlanTierId;
  status: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
}

async function subscriptionsFor(userIds: string[]): Promise<Map<string, SubSnap>> {
  const map = new Map<string, SubSnap>();
  if (userIds.length === 0) return map;
  const { data, error } = await db
    .from("billing_subscriptions")
    .select("user_id, tier_id, status, current_period_end, cancel_at_period_end, updated_at")
    .in("user_id", userIds);
  if (error || !data) {
    if (error) console.error("[db/admin subscriptionsFor]", error);
    return map;
  }
  const grouped = new Map<string, SubSnap[]>();
  for (const row of data) {
    const userId = row.user_id as string | null;
    if (!userId) continue;
    const snap: SubSnap = {
      userId,
      tierId: (row.tier_id as PlanTierId) ?? "trial",
      status: String(row.status),
      periodEnd: (row.current_period_end as string | null) ?? null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      updatedAt: String(row.updated_at ?? ""),
    };
    const list = grouped.get(userId) ?? [];
    list.push(snap);
    grouped.set(userId, list);
  }
  for (const [userId, rows] of grouped) {
    const picked = pickCurrentSubscription(rows);
    if (picked) map.set(userId, picked);
  }
  return map;
}

async function userIdsForTier(tier: string): Promise<string[] | null> {
  if (tier !== "trial" && tier !== "main") return null;
  const { data, error } = await db
    .from("billing_subscriptions")
    .select("user_id, tier_id, status, updated_at")
    .eq("tier_id", tier)
    .in("status", ["active", "trialing", "past_due", "incomplete"]);
  if (error || !data) return [];
  const ids = new Set<string>();
  for (const row of data) {
    if (row.user_id) ids.add(row.user_id as string);
  }
  return [...ids];
}

async function userIdsForTrialUsed(used: boolean): Promise<string[]> {
  let query = db.from("billing_accounts").select("user_id");
  query = used ? query.not("trial_used_at", "is", null) : query.is("trial_used_at", null);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => row.user_id as string);
}

export async function listMerchants(input: {
  search?: string;
  status?: string;
  tier?: string;
  trialUsed?: "yes" | "no" | "";
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<MerchantListResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, input.pageSize ?? 20));
  const sortColumn = input.sort === "email" || input.sort === "store_name" ? input.sort : "created_at";
  const ascending = input.dir === "asc";

  const filters: string[][] = [];
  if (input.tier) filters.push((await userIdsForTier(input.tier)) ?? []);
  if (input.trialUsed === "yes" || input.trialUsed === "no") {
    filters.push(await userIdsForTrialUsed(input.trialUsed === "yes"));
  }
  const restrict = filters.length === 0
    ? null
    : filters.reduce((left, right) => left.filter((id) => right.includes(id)));
  if (restrict && restrict.length === 0) {
    return { rows: [], total: 0, page, pageSize };
  }

  let query = db.from("users").select(USER_LIST_COLUMNS, { count: "exact" });
  const search = cleanSearch(input.search ?? "");
  if (search) {
    query = query.or(`email.ilike.%${search}%,store_name.ilike.%${search}%`);
  }
  if (input.status && ["draft", "active", "paused"].includes(input.status)) {
    query = query.eq("store_status", input.status);
  }
  if (restrict) query = query.in("id", restrict);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order(sortColumn, { ascending })
    .range(from, from + pageSize - 1);

  if (error || !data) {
    console.error("[db/admin listMerchants]", error);
    return { rows: [], total: 0, page, pageSize };
  }

  const subs = await subscriptionsFor(data.map((row) => row.id as string));
  const contexts = await Promise.all(
    data.map((row) =>
      subs.get(row.id as string) ? getAccountBillingContext(row.id as string) : Promise.resolve(null)
    )
  );
  const rows: MerchantListRow[] = data.map((row, index) => {
    const sub = subs.get(row.id as string);
    const billing = contexts[index];
    const sessionsLeft = billing
      ? Math.max(billing.tier.monthlySessionUnits - billing.sessionUnitsUsedThisCycle, 0)
      : Number(row.session_units_balance ?? 0);
    const liveMinutesLeft = billing
      ? Math.round(Math.max(billing.tier.monthlyLiveTryOnSeconds - billing.liveTryOnSecondsUsedThisCycle, 0) / 60)
      : Math.round(Number(row.live_tryon_seconds_balance ?? 0) / 60);
    const garmentsLeft = billing
      ? Math.max(billing.tier.monthlyGarmentUnits - billing.imagesUsedThisCycle, 0)
      : Number(row.credits ?? 0);
    return {
      id: row.id as string,
      email: row.email as string,
      name: displayName(row as { first_name: string | null; last_name: string | null; email: string }),
      storeName: (row.store_name as string | null) ?? null,
      storeStatus: (row.store_status as string | null) ?? "draft",
      tierId: sub?.tierId ?? null,
      subscriptionStatus: sub?.status ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      periodEnd: sub?.periodEnd ?? null,
      credits: Number(row.credits ?? 0),
      sessionUnits: Number(row.session_units_balance ?? 0),
      liveSeconds: Number(row.live_tryon_seconds_balance ?? 0),
      sessionsLeft,
      liveMinutesLeft,
      garmentsLeft,
      embedEnabled: Boolean(row.embed_enabled),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize };
}

export async function getMerchantDetail(userId: string) {
  const billing = await getAccountBillingContext(userId);
  if (!billing) return null;
  const { data: store } = await db
    .from("users")
    .select("store_name, store_status, embed_enabled")
    .eq("id", userId)
    .maybeSingle();
  const since = billing.cycleStartIso;
  const [gmv, chats, carts, tryOns] = await Promise.all([
    summarizeGmv(userId, since).catch(() => ({ netUsdCents: 0, refundsUsdCents: 0 })),
    db.from("chat_events").select("id, role, topic, created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(8),
    db.from("cart_events").select("id, product_name, price, currency, success, created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(8),
    db.from("try_on_events").select("id, product_name, recommended_size, created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(8),
  ]);
  const user = billing.user;
  return {
    id: user.id,
    email: user.email,
    name: displayName(user),
    storeName: (store?.store_name as string | null) ?? null,
    storeStatus: (store?.store_status as string | null) ?? "draft",
    embedEnabled: Boolean(store?.embed_enabled),
    createdAt: user.created_at,
    provider: user.provider,
    tier: billing.tier,
    subscription: billing.subscription,
    entitlementStatus: billing.entitlementStatus,
    entitled: billing.entitled,
    cycleStartIso: billing.cycleStartIso,
    cycleEndIso: billing.cycleEndIso,
    imagesUsed: billing.imagesUsedThisCycle,
    liveUsedSeconds: billing.liveTryOnSecondsUsedThisCycle,
    sessionsUsed: billing.sessionUnitsUsedThisCycle,
    credits: user.credits,
    sessionUnits: user.session_units_balance ?? 0,
    liveSeconds: user.live_tryon_seconds_balance ?? 0,
    gmv,
    chats: chats.data ?? [],
    carts: carts.data ?? [],
    tryOns: tryOns.data ?? [],
  };
}

export async function getAdminOverviewMetrics(): Promise<AdminOverview> {
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [merchantCount, liveSubs, churnedCount, signupRows] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }),
    db.from("billing_subscriptions").select("user_id, tier_id, status, updated_at").in("status", ["active", "trialing", "past_due", "incomplete"]),
    db.from("billing_subscriptions").select("id", { count: "exact", head: true }).gte("canceled_at", sinceIso),
    db.from("users").select("created_at").gte("created_at", sinceIso),
  ]);

  const grouped = new Map<string, { tierId: PlanTierId; status: string; updatedAt: string }[]>();
  for (const row of liveSubs.data ?? []) {
    const userId = row.user_id as string | null;
    if (!userId) continue;
    const list = grouped.get(userId) ?? [];
    list.push({
      tierId: (row.tier_id as PlanTierId) ?? "trial",
      status: String(row.status),
      updatedAt: String(row.updated_at ?? ""),
    });
    grouped.set(userId, list);
  }

  let activeSubscriptions = 0;
  let trials = 0;
  let pastDue = 0;
  let mrrUsd = 0;
  for (const rows of grouped.values()) {
    const current = pickCurrentSubscription(rows);
    if (!current) continue;
    activeSubscriptions += 1;
    if (current.tierId === "trial") trials += 1;
    if (current.tierId === "main" && current.status !== "incomplete") mrrUsd += MAIN_MONTHLY_USD;
    if (current.status === "past_due") pastDue += 1;
  }

  const churned30d = churnedCount.count ?? 0;
  const churnRate = activeSubscriptions + churned30d === 0 ? 0 : churned30d / (activeSubscriptions + churned30d);

  const buckets = new Map<string, number>();
  for (let i = 0; i < 30; i += 1) {
    const day = new Date(since.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    buckets.set(day, 0);
  }
  for (const row of signupRows.data ?? []) {
    const day = String(row.created_at).slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  return {
    merchants: merchantCount.count ?? 0,
    activeSubscriptions,
    trials,
    pastDue,
    mrrUsd,
    churned30d,
    churnRate,
    signupsByDay: [...buckets.entries()].map(([day, count]) => ({ day, count })),
  };
}

export async function deleteMerchant(userId: string): Promise<boolean> {
  const { error } = await db.rpc("admin_delete_user", { p_user_id: userId });
  if (error) {
    console.error("[db/admin deleteMerchant]", error);
    return false;
  }
  return true;
}

export async function grantSessionUnits(userId: string, units: number): Promise<number | null> {
  const { data, error } = await db.from("users").select("session_units_balance").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  const next = Number(data.session_units_balance ?? 0) + units;
  const { error: updateError } = await db
    .from("users")
    .update({ session_units_balance: next, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateError) {
    console.error("[db/admin grantSessionUnits]", updateError);
    return null;
  }
  return next;
}

export async function grantWallet(input: {
  userId: string;
  wallet: "garments" | "live" | "sessions";
  amount: number;
}): Promise<number | null> {
  if (input.wallet === "garments") return addImageCredits(input.userId, input.amount);
  if (input.wallet === "live") return addLiveTryOnMinutes(input.userId, input.amount);
  return grantSessionUnits(input.userId, input.amount);
}

export async function writeAuditLog(entry: {
  adminEmail: string;
  action: string;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await db.from("admin_audit_log").insert({
    admin_email: entry.adminEmail,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    details: entry.details ?? {},
  });
  if (error) console.error("[db/admin writeAuditLog]", error);
}

export async function listAuditLog(page = 1, pageSize = 30): Promise<{ rows: AuditEntry[]; total: number }> {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await db
    .from("admin_audit_log")
    .select("id, admin_email, action, target_user_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error || !data) {
    console.error("[db/admin listAuditLog]", error);
    return { rows: [], total: 0 };
  }
  return {
    total: count ?? data.length,
    rows: data.map((row) => ({
      id: row.id as string,
      adminEmail: row.admin_email as string,
      action: row.action as string,
      targetUserId: (row.target_user_id as string | null) ?? null,
      details: (row.details as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
    })),
  };
}
