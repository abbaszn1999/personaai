import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { recordCartEvent } from "@/lib/db/cart-events";
import { hashVisitorSignal } from "@/lib/utils/internal-auth";

interface RequestBody {
  embedToken?: string;
  sessionId?: string;
  productId?: string;
  productName?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  success?: boolean;
  platform?: string;
  platformItemId?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/**
 * Public, unauthenticated log of one add-to-cart the embedded widget caused, fired from the
 * shopper's own browser right after the real WooCommerce Store API call resolves (see
 * syncProductsToRealCart in use-try-on-agent.ts) — so `success` reflects WooCommerce's actual
 * response, not a guess. Powers the analytics page's Persona-attributed cart metrics; never
 * represents a completed purchase.
 */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const productName = typeof body.productName === "string" ? body.productName.trim() : "";
    const price = typeof body.price === "number" && Number.isFinite(body.price) ? body.price : null;
    const success = typeof body.success === "boolean" ? body.success : null;

    if (!sessionId || !productId || !productName || price === null || success === null) {
      return embedJson({ error: "Missing required cart event fields" }, { status: 400 });
    }

    const quantity =
      typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity > 0
        ? Math.floor(body.quantity)
        : 1;
    const currency = typeof body.currency === "string" && body.currency ? body.currency : "USD";

    const platform = body.platform === "shopify" || body.platform === "wordpress" || body.platform === "woocommerce"
      ? body.platform
      : null;
    const platformItemId = typeof body.platformItemId === "string" && body.platformItemId.trim()
      ? body.platformItemId.trim()
      : null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "";
    const ua = req.headers.get("user-agent")?.trim() || "";
    // Hashing needs INTERNAL_JOB_SECRET. Without it the add is still logged for analytics,
    // it just can't be matched to a WooCommerce order.
    let ipHash: string | null = null;
    let uaHash: string | null = null;
    try {
      ipHash = ip ? hashVisitorSignal(workspace.workspaceId, "ip", ip) : null;
      uaHash = ua ? hashVisitorSignal(workspace.workspaceId, "ua", ua) : null;
    } catch (err) {
      console.error("[api/embed/cart-event POST] visitor hash unavailable", err);
    }

    await recordCartEvent({
      workspaceId: workspace.workspaceId,
      sessionId,
      productId,
      productName,
      price,
      currency,
      quantity,
      success,
      platform,
      platformItemId,
      ipHash,
      uaHash,
    });

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/cart-event POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
