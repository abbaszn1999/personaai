import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { cycleOverageMicroCents, getAccountBillingContext, overageCentsFromMicro } from "@/lib/billing/account";
import { projectUsage } from "@/lib/billing/burn-rate";
import {
  GARMENT_MAX_PACKS,
  GARMENT_MIN_PACKS,
  GARMENT_PACK_UNITS,
  LIVE_MAX_MINUTES,
  LIVE_MIN_MINUTES,
  SESSION_MAX_PACKS,
  SESSION_MIN_PACKS,
  SESSION_PACK_UNITS,
} from "@/lib/billing/pricing";
import { suggestedTopUpQuantity } from "@/lib/billing/wallets";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
import { LIVE_TRYON_PRICE_PER_MINUTE_CENTS } from "@/modules/billing/constants";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function walletForecast(input: {
  used: number;
  remaining: number;
  cycleStart: string;
  cycleEnd: string;
  packSize: number;
  minPacks: number;
  maxPacks: number;
}) {
  const now = Date.now();
  const start = new Date(input.cycleStart).getTime();
  const end = new Date(input.cycleEnd).getTime();
  const elapsed = Math.max(0, Math.min(now, end) - start);
  const projection = projectUsage({
    used: input.used,
    elapsedMs: elapsed,
    cycleLengthMs: Math.max(end - start, 0),
    remaining: input.remaining,
  });
  return {
    dailyBurn: round2(projection.dailyBurn),
    projectedCycleTotal: round2(projection.projectedCycleTotal),
    suggestedTopUp: suggestedTopUpQuantity({
      dailyBurn: projection.dailyBurn,
      packSize: input.packSize,
      minPacks: input.minPacks,
      maxPacks: input.maxPacks,
    }),
  };
}

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
    const imageRemaining = Math.max(billing.tier.monthlyGarmentUnits - billing.imagesUsedThisCycle, 0);
    const liveRemainingSeconds = Math.max(
      billing.tier.monthlyLiveTryOnSeconds - billing.liveTryOnSecondsUsedThisCycle,
      0
    );
    const sessionRemaining = Math.max(billing.tier.monthlySessionUnits - billing.sessionUnitsUsedThisCycle, 0);
    const liveMinutesUsed = billing.liveTryOnSecondsUsedThisCycle / 60;
    const liveMinutesRemaining = (liveRemainingSeconds + billing.user.live_tryon_seconds_balance) / 60;

    return Response.json(
      {
        tierId: billing.tier.id,
        cycleStart: billing.cycleStartIso,
        cycleEnd: billing.cycleEndIso,
        overageCents: overageCentsFromMicro(cycleOverageMicroCents(billing)),
        overageCapCents: billing.user.overage_cap_cents ?? null,
        usageAlerts: billing.user.notification_preferences?.usageAlerts !== false,
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
          includedAllowance: billing.tier.monthlyGarmentUnits,
          usedThisCycle: billing.imagesUsedThisCycle,
          includedRemaining: imageRemaining,
          creditsBalance: billing.user.credits,
          ...walletForecast({
            used: billing.imagesUsedThisCycle,
            remaining: imageRemaining + Math.max(billing.user.credits, 0),
            cycleStart: billing.cycleStartIso,
            cycleEnd: billing.cycleEndIso,
            packSize: GARMENT_PACK_UNITS,
            minPacks: GARMENT_MIN_PACKS,
            maxPacks: GARMENT_MAX_PACKS,
          }),
        },
        liveTryOn: {
          includedAllowanceSeconds: billing.tier.monthlyLiveTryOnSeconds,
          usedThisCycleSeconds: billing.liveTryOnSecondsUsedThisCycle,
          includedRemainingSeconds: liveRemainingSeconds,
          purchasedSecondsBalance: billing.user.live_tryon_seconds_balance,
          pricePerMinuteCents: LIVE_TRYON_PRICE_PER_MINUTE_CENTS,
          ...walletForecast({
            used: liveMinutesUsed,
            remaining: Math.max(liveMinutesRemaining, 0),
            cycleStart: billing.cycleStartIso,
            cycleEnd: billing.cycleEndIso,
            packSize: 1,
            minPacks: LIVE_MIN_MINUTES,
            maxPacks: LIVE_MAX_MINUTES,
          }),
        },
        sessions: {
          includedAllowance: billing.tier.monthlySessionUnits,
          usedThisCycle: billing.sessionUnitsUsedThisCycle,
          includedRemaining: sessionRemaining,
          unitsBalance: sessionUnitsBalance,
          ...walletForecast({
            used: billing.sessionUnitsUsedThisCycle,
            remaining: sessionRemaining + Math.max(sessionUnitsBalance, 0),
            cycleStart: billing.cycleStartIso,
            cycleEnd: billing.cycleEndIso,
            packSize: SESSION_PACK_UNITS,
            minPacks: SESSION_MIN_PACKS,
            maxPacks: SESSION_MAX_PACKS,
          }),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/account/billing-summary GET]", error);
    return Response.json({ error: "Unable to load billing usage" }, { status: 500 });
  }
}
