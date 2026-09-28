import Link from "next/link";
import { listAuditLog } from "@/lib/db/admin";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);
  const { rows, total } = await listAuditLog(page, 30);
  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[var(--color-text-primary)]">Audit log</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Every owner action on a merchant.</p>
      </div>
      <div className="card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-5 py-3 font-medium">When</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Merchant</th>
              <th className="px-3 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-[var(--color-text-muted)]">No actions yet.</td></tr>}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--color-border)]">
                <td className="px-5 py-3 text-xs text-[var(--color-text-muted)]">{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td className="px-3 py-3 font-medium">{row.action}</td>
                <td className="px-3 py-3">{row.targetUserId ? <Link className="text-[var(--color-brand-strong)]" href={`/admin/merchants/${row.targetUserId}`}>{row.targetUserId.slice(0, 8)}</Link> : "—"}</td>
                <td className="px-3 py-3 text-xs text-[var(--color-text-secondary)]">{JSON.stringify(row.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3 text-sm">
          <span className="text-[var(--color-text-muted)]">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5" href={`/admin/audit?page=${page - 1}`}>Previous</Link>}
            {page < pages && <Link className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5" href={`/admin/audit?page=${page + 1}`}>Next</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
