import { getStripe } from "./client";

const MAX_CHARGES = 500;

/**
 * USD cents the customer actually paid in [fromIso, untilIso), net of refunds. Covers
 * subscriptions, top-ups and commission invoices alike, since each one settles as a charge.
 */
export async function sumCustomerSpendUsdCents(customerId: string, fromIso: string, untilIso: string): Promise<number> {
  const created = {
    gte: Math.floor(Date.parse(fromIso) / 1000),
    lt: Math.floor(Date.parse(untilIso) / 1000),
  };
  let total = 0;
  let seen = 0;
  for await (const charge of getStripe().charges.list({ customer: customerId, created, limit: 100 })) {
    seen += 1;
    if (charge.paid && charge.status === "succeeded" && charge.currency === "usd") {
      total += charge.amount - (charge.amount_refunded ?? 0);
    }
    if (seen >= MAX_CHARGES) break;
  }
  return Math.max(0, total);
}
