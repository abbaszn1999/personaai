import { db } from "@/lib/supabase/server";
import { defaultBranding } from "@/modules/workspaces/constants";
import type { WorkspaceMode, WorkspaceStatus, WorkspaceBranding } from "@/modules/workspaces/types";

export interface WorkspaceRow {
  id: string;
  name: string;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  embedToken: string;
  embedEnabled: boolean;
  branding: WorkspaceBranding;
  createdAt: string;
  updatedAt: string;
}

// The `mode` column was dropped from `workspaces` (every project is a wearable virtual
// try-on agent now — see the drop_workspace_mode migration). Kept as a hardcoded field on
// the returned shape rather than removed outright so the many UI call sites that still read
// `workspace.mode` don't all need updating in this same pass; flattened away entirely once
// the workspace concept itself is removed.
function rowToWorkspace(row: Record<string, unknown>): WorkspaceRow {
  const mode: WorkspaceMode = "wearable";
  const branding = (row.branding as Partial<WorkspaceBranding> | null) ?? {};
  return {
    id: row.id as string,
    name: row.name as string,
    mode,
    status: row.status as WorkspaceStatus,
    embedToken: row.embed_token as string,
    embedEnabled: (row.embed_enabled as boolean) ?? false,
    // Merge over defaults so older rows (saved before a new branding field was added) still
    // resolve to a complete, valid shape instead of leaving newer UI fields `undefined`.
    branding: { ...defaultBranding(), ...branding },
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

export async function getWorkspaceByIdForOwner(id: string, ownerId: string): Promise<WorkspaceRow | null> {
  const { data, error } = await db
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToWorkspace(data);
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
  status?: WorkspaceStatus;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow | null> {
  const { data, error } = await db
    .from("workspaces")
    .insert({
      owner_id: input.ownerId,
      name: input.name,
      status: input.status ?? "active",
      branding: defaultBranding(),
      // Column is NOT NULL with no DB default (see 0010_workspace_embed.sql) — must mint here.
      embed_token: crypto.randomUUID().replace(/-/g, ""),
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
  embedEnabled?: boolean;
  branding?: Partial<WorkspaceBranding>;
}

export async function updateWorkspace(
  id: string,
  ownerId: string,
  patch: UpdateWorkspaceInput
): Promise<WorkspaceRow | null> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.embedEnabled !== undefined) dbPatch.embed_enabled = patch.embedEnabled;

  if (patch.branding !== undefined) {
    // Merge onto the existing stored branding rather than clobbering it, since the settings
    // form can save partial patches (e.g. just the color) via the same PATCH endpoint.
    const existing = await getWorkspaceByIdForOwner(id, ownerId);
    const base = existing?.branding ?? defaultBranding();
    dbPatch.branding = { ...base, ...patch.branding };
  }

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

/** Public-safe resolution used by every unauthenticated `/api/embed/*` route: turns a
 *  shopper-facing embed token into the merchant's `ownerId` plus just enough workspace
 *  metadata to render the widget, without ever exposing the internal workspace id/owner
 *  to the client. */
export interface EmbedWorkspaceResolution {
  workspaceId: string;
  ownerId: string;
  mode: WorkspaceMode;
  embedEnabled: boolean;
  branding: WorkspaceBranding;
}

export async function getWorkspaceByEmbedToken(token: string): Promise<EmbedWorkspaceResolution | null> {
  if (!token) return null;

  const { data, error } = await db
    .from("workspaces")
    .select("id, owner_id, embed_enabled, branding")
    .eq("embed_token", token)
    .maybeSingle();

  if (error || !data) return null;

  return {
    workspaceId: data.id as string,
    ownerId: data.owner_id as string,
    mode: "wearable",
    embedEnabled: (data.embed_enabled as boolean) ?? false,
    branding: { ...defaultBranding(), ...((data.branding as Partial<WorkspaceBranding> | null) ?? {}) },
  };
}

/** Invalidates every already-deployed snippet for this workspace immediately — used by the
 *  settings page's "Regenerate token" action, which warns the merchant about that before calling it. */
export async function regenerateEmbedToken(id: string, ownerId: string): Promise<string | null> {
  const { data, error } = await db
    .from("workspaces")
    .update({ embed_token: crypto.randomUUID().replace(/-/g, ""), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("embed_token")
    .single();

  if (error || !data) {
    console.error("[db/workspaces regenerateEmbedToken]", error);
    return null;
  }

  return data.embed_token as string;
}
