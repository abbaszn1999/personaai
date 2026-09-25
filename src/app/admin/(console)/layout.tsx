import { requireAdmin } from "@/modules/auth/lib/admin-session";
import { AdminSidebar } from "@/modules/admin/admin-sidebar";

export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="dashboard-theme flex h-screen overflow-hidden bg-[var(--color-app-frame)] p-2 gap-2">
      <AdminSidebar email={admin.email} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-2xl)] content-panel">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto sidebar-scroll p-6">{children}</main>
      </div>
    </div>
  );
}
