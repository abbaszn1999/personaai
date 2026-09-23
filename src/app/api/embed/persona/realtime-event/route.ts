import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { consumeLiveTryOnSeconds } from "@/lib/db/realtime-tryon-events";
import { getAccountBillingContext } from "@/lib/billing/account";
import { isLiveTryOnEnabled } from "@/modules/workspaces/constants";

interface RequestBody {
  embedToken?: string;
  sessionId?: string;
  productId?: string;
  productName?: string;
  durationSeconds?: number;
  idempotencyKey?: string;
  /** Omitted means billable, so an older client still charges the way it used to. */
  billable?: boolean;
}

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    if (!isLiveTryOnEnabled(resolution.workspace.branding)) {
      return embedJson({ error: "Live camera try-on is disabled for this store" }, { status: 403 });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const productName = typeof body.productName === "string" ? body.productName.trim() : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const durationSeconds = Number.isInteger(body.durationSeconds)
      ? Math.min(90, Math.max(1, body.durationSeconds as number))
      : 0;

    if (!sessionId || !productId || !productName || !durationSeconds || !idempotencyKey) {
      return embedJson({ error: "Missing required realtime try-on event fields" }, { status: 400 });
    }

    const billing = await getAccountBillingContext(resolution.workspace.ownerId);
    if (!billing) return embedJson({ error: "Merchant account not found" }, { status: 404 });

    const secondsBalance = await consumeLiveTryOnSeconds({
      ownerId: resolution.workspace.ownerId,
      sessionId,
      productId,
      productName,
      durationSeconds,
      cycleStartIso: billing.cycleStartIso,
      includedAllowanceSeconds: billing.tier.monthlyLiveTryOnSeconds,
      idempotencyKey,
      billable: body.billable !== false,
      source: "store",
    });
    return embedJson({ ok: true, secondsBalance });
  } catch (error) {
    console.error("[api/embed/persona/realtime-event POST]", error);
    return embedJson({ error: "Unable to record realtime try-on usage" }, { status: 500 });
  }
}
