import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getMerchantDetail } from "@/lib/db/admin";
import { MerchantActions } from "@/modules/admin/merchant-actions";

function remaining(allowance: number, used: number): number {
  return Math.max(allowance - used, 0);
}

export default async function MerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const merchant = await getMerchantDetail(id);
  if (!merchant) notFound();

  const wallets = [
    { label: "Sessions", included: remaining(merchant.tier.monthlySessionUnits, merchant.sessionsUsed), purchased: merchant.sessionUnits },
    { label: "Live minutes", included: Math.round(remaining(merchant.tier.monthlyLiveTryOnSeconds, merchant.liveUsedSeconds) / 60), purchased: Math.round(merchant.liveSeconds / 60) },
    { label: "Garments", included: remaining(merchant.tier.monthlyGarmentUnits, merchant.imagesUsed), purchased: merchant.credits },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/merchants" className="text-xs text-[var(--color-text-muted)]">Merchants</Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-[var(--color-text-primary)]">{merchant.storeName || merchant.name}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{merchant.email} · {merchant.provider} · joined {merchant.createdAt.slice(0, 10)}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="card-base p-5">
          <h2 className="text-sm font-semibold">Account</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Store {merchant.storeStatus}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">Embed {merchant.embedEnabled ? "on" : "off"}</p>
          <p className="mt-2 text-sm">Access <Badge variant={merchant.entitled ? "success" : "warning"}>{merchant.entitlementStatus}</Badge></p>
        </section>
        <section className="card-base p-5">
          <h2 className="text-sm font-semibold">Subscription</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{merchant.tier.name} · {merchant.tier.priceLabel}{merchant.tier.priceSub}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">{merchant.subscription?.status ?? "No Stripe subscription"}</p>
          {merchant.subscription?.currentPeriodEnd && (
            <p className="text-xs text-[var(--color-text-muted)]">Period ends {merchant.subscription.currentPeriodEnd.slice(0, 10)}{merchant.subscription.cancelAtPeriodEnd ? " · cancels then" : ""}</p>
          )}
        </section>
        <section className="card-base p-5">
          <h2 className="text-sm font-semibold">GMV this cycle</h2>
          <p className="mt-2 text-2xl font-display font-extrabold">${(merchant.gmv.netUsdCents / 100).toFixed(2)}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Refunds ${(merchant.gmv.refundsUsdCents / 100).toFixed(2)}</p>
        </section>
      </div>

      <section className="card-base p-5">
        <h2 className="text-sm font-semibold">Wallets</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {wallets.map((wallet) => (
            <div key={wallet.label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <p className="text-xs text-[var(--color-text-muted)]">{wallet.label}</p>
              <p className="text-lg font-semibold">{wallet.included.toLocaleString()} left in plan</p>
              <p className="text-xs text-[var(--color-text-muted)]">{wallet.purchased.toLocaleString()} purchased</p>
            </div>
          ))}
        </div>
      </section>

      <MerchantActions userId={merchant.id} email={merchant.email} hasSubscription={Boolean(merchant.subscription)} />

      <div className="grid gap-3 lg:grid-cols-3">
        <EventList title="Recent chat" rows={merchant.chats.map((row) => ({ id: String(row.id), text: `${row.role}: ${row.topic ?? "message"}`, at: String(row.created_at) }))} />
        <EventList title="Recent try-ons" rows={merchant.tryOns.map((row) => ({ id: String(row.id), text: `${row.product_name ?? "Product"} · ${row.recommended_size ?? ""}`, at: String(row.created_at) }))} />
        <EventList title="Recent cart" rows={merchant.carts.map((row) => ({ id: String(row.id), text: `${row.product_name ?? "Item"} · ${row.success ? "added" : "failed"}`, at: String(row.created_at) }))} />
      </div>
    </div>
  );
}

function EventList({ title, rows }: { title: string; rows: { id: string; text: string; at: string }[] }) {
  return (
    <section className="card-base p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 && <p className="mt-3 text-sm text-[var(--color-text-muted)]">Nothing yet.</p>}
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="text-sm">
            <p className="text-[var(--color-text-secondary)]">{row.text}</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">{row.at.slice(0, 16).replace("T", " ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
