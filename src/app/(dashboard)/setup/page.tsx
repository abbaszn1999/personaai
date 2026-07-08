import { redirect } from "next/navigation";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { SetupWizard } from "@/modules/onboarding/components/setup-wizard";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspacesByOwner } from "@/lib/db/workspaces";

export default async function SetupPage() {
  const user = await getCurrentUser();
  if (user) {
    const workspaces = await getWorkspacesByOwner(user.id);
    if (workspaces.length >= user.workspaceLimit) {
      redirect(`/workspaces/${workspaces[0].id}`);
    }
  }

  return (
    <>
      <DashboardPageHeader
        title="Create Project"
        description="Follow the steps to configure a new AI shopping assistant"
      />
      <div className="p-6">
        <SetupWizard />
      </div>
    </>
  );
}
