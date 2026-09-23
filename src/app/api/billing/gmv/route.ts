import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getLatestBillingSubscription } from "@/lib/db/billing";
import { computeCommission } from "@/lib/attribution/commission";
import { latestInvoicedCommission, listOpenBillableEntries, listRecentSales, summarizeGmv } from "@/lib/db/gmv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Attributed Persona sales for the signed-in merchant. Amounts are already in USD cents.
 * No shopper details are included.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const subscription = await getLatestBillingSubscription(user.id);
    const sinceIso = subscription?.currentPeriodStart ?? new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const untilIso = new Date().toISOString();

    const [cycle, open, sales, lastBilledCommissionUsdCents] = await Promise.all([
      summarizeGmv(user.id, sinceIso),
      listOpenBillableEntries(user.id, untilIso),
      listRecentSales(user.id, 20),
      latestInvoicedCommission(user.id),
    ]);

    const commission = computeCommission(
      open.map((entry) => ({ amountUsdCents: entry.amountUsdCents, billable: true, charged: false }))
    );

    return Response.json({
      cycleGmvUsdCents: cycle.netUsdCents,
      refundsUsdCents: cycle.refundsUsdCents,
      openGmvUsdCents: commission.gmvUsdCents,
      expectedCommissionUsdCents: commission.commissionUsdCents,
      commissionDeferred: commission.deferred,
      lastBilledCommissionUsdCents,
      orders: sales.map((sale) => ({
        orderName: sale.orderName ?? `#${sale.orderId}`,
        productName: sale.productName,
        amountOriginal: sale.amountOriginal,
        currency: sale.currency,
        amountUsdCents: sale.amountUsdCents,
        matchMethod: sale.matchMethod,
        status: sale.chargeId ? "billed" : sale.billable ? "pending" : "trial",
        occurredAt: sale.occurredAt,
      })),
    });
  } catch (err) {
    console.error("[api/billing/gmv GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
