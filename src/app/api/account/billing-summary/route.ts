import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getAccountBillingContext } from "@/lib/billing/account";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
import { SESSION_INCLUDED_UNITS_PER_CYCLE } from "@/lib/billing/pricing";
import { LIVE_TRYON_PRICE_PER_MINUTE_CENTS } from "@/modules/billing/constants";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const workspace = workspaceId
      ? await getWorkspaceByIdForOwner(workspaceId, user.id)
      : (await getWorkspacesByOwner(user.id))[0] ?? null;
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const billing = await getAccountBillingContext(user.id);
    if (!billing) return Response.json({ error: "Account not found" }, { status: 404 });
    const sessionUnitsBalance = billing.user.session_units_balance ?? 0;

    return Response.json(
      {
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
        sessions: {
          includedAllowance: SESSION_INCLUDED_UNITS_PER_CYCLE,
          usedThisCycle: billing.sessionUnitsUsedThisCycle,
          includedRemaining: Math.max(SESSION_INCLUDED_UNITS_PER_CYCLE - billing.sessionUnitsUsedThisCycle, 0),
          unitsBalance: sessionUnitsBalance,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/account/billing-summary GET]", error);
    return Response.json({ error: "Unable to load billing usage" }, { status: 500 });
  }
}
