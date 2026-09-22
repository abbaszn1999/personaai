import { NextRequest } from "next/server";
import { createDecartClientToken, DecartApiError } from "@/lib/ai/decart";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { canStartLiveTryOn, getAccountBillingContext } from "@/lib/billing/account";
import { walletHeadroom } from "@/lib/billing/wallets";
import { isLiveTryOnEnabled } from "@/modules/workspaces/constants";

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const resolution = await resolveEmbedRequest(body.embedToken);
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

    const remainingSeconds = walletHeadroom({
      used: billing.liveTryOnSecondsUsedThisCycle,
      included: billing.tier.monthlyLiveTryOnSeconds,
      balance: billing.user.live_tryon_seconds_balance,
    });
    const token = await createDecartClientToken(remainingSeconds);
    return embedJson({ apiKey: token.apiKey, expiresAt: token.expiresAt });
  } catch (error) {
    console.error("[api/embed/persona/live-token POST]", error);
    if (error instanceof DecartApiError) {
      return embedJson({ error: error.message }, { status: error.status ?? 502 });
    }
    return embedJson({ error: "Unable to start live try-on" }, { status: 500 });
  }
}
