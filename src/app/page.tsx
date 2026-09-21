import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspacesByOwner } from "@/lib/db/workspaces";

export default async function RootPage() {
  const user = await getCurrentUser();

  // Middleware handles unauthenticated → /sign-in, but guard here too
  if (!user) {
    redirect("/sign-in");
  }

  if (!user.hasCompletedOnboarding) {
    redirect("/onboarding");
  }

  // Every account has at most one project — send it straight to the flat try-on page instead
  // of a project-scoped route.
  const workspaces = await getWorkspacesByOwner(user.id);

  if (workspaces.length > 0) {
    redirect("/try-on");
  }

  // If somehow no project exists yet, go to a setup page
  redirect("/setup");
}
