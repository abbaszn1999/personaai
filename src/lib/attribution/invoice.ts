import type Stripe from "stripe";
import { computeCommission } from "@/lib/attribution/commission";
import {
  claimLedgerEntries,
  finishCommissionCharge,
  getCommissionChargeByKey,
  insertCommissionCharge,
  listEntriesForCharge,
  listOpenBillableEntries,
  releaseCommissionCharge,
  type CommissionCharge,
} from "@/lib/db/gmv";
import { getStripe } from "@/lib/stripe/client";

function stripeErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

function commissionDescription(gmvUsdCents: number, untilIso: string): string {
  const through = new Date(untilIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const gmv = (gmvUsdCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `3% of Persona GMV (${gmv} through ${through})`;
}

async function ensureCharge(input: {
  userId: string;
  idempotencyKey: string;
  stripeInvoiceId: string | null;
}): Promise<CommissionCharge | null> {
  const existing = await getCommissionChargeByKey(input.idempotencyKey);
  if (existing) return existing.status === "invoiced" ? null : existing;
  const created = await insertCommissionCharge({
    ownerId: input.userId,
    idempotencyKey: input.idempotencyKey,
    stripeInvoiceId: input.stripeInvoiceId,
  });
  if (created) return created;
  const raced = await getCommissionChargeByKey(input.idempotencyKey);
  if (!raced || raced.status === "invoiced") return null;
  return raced;
}

/**
 * Adds the open Main-plan commission to a draft renewal invoice, or — when no invoice id is
 * passed — opens a final invoice for whatever is still unbilled (used when a subscription ends).
 *
 * Rows are claimed before the Stripe call. A network failure leaves the claim in place so the
 * retry, which reuses the same idempotency key, cannot bill the same GMV on a second invoice.
 * A 4xx means Stripe refused the item, so the claim is released and the balance waits.
 */
export async function attachGmvCommission(input: {
  userId: string;
  stripeCustomerId: string;
  stripeInvoiceId: string | null;
  stripeSubscriptionId: string | null;
  untilIso: string;
  idempotencyKey: string;
}): Promise<void> {
  const open = await listOpenBillableEntries(input.userId, input.untilIso);
  const preview = computeCommission(open.map((entry) => ({ amountUsdCents: entry.amountUsdCents, billable: true, charged: false })));
  const existing = await getCommissionChargeByKey(input.idempotencyKey);

  if (!existing && (open.length === 0 || preview.deferred)) return;

  const charge = await ensureCharge({
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    stripeInvoiceId: input.stripeInvoiceId,
  });
  if (!charge) return;

  const alreadyClaimed = await listEntriesForCharge(charge.id);
  if (alreadyClaimed.length === 0 && open.length > 0) {
    await claimLedgerEntries(
      open.map((entry) => entry.id),
      charge.id
    );
  }

  const claimed = alreadyClaimed.length > 0 ? alreadyClaimed : await listEntriesForCharge(charge.id);
  if (claimed.length === 0) {
    await releaseCommissionCharge(charge.id);
    return;
  }

  const result = computeCommission(
    claimed.map((entry) => ({ amountUsdCents: entry.amountUsdCents, billable: entry.billable, charged: false }))
  );
  if (result.deferred) {
    await releaseCommissionCharge(charge.id);
    return;
  }

  const description = commissionDescription(result.gmvUsdCents, input.untilIso);
  let stripeInvoiceId = input.stripeInvoiceId ?? charge.stripeInvoiceId;
  let pendingItemId: string | null = null;

  try {
    if (input.stripeInvoiceId) {
      await getStripe().invoiceItems.create(
        {
          customer: input.stripeCustomerId,
          invoice: input.stripeInvoiceId,
          subscription: input.stripeSubscriptionId ?? undefined,
          amount: result.commissionUsdCents,
          currency: "usd",
          description,
        },
        { idempotencyKey: input.idempotencyKey }
      );
    } else {
      const item = await getStripe().invoiceItems.create(
        {
          customer: input.stripeCustomerId,
          amount: result.commissionUsdCents,
          currency: "usd",
          description,
        },
        { idempotencyKey: `${input.idempotencyKey}:item` }
      );
      pendingItemId = item.id;
      const invoice = await getStripe().invoices.create(
        {
          customer: input.stripeCustomerId,
          pending_invoice_items_behavior: "include",
          auto_advance: true,
        },
        { idempotencyKey: `${input.idempotencyKey}:invoice` }
      );
      stripeInvoiceId = invoice.id;
    }
  } catch (error) {
    const status = stripeErrorStatus(error);
    if (status !== null && status >= 400 && status < 500) {
      // A pending item left on the customer would ride along on their next invoice while the
      // released rows are billed again, so it has to go before the balance is reopened.
      if (pendingItemId) {
        try {
          await getStripe().invoiceItems.del(pendingItemId);
        } catch (deleteError) {
          console.error("[attribution/invoice] could not remove pending GMV item", pendingItemId, deleteError);
          throw error;
        }
      }
      await releaseCommissionCharge(charge.id);
    }
    throw error;
  }

  await finishCommissionCharge({
    chargeId: charge.id,
    stripeInvoiceId,
    gmvUsdCents: result.gmvUsdCents,
    commissionUsdCents: result.commissionUsdCents,
  });
}

export function invoicePeriodEndIso(invoice: Stripe.Invoice): string {
  return typeof invoice.period_end === "number" ? new Date(invoice.period_end * 1000).toISOString() : new Date().toISOString();
}
