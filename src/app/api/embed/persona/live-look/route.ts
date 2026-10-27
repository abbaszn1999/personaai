import { NextRequest } from "next/server";
import { describeLookForLive } from "@/lib/ai/look-description";
import { parseLookRequest } from "@/lib/live/look-request";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { canStartLiveTryOn, getAccountBillingContext } from "@/lib/billing/account";
import { isLiveTryOnEnabled } from "@/modules/workspaces/constants";

/**
 * The live try-on prompt, written from the avatar render the shopper is about to wear on camera.
 * Gated like `live-token`: only a store that can open a live session gets one, so this cannot be
 * used as a free vision endpoint. A model failure answers `prompt: null` and the widget falls back
 * to the prompt it builds from the catalog.
 */
export const maxDuration = 30;

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const resolution = await resolveEmbedRequest(body.embedToken, { req, kind: "paid" });
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;
    if (!isLiveTryOnEnabled(workspace.branding)) {
      return embedJson({ error: "Live camera try-on is disabled for this store" }, { status: 403 });
    }
    const billing = await getAccountBillingContext(workspace.ownerId);
    if (!billing || !canStartLiveTryOn(billing)) {
      return embedJson(
        { error: "This store has exhausted its monthly live try-on allowance and purchased minutes" },
        { status: 402 }
      );
    }

    const look = parseLookRequest(body);
    if (!look) return embedJson({ error: "A look picture is required" }, { status: 400 });

    try {
      return embedJson({ prompt: await describeLookForLive(look, req.signal) });
    } catch (error) {
      console.error("[api/embed/persona/live-look] description failed", error);
      return embedJson({ prompt: null });
    }
  } catch (error) {
    console.error("[api/embed/persona/live-look POST]", error);
    return embedJson({ error: "Unable to describe this look" }, { status: 500 });
  }
}
