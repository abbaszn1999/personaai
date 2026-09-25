import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listMerchants } from "@/lib/db/admin";

function statusVariant(status: string | null): "success" | "warning" | "error" | "neutral" {
  if (status === "active" || status === "trialing") return "success";
  if (status === "past_due" || status === "incomplete") return "warning";
  if (status === "canceled" || status === "unpaid") return "error";
  return "neutral";
}

export async function MerchantsTable({
  search,
  status,
  tier,
  trialUsed,
  page,
  sort,
  dir,
}: {
  search: string;
  status: string;
  tier: string;
  trialUsed: "" | "yes" | "no";
  page: number;
  sort: string;
  dir: "asc" | "desc";
}) {
  const result = await listMerchants({ search, status, tier, trialUsed, page, sort, dir });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const query = (next: Record<string, string>) => {
    const params = new URLSearchParams({ search, status, tier, trial: trialUsed, sort, dir, page: String(page), ...next });
    return `/admin/merchants?${params.toString()}`;
  };

  return (
    <div className="card-base overflow-hidden">
      <form className="flex flex-wrap items-end gap-3 border-b border-[var(--color-border)] px-5 py-4" action="/admin/merchants">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
          Search
          <input name="search" defaultValue={search} placeholder="Email or store" className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-sm text-[var(--color-text-primary)]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
          Store
          <select name="status" defaultValue={status} className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm">
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
          Plan
          <select name="tier" defaultValue={tier} className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm">
            <option value="">Any</option>
            <option value="trial">Trial</option>
            <option value="main">Main</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
          Trial used
          <select name="trial" defaultValue={trialUsed} className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2 text-sm">
            <option value="">Any</option>
            <option value="yes">Used</option>
            <option value="no">Not used</option>
          </select>
        </label>
        <button type="submit" className="h-9 rounded-[var(--radius-md)] bg-[var(--color-surface-base)] px-3 text-sm font-semibold text-[var(--color-text-primary)]">Apply</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-5 py-3 font-medium"><Link href={query({ sort: "store_name", dir: dir === "asc" && sort === "store_name" ? "desc" : "asc", page: "1" })}>Store</Link></th>
              <th className="px-3 py-3 font-medium"><Link href={query({ sort: "email", dir: dir === "asc" && sort === "email" ? "desc" : "asc", page: "1" })}>Email</Link></th>
              <th className="px-3 py-3 font-medium">Plan</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Balances</th>
              <th className="px-3 py-3 font-medium"><Link href={query({ sort: "created_at", dir: dir === "asc" && sort === "created_at" ? "desc" : "asc", page: "1" })}>Created</Link></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-muted)]">No merchants match these filters.</td></tr>
            )}
            {result.rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-base)]">
                <td className="px-5 py-3">
                  <Link href={`/admin/merchants/${row.id}`} className="font-semibold text-[var(--color-text-primary)]">{row.storeName || "No store"}</Link>
                  <div className="text-xs text-[var(--color-text-muted)]">{row.name} · {row.storeStatus}</div>
                </td>
                <td className="px-3 py-3 text-[var(--color-text-secondary)]">{row.email}</td>
                <td className="px-3 py-3">{row.tierId ? <Badge>{row.tierId}</Badge> : <span className="text-[var(--color-text-muted)]">—</span>}</td>
                <td className="px-3 py-3">
                  <Badge variant={statusVariant(row.subscriptionStatus)}>{row.subscriptionStatus ?? "none"}</Badge>
                  {row.cancelAtPeriodEnd && <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">Cancels at period end</div>}
                </td>
                <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">
                  {row.sessionsLeft.toLocaleString()} sessions · {row.liveMinutesLeft} min · {row.garmentsLeft.toLocaleString()} garments
                </td>
                <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">{row.createdAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3 text-sm">
        <span className="text-[var(--color-text-muted)]">Page {result.page} of {pages} · {result.total} merchants</span>
        <div className="flex gap-2">
          {result.page > 1 && <Link className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5" href={query({ page: String(result.page - 1) })}>Previous</Link>}
          {result.page < pages && <Link className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5" href={query({ page: String(result.page + 1) })}>Next</Link>}
        </div>
      </div>
    </div>
  );
}
