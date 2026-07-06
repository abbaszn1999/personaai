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

  // Redirect to the first workspace the user owns
  const workspaces = await getWorkspacesByOwner(user.id);
  const workspaceId = workspaces[0]?.id;

  if (workspaceId) {
    redirect(`/workspaces/${workspaceId}`);
  }

  // If somehow no workspace exists yet, go to a setup page
  redirect("/setup");
}
