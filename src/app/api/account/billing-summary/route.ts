import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getAccountBillingContext } from "@/lib/billing/account";
import { resolveBillingWorkspaceMode } from "@/lib/billing/workspace-context";
import { getChatMessageCountForOwner } from "@/lib/db/chat-events";
import { LIVE_TRYON_PRICE_PER_MINUTE_CENTS } from "@/modules/billing/constants";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const mode = await resolveBillingWorkspaceMode(user.id, workspaceId);
    if (!mode) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const billing = await getAccountBillingContext(user.id, mode);
    if (!billing) return Response.json({ error: "Account not found" }, { status: 404 });
    const chatMessagesThisCycle = await getChatMessageCountForOwner(user.id, billing.cycleStartIso);

    return Response.json(
      {
        mode,
        tierId: billing.tier.id,
        cycleStart: billing.cycleStartIso,
        cycleEnd: billing.cycleEndIso,
        billing: {
          accessMode: billing.accessMode,
          entitlementStatus: billing.entitlementStatus,
          entitled: billing.entitled,
          hasStripeCustomer: billing.hasStripeCustomer,
          subscriptionStatus: billing.subscription?.status ?? null,
          cancelAtPeriodEnd: billing.subscription?.cancelAtPeriodEnd ?? false,
          currentPeriodEnd: billing.subscription?.currentPeriodEnd ?? null,
        },
        images: {
          includedAllowance: billing.tier.monthlyRenders,
          usedThisCycle: billing.imagesUsedThisCycle,
          includedRemaining: Math.max(billing.tier.monthlyRenders - billing.imagesUsedThisCycle, 0),
          creditsBalance: billing.user.credits,
        },
        liveTryOn: {
          includedAllowanceSeconds: billing.tier.monthlyLiveTryOnSeconds,
          usedThisCycleSeconds: billing.liveTryOnSecondsUsedThisCycle,
          includedRemainingSeconds: Math.max(
            billing.tier.monthlyLiveTryOnSeconds - billing.liveTryOnSecondsUsedThisCycle,
            0
          ),
          purchasedSecondsBalance: billing.user.live_tryon_seconds_balance,
          pricePerMinuteCents: LIVE_TRYON_PRICE_PER_MINUTE_CENTS,
        },
        chatMessagesThisCycle,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/account/billing-summary GET]", error);
    return Response.json({ error: "Unable to load billing usage" }, { status: 500 });
  }
}
