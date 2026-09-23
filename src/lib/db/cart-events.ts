import { db } from "@/lib/supabase/server";

export interface RecordCartEventInput {
  workspaceId: string;
  sessionId: string;
  productId: string;
  productName: string;
  price: number;
  currency: string;
  quantity: number;
  success: boolean;
  platform?: string | null;
  platformItemId?: string | null;
  ipHash?: string | null;
  uaHash?: string | null;
}

/** Logs one add-to-cart attempt the embedded widget caused, with the real success/failure
 *  outcome from WooCommerce's own Store API response (see syncProductsToRealCart in
 *  use-try-on-agent.ts, which is the only caller). Never represents a completed purchase —
 *  see src/lib/db/analytics.ts for how this is aggregated and labeled on the dashboard. */
export async function recordCartEvent(input: RecordCartEventInput): Promise<void> {
  const { error } = await db.from("cart_events").insert({
    // `workspace_id` was dropped from this table — "workspace" and "owner" are the same
    // thing now, so this stays keyed on owner_id under the hood.
    owner_id: input.workspaceId,
    session_id: input.sessionId,
    product_id: input.productId,
    product_name: input.productName,
    price: input.price,
    currency: input.currency,
    quantity: input.quantity,
    success: input.success,
    platform: input.platform ?? null,
    platform_item_id: input.platformItemId ?? null,
    ip_hash: input.ipHash ?? null,
    ua_hash: input.uaHash ?? null,
  });

  if (error) {
    console.error("[db/cart-events recordCartEvent]", error);
  }
}

export async function hasSuccessfulCartAdd(input: {
  ownerId: string;
  platform: string;
  platformItemId: string;
  sessionId: string;
  sinceIso: string;
  untilIso: string;
}): Promise<boolean> {
  const { data, error } = await db
    .from("cart_events")
    .select("id")
    .eq("owner_id", input.ownerId)
    .eq("platform", input.platform)
    .eq("platform_item_id", input.platformItemId)
    .eq("session_id", input.sessionId)
    .eq("success", true)
    .gte("created_at", input.sinceIso)
    .lte("created_at", input.untilIso)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export interface CartAddCandidate {
  platformItemId: string;
  sessionId: string;
  ipHash: string | null;
  uaHash: string | null;
  createdAt: string;
}

export async function listCartAddsForItems(input: {
  ownerId: string;
  platform: string;
  platformItemIds: string[];
  sinceIso: string;
  untilIso: string;
}): Promise<CartAddCandidate[]> {
  const ids = [...new Set(input.platformItemIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await db
    .from("cart_events")
    .select("platform_item_id, session_id, ip_hash, ua_hash, created_at")
    .eq("owner_id", input.ownerId)
    .eq("platform", input.platform)
    .eq("success", true)
    .in("platform_item_id", ids)
    .gte("created_at", input.sinceIso)
    .lte("created_at", input.untilIso);

  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const record = row as Record<string, unknown>;
    const platformItemId = record.platform_item_id;
    const sessionId = record.session_id;
    if (typeof platformItemId !== "string" || typeof sessionId !== "string") return [];
    return [
      {
        platformItemId,
        sessionId,
        ipHash: (record.ip_hash as string | null) ?? null,
        uaHash: (record.ua_hash as string | null) ?? null,
        createdAt: record.created_at as string,
      },
    ];
  });
}

export interface CartEventRow {
  productId: string;
  productName: string;
  price: number;
  currency: string;
  quantity: number;
  success: boolean;
  sessionId: string;
  createdAt: string;
}

/** Raw rows for a workspace within [sinceIso, untilIso) — aggregated in application code by
 *  src/lib/db/analytics.ts rather than via SQL grouping, matching this codebase's existing
 *  pattern of keeping Postgres usage simple for this account-scale, low-volume data. */
export async function getCartEventsInRange(
  workspaceId: string,
  sinceIso: string,
  untilIso: string
): Promise<CartEventRow[]> {
  const { data, error } = await db
    .from("cart_events")
    .select("product_id, product_name, price, currency, quantity, success, session_id, created_at")
    .eq("owner_id", workspaceId)
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso);

  if (error) {
    console.error("[db/cart-events getCartEventsInRange]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    productId: row.product_id as string,
    productName: row.product_name as string,
    price: row.price as number,
    currency: row.currency as string,
    quantity: row.quantity as number,
    success: row.success as boolean,
    sessionId: row.session_id as string,
    createdAt: row.created_at as string,
  }));
}
