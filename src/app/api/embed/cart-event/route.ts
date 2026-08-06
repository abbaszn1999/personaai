import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { recordCartEvent } from "@/lib/db/cart-events";

interface RequestBody {
  embedToken?: string;
  sessionId?: string;
  productId?: string;
  productName?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  success?: boolean;
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

    await recordCartEvent({
      workspaceId: workspace.workspaceId,
      sessionId,
      productId,
      productName,
      price,
      currency,
      quantity,
      success,
    });

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/cart-event POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
