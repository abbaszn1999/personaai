export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-48 rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)]" />
      <div className="h-4 w-72 rounded-[var(--radius-md)] bg-[var(--color-surface-elevated)]" />
      <div className="mt-6 grid gap-3">
        <div className="h-32 rounded-[var(--radius-xl)] bg-[var(--color-surface-elevated)]" />
        <div className="h-32 rounded-[var(--radius-xl)] bg-[var(--color-surface-elevated)]" />
        <div className="h-32 rounded-[var(--radius-xl)] bg-[var(--color-surface-elevated)]" />
      </div>
    </div>
  );
}
