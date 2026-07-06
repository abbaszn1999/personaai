import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { updateWorkspace, deleteWorkspace } from "@/lib/db/workspaces";
import type { WorkspaceMode, WorkspaceStatus } from "@/modules/workspaces/types";

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const patch: {
      name?: string;
      status?: WorkspaceStatus;
      mode?: WorkspaceMode;
      selectedCategoryIds?: string[];
    } = {};

    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      patch.name = body.name.trim();
    }
    if (["active", "draft", "paused"].includes(body.status)) {
      patch.status = body.status;
    }
    if (["wearable", "unwearable"].includes(body.mode)) {
      patch.mode = body.mode;
    }
    if (Array.isArray(body.selectedCategoryIds)) {
      patch.selectedCategoryIds = body.selectedCategoryIds;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const workspace = await updateWorkspace(id, user.id, patch);

    if (!workspace) {
      return Response.json({ error: "Workspace not found or update failed" }, { status: 404 });
    }

    return Response.json({ workspace });
  } catch (err) {
    console.error("[workspaces PATCH]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await deleteWorkspace(id, user.id);

    if (!ok) {
      return Response.json({ error: "Workspace not found or delete failed" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[workspaces DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
