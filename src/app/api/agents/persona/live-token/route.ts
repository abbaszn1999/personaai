import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { createDecartClientToken, DecartApiError } from "@/lib/ai/decart";
import { canStartLiveTryOn, getAccountBillingContext } from "@/lib/billing/account";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const billing = await getAccountBillingContext(user.id, "wearable");
    if (!billing || !canStartLiveTryOn(billing)) {
      return Response.json(
        { error: "Your monthly live try-on allowance and purchased minutes are exhausted" },
        { status: 402 }
      );
    }

    const remainingSeconds =
      Math.max(
        billing.tier.monthlyLiveTryOnSeconds - billing.liveTryOnSecondsUsedThisCycle,
        0
      ) + billing.user.live_tryon_seconds_balance;
    const token = await createDecartClientToken(remainingSeconds);
    return Response.json({ apiKey: token.apiKey, expiresAt: token.expiresAt });
  } catch (error) {
    console.error("[api/agents/persona/live-token POST]", error);
    if (error instanceof DecartApiError) {
      return Response.json({ error: error.message }, { status: error.status ?? 502 });
    }
    return Response.json({ error: "Unable to start live try-on" }, { status: 500 });
  }
}
