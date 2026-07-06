import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { UserProvider } from "@/modules/auth/context/user-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { WorkspacesBootstrap } from "@/modules/workspaces/providers/workspaces-bootstrap";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <UserProvider user={user}>
      <WorkspacesBootstrap />
      <DashboardShell>{children}</DashboardShell>
    </UserProvider>
  );
}
