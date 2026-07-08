import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { WorkspaceList } from "@/modules/workspaces/components/workspace-list";

export default function WorkspacesPage() {
  return (
    <>
      <DashboardPageHeader
        title="Project"
        description="Manage your AI assistant project"
      />
      <div className="p-6">
        <WorkspaceList />
      </div>
    </>
  );
}
