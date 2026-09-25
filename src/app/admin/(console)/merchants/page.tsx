import { MerchantsTable } from "@/modules/admin/merchants-table";

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const trial = one("trial");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[var(--color-text-primary)]">Merchants</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Search, filter, and open a merchant.</p>
      </div>
      <MerchantsTable
        search={one("search")}
        status={one("status")}
        tier={one("tier")}
        trialUsed={trial === "yes" || trial === "no" ? trial : ""}
        page={Math.max(1, Number(one("page")) || 1)}
        sort={one("sort") || "created_at"}
        dir={one("dir") === "asc" ? "asc" : "desc"}
      />
    </div>
  );
}
