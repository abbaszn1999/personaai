import { MetricCard } from "@/components/ui/metric-card";
import { getAdminOverviewMetrics } from "@/lib/db/admin";

export default async function AdminOverviewPage() {
  const metrics = await getAdminOverviewMetrics();
  const peak = Math.max(1, ...metrics.signupsByDay.map((day) => day.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-[var(--color-text-primary)]">Overview</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Merchants, subscriptions, and the last 30 days.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Merchants" value={metrics.merchants} accent="brand" />
        <MetricCard label="Active subscriptions" value={metrics.activeSubscriptions} sub={`${metrics.trials} on Trial`} accent="violet" />
        <MetricCard label="MRR" value={`$${metrics.mrrUsd.toLocaleString()}`} sub="Main plans only. Trial is one-time." accent="ember" />
        <MetricCard label="Past due" value={metrics.pastDue} accent="brand" />
        <MetricCard label="Canceled, 30 days" value={metrics.churned30d} accent="ember" />
        <MetricCard label="Churn, 30 days" value={`${Math.round(metrics.churnRate * 100)}%`} sub="Canceled vs active plus canceled" accent="success" />
      </div>
      <section className="card-base p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">New merchants</h2>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">Signups per day, last 30 days.</p>
        <div className="flex h-36 items-end gap-1">
          {metrics.signupsByDay.map((day) => (
            <div key={day.day} className="flex h-full flex-1 flex-col justify-end" title={`${day.day}: ${day.count}`}>
              <div
                className="gradient-brand w-full rounded-t-[var(--radius-sm)]"
                style={{ height: `${Math.max(4, (day.count / peak) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
