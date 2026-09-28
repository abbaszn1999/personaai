import { getCurrentUser, getSession } from "@/modules/auth/lib/get-user";
import { UserProvider } from "@/modules/auth/context/user-context";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { WorkspacesBootstrap } from "@/modules/workspaces/providers/workspaces-bootstrap";
import { StoreConnectionBootstrap } from "@/modules/store/providers/store-connection-bootstrap";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, session] = await Promise.all([getCurrentUser(), getSession()]);
  const impersonation = session.impersonatedBy
    ? { adminEmail: session.impersonatedBy, merchantEmail: session.profile?.email ?? user?.email ?? "" }
    : null;
  return (
    <UserProvider user={user}>
      <WorkspacesBootstrap />
      <StoreConnectionBootstrap />
      <DashboardShell impersonation={impersonation}>{children}</DashboardShell>
    </UserProvider>
  );
}
