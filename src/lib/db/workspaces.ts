import { db } from "@/lib/supabase/server";
import type { WorkspaceMode, WorkspaceStatus } from "@/modules/workspaces/types";

export interface WorkspaceRow {
  id: string;
  name: string;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

function rowToWorkspace(row: Record<string, unknown>): WorkspaceRow {
  return {
    id: row.id as string,
    name: row.name as string,
    mode: row.mode as WorkspaceMode,
    status: row.status as WorkspaceStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getWorkspacesByOwner(ownerId: string): Promise<WorkspaceRow[]> {
  const { data, error } = await db
    .from("workspaces")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[db/workspaces getWorkspacesByOwner]", error);
    return [];
  }

  return (data ?? []).map(rowToWorkspace);
}

export async function countWorkspacesByOwner(ownerId: string): Promise<number> {
  const { count } = await db
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);

  return count ?? 0;
}

export interface CreateWorkspaceInput {
  ownerId: string;
  name: string;
  mode: WorkspaceMode;
  status?: WorkspaceStatus;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow | null> {
  const { data, error } = await db
    .from("workspaces")
    .insert({
      owner_id: input.ownerId,
      name: input.name,
      mode: input.mode,
      status: input.status ?? "active",
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db/workspaces createWorkspace]", error);
    return null;
  }

  return rowToWorkspace(data);
}

export interface UpdateWorkspaceInput {
  name?: string;
  status?: WorkspaceStatus;
  mode?: WorkspaceMode;
}

export async function updateWorkspace(
  id: string,
  ownerId: string,
  patch: UpdateWorkspaceInput
): Promise<WorkspaceRow | null> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.mode !== undefined) dbPatch.mode = patch.mode;

  const { data, error } = await db
    .from("workspaces")
    .update(dbPatch)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db/workspaces updateWorkspace]", error);
    return null;
  }

  return rowToWorkspace(data);
}

export async function deleteWorkspace(id: string, ownerId: string): Promise<boolean> {
  const { error } = await db.from("workspaces").delete().eq("id", id).eq("owner_id", ownerId);

  if (error) {
    console.error("[db/workspaces deleteWorkspace]", error);
    return false;
  }

  return true;
}
