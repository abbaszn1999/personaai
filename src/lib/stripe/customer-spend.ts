import { getStripe } from "./client";

/**
 * USD cents the customer actually paid in [fromIso, untilIso), net of refunds. Covers
 * subscriptions, top-ups and commission invoices alike, since each one settles as a charge.
 * Walks every page Stripe returns — truncating would undercount Return on Persona.
 */
export async function sumCustomerSpendUsdCents(customerId: string, fromIso: string, untilIso: string): Promise<number> {
  const created = {
    gte: Math.floor(Date.parse(fromIso) / 1000),
    lt: Math.floor(Date.parse(untilIso) / 1000),
  };
  let total = 0;
  for await (const charge of getStripe().charges.list({ customer: customerId, created, limit: 100 })) {
    if (charge.paid && charge.status === "succeeded" && charge.currency === "usd") {
      total += charge.amount - (charge.amount_refunded ?? 0);
    }
  }
  return Math.max(0, total);
}
