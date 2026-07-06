import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspacesByOwner, countWorkspacesByOwner, createWorkspace } from "@/lib/db/workspaces";
import type { WorkspaceMode } from "@/modules/workspaces/types";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaces = await getWorkspacesByOwner(user.id);
    return Response.json({ workspaces });
  } catch (err) {
    console.error("[workspaces GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, mode, selectedCategoryIds } = await req.json();

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return Response.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    }

    const validModes: WorkspaceMode[] = ["wearable", "unwearable"];
    if (!mode || !validModes.includes(mode as WorkspaceMode)) {
      return Response.json({ error: "Invalid mode" }, { status: 400 });
    }

    const count = await countWorkspacesByOwner(user.id);
    if (count >= (user.workspaceLimit ?? 3)) {
      return Response.json({ error: "Workspace limit reached" }, { status: 403 });
    }

    const workspace = await createWorkspace({
      ownerId: user.id,
      name: name.trim(),
      mode,
      status: "active",
      selectedCategoryIds: selectedCategoryIds ?? [],
    });

    if (!workspace) {
      return Response.json({ error: "Failed to create workspace" }, { status: 500 });
    }

    return Response.json({ workspace }, { status: 201 });
  } catch (err) {
    console.error("[workspaces POST]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
