import { db } from "@/lib/supabase/server";

export type GmvPlatform = "shopify" | "wordpress" | "woocommerce";
export type GmvKind = "sale" | "refund";
export type GmvMatchMethod = "line_tag" | "device_match";

export interface LedgerEntry {
  id: string;
  ownerId: string;
  platform: GmvPlatform;
  orderId: string;
  orderName: string | null;
  lineId: string;
  platformItemId: string | null;
  productName: string;
  kind: GmvKind;
  sourceKey: string;
  amountOriginal: number;
  currency: string;
  fxRate: number;
  amountUsdCents: number;
  sessionId: string | null;
  matchMethod: GmvMatchMethod;
  billable: boolean;
  occurredAt: string;
  chargeId: string | null;
}

export interface NewLedgerEntry {
  ownerId: string;
  platform: GmvPlatform;
  orderId: string;
  orderName: string | null;
  lineId: string;
  platformItemId: string | null;
  productName: string;
  kind: GmvKind;
  sourceKey: string;
  amountOriginal: number;
  currency: string;
  fxRate: number;
  amountUsdCents: number;
  sessionId: string | null;
  matchMethod: GmvMatchMethod;
  billable: boolean;
  occurredAt: string;
}

function mapEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    platform: row.platform as GmvPlatform,
    orderId: row.order_id as string,
    orderName: (row.order_name as string | null) ?? null,
    lineId: row.line_id as string,
    platformItemId: (row.platform_item_id as string | null) ?? null,
    productName: row.product_name as string,
    kind: row.kind as GmvKind,
    sourceKey: row.source_key as string,
    amountOriginal: Number(row.amount_original),
    currency: row.currency as string,
    fxRate: Number(row.fx_rate),
    amountUsdCents: Number(row.amount_usd_cents),
    sessionId: (row.session_id as string | null) ?? null,
    matchMethod: row.match_method as GmvMatchMethod,
    billable: Boolean(row.billable),
    occurredAt: row.occurred_at as string,
    chargeId: (row.charge_id as string | null) ?? null,
  };
}

/** Insert-once. A redelivered webhook hits the unique source key and changes nothing. */
export async function insertLedgerEntry(entry: NewLedgerEntry): Promise<void> {
  const { error } = await db.from("gmv_ledger").upsert(
    {
      owner_id: entry.ownerId,
      platform: entry.platform,
      order_id: entry.orderId,
      order_name: entry.orderName,
      line_id: entry.lineId,
      platform_item_id: entry.platformItemId,
      product_name: entry.productName,
      kind: entry.kind,
      source_key: entry.sourceKey,
      amount_original: entry.amountOriginal,
      currency: entry.currency,
      fx_rate: entry.fxRate,
      amount_usd_cents: entry.amountUsdCents,
      session_id: entry.sessionId,
      match_method: entry.matchMethod,
      billable: entry.billable,
      occurred_at: entry.occurredAt,
    },
    { onConflict: "owner_id,platform,source_key", ignoreDuplicates: true }
  );

  if (error) throw new Error(error.message);
}

const PAGE_SIZE = 1000;

async function fetchPages(
  load: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function listOrderEntries(ownerId: string, platform: string, orderId: string): Promise<LedgerEntry[]> {
  const rows = await fetchPages((from, to) =>
    db
      .from("gmv_ledger")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("platform", platform)
      .eq("order_id", orderId)
      .range(from, to)
  );
  return rows.map(mapEntry);
}

export async function listOpenBillableEntries(ownerId: string, untilIso: string): Promise<LedgerEntry[]> {
  const rows = await fetchPages((from, to) =>
    db
      .from("gmv_ledger")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("billable", true)
      .is("charge_id", null)
      .lte("occurred_at", untilIso)
      .range(from, to)
  );
  return rows.map(mapEntry);
}

export interface CommissionCharge {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  stripeInvoiceId: string | null;
  gmvUsdCents: number;
  commissionUsdCents: number;
  status: "pending" | "invoiced";
}

function mapCharge(row: Record<string, unknown>): CommissionCharge {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    idempotencyKey: row.idempotency_key as string,
    stripeInvoiceId: (row.stripe_invoice_id as string | null) ?? null,
    gmvUsdCents: Number(row.gmv_usd_cents),
    commissionUsdCents: Number(row.commission_usd_cents),
    status: row.status as "pending" | "invoiced",
  };
}

export async function getCommissionChargeByKey(idempotencyKey: string): Promise<CommissionCharge | null> {
  const { data, error } = await db
    .from("gmv_commission_charges")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCharge(data as Record<string, unknown>) : null;
}

export async function insertCommissionCharge(input: {
  ownerId: string;
  idempotencyKey: string;
  stripeInvoiceId: string | null;
}): Promise<CommissionCharge | null> {
  const { data, error } = await db
    .from("gmv_commission_charges")
    .insert({
      owner_id: input.ownerId,
      idempotency_key: input.idempotencyKey,
      stripe_invoice_id: input.stripeInvoiceId,
      gmv_usd_cents: 0,
      commission_usd_cents: 0,
      status: "pending",
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data ? mapCharge(data as Record<string, unknown>) : null;
}

export async function claimLedgerEntries(ids: string[], chargeId: string): Promise<void> {
  if (ids.length === 0) return;
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const { error } = await db.from("gmv_ledger").update({ charge_id: chargeId }).in("id", slice).is("charge_id", null);
    if (error) throw new Error(error.message);
  }
}

export async function listEntriesForCharge(chargeId: string): Promise<LedgerEntry[]> {
  const rows = await fetchPages((from, to) => db.from("gmv_ledger").select("*").eq("charge_id", chargeId).range(from, to));
  return rows.map(mapEntry);
}

export async function releaseCommissionCharge(chargeId: string): Promise<void> {
  const { error: clearError } = await db.from("gmv_ledger").update({ charge_id: null }).eq("charge_id", chargeId);
  if (clearError) throw new Error(clearError.message);
  const { error } = await db.from("gmv_commission_charges").delete().eq("id", chargeId).eq("status", "pending");
  if (error) throw new Error(error.message);
}

export async function finishCommissionCharge(input: {
  chargeId: string;
  stripeInvoiceId: string | null;
  gmvUsdCents: number;
  commissionUsdCents: number;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    gmv_usd_cents: input.gmvUsdCents,
    commission_usd_cents: input.commissionUsdCents,
    status: "invoiced",
  };
  if (input.stripeInvoiceId) patch.stripe_invoice_id = input.stripeInvoiceId;
  const { error } = await db.from("gmv_commission_charges").update(patch).eq("id", input.chargeId);
  if (error) throw new Error(error.message);
}

export interface GmvCycleSummary {
  netUsdCents: number;
  refundsUsdCents: number;
}

export async function summarizeGmv(ownerId: string, sinceIso: string): Promise<GmvCycleSummary> {
  const rows = await fetchPages((from, to) =>
    db.from("gmv_ledger").select("amount_usd_cents").eq("owner_id", ownerId).gte("occurred_at", sinceIso).range(from, to)
  );
  let netUsdCents = 0;
  let refundsUsdCents = 0;
  for (const row of rows) {
    const cents = Number(row.amount_usd_cents);
    netUsdCents += cents;
    if (cents < 0) refundsUsdCents += -cents;
  }
  return { netUsdCents, refundsUsdCents };
}

export interface RecentSale {
  orderName: string | null;
  orderId: string;
  productName: string;
  amountOriginal: number;
  currency: string;
  amountUsdCents: number;
  matchMethod: GmvMatchMethod;
  billable: boolean;
  chargeId: string | null;
  occurredAt: string;
}

export async function listRecentSales(ownerId: string, limit = 20): Promise<RecentSale[]> {
  const { data, error } = await db
    .from("gmv_ledger")
    .select("order_name, order_id, product_name, amount_original, currency, amount_usd_cents, match_method, billable, charge_id, occurred_at")
    .eq("owner_id", ownerId)
    .eq("kind", "sale")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      orderName: (record.order_name as string | null) ?? null,
      orderId: record.order_id as string,
      productName: record.product_name as string,
      amountOriginal: Number(record.amount_original),
      currency: record.currency as string,
      amountUsdCents: Number(record.amount_usd_cents),
      matchMethod: record.match_method as GmvMatchMethod,
      billable: Boolean(record.billable),
      chargeId: (record.charge_id as string | null) ?? null,
      occurredAt: record.occurred_at as string,
    };
  });
}

/** Every sale and refund recorded in [fromIso, untilIso), oldest first. */
export async function listLedgerEntriesInRange(ownerId: string, fromIso: string, untilIso: string): Promise<LedgerEntry[]> {
  const rows = await fetchPages((from, to) =>
    db
      .from("gmv_ledger")
      .select("*")
      .eq("owner_id", ownerId)
      .gte("occurred_at", fromIso)
      .lt("occurred_at", untilIso)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map(mapEntry);
}

export async function latestInvoicedCommission(ownerId: string): Promise<number | null> {
  const { data, error } = await db
    .from("gmv_commission_charges")
    .select("commission_usd_cents")
    .eq("owner_id", ownerId)
    .eq("status", "invoiced")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return Number((data as { commission_usd_cents: number }).commission_usd_cents);
}
