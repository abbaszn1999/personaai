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
}

/** Logs one add-to-cart attempt the embedded widget caused, with the real success/failure
 *  outcome from WooCommerce's own Store API response (see syncProductsToRealCart in
 *  use-try-on-agent.ts, which is the only caller). Never represents a completed purchase —
 *  see src/lib/db/analytics.ts for how this is aggregated and labeled on the dashboard. */
export async function recordCartEvent(input: RecordCartEventInput): Promise<void> {
  const { error } = await db.from("cart_events").insert({
    workspace_id: input.workspaceId,
    session_id: input.sessionId,
    product_id: input.productId,
    product_name: input.productName,
    price: input.price,
    currency: input.currency,
    quantity: input.quantity,
    success: input.success,
  });

  if (error) {
    console.error("[db/cart-events recordCartEvent]", error);
  }
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
    .eq("workspace_id", workspaceId)
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
