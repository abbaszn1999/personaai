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

const WORKSPACE_SELECT = "id, store_name, store_status, embed_token, embed_enabled, branding, created_at, updated_at";

// The `workspaces` table itself has been dropped (every account has at most one project, so
// there was nothing left for a separate table to hold) — this module is now just a typed view
// over that owner's own row on `users` (store_name/store_status/embed_token/embed_enabled/
// branding), with `id` equal to the owner's own id. Kept as its own module/shape rather than
// folded into lib/db/users.ts since most of the UI still reads a `Workspace` object by id.
function rowToWorkspace(row: Record<string, unknown>): WorkspaceRow | null {
  // No project created yet (account finished signup but never completed /setup).
  if (!row.store_name || !row.embed_token) return null;

  const branding = (row.branding as Partial<WorkspaceBranding> | null) ?? {};
  return {
    id: row.id as string,
    name: row.store_name as string,
    mode: "wearable",
    status: (row.store_status as WorkspaceStatus) ?? "draft",
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
  const { data, error } = await db.from("users").select(WORKSPACE_SELECT).eq("id", ownerId).maybeSingle();

  if (error) {
    console.error("[db/workspaces getWorkspacesByOwner]", error);
    return [];
  }
  if (!data) return [];

  const workspace = rowToWorkspace(data);
  return workspace ? [workspace] : [];
}

export async function getWorkspaceByIdForOwner(id: string, ownerId: string): Promise<WorkspaceRow | null> {
  // The "workspace id" is just the owner's own id now — any other id can never resolve.
  if (id !== ownerId) return null;
  const [workspace] = await getWorkspacesByOwner(ownerId);
  return workspace ?? null;
}

export async function countWorkspacesByOwner(ownerId: string): Promise<number> {
  return (await getWorkspacesByOwner(ownerId)).length;
}

export interface CreateWorkspaceInput {
  ownerId: string;
  name: string;
  status?: WorkspaceStatus;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow | null> {
  const { data, error } = await db
    .from("users")
    .update({
      store_name: input.name,
      store_status: input.status ?? "active",
      branding: defaultBranding(),
      // No DB default for this column — must mint here, same as the old workspaces.embed_token.
      embed_token: crypto.randomUUID().replace(/-/g, ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ownerId)
    .select(WORKSPACE_SELECT)
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
  if (id !== ownerId) return null;

  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.store_name = patch.name;
  if (patch.status !== undefined) dbPatch.store_status = patch.status;
  if (patch.embedEnabled !== undefined) dbPatch.embed_enabled = patch.embedEnabled;

  if (patch.branding !== undefined) {
    // Merge onto the existing stored branding rather than clobbering it, since the settings
    // form can save partial patches (e.g. just the color) via the same PATCH endpoint.
    const existing = await getWorkspaceByIdForOwner(id, ownerId);
    const base = existing?.branding ?? defaultBranding();
    dbPatch.branding = { ...base, ...patch.branding };
  }

  const { data, error } = await db
    .from("users")
    .update(dbPatch)
    .eq("id", ownerId)
    .select(WORKSPACE_SELECT)
    .single();

  if (error || !data) {
    console.error("[db/workspaces updateWorkspace]", error);
    return null;
  }

  return rowToWorkspace(data);
}

export async function deleteWorkspace(id: string, ownerId: string): Promise<boolean> {
  if (id !== ownerId) return false;

  // "Deleting the project" now just clears the owner's store fields — the owner_id-scoped
  // event tables (cart_events, chat_events, etc.) are untouched by this, unlike the old
  // ON DELETE CASCADE from workspaces.
  const { error } = await db
    .from("users")
    .update({
      store_name: null,
      store_status: "draft",
      embed_enabled: false,
      embed_token: null,
      branding: {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", ownerId);

  if (error) {
    console.error("[db/workspaces deleteWorkspace]", error);
    return false;
  }

  return true;
}

/** Public-safe resolution used by every unauthenticated `/api/embed/*` route: turns a
 *  shopper-facing embed token into the merchant's `ownerId` plus just enough workspace
 *  metadata to render the widget, without ever exposing anything else about the account. */
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
    .from("users")
    .select("id, embed_enabled, branding")
    .eq("embed_token", token)
    .maybeSingle();

  if (error || !data) return null;

  return {
    workspaceId: data.id as string,
    ownerId: data.id as string,
    mode: "wearable",
    embedEnabled: (data.embed_enabled as boolean) ?? false,
    branding: { ...defaultBranding(), ...((data.branding as Partial<WorkspaceBranding> | null) ?? {}) },
  };
}

/** Invalidates every already-deployed snippet for this workspace immediately — used by the
 *  settings page's "Regenerate token" action, which warns the merchant about that before calling it. */
export async function regenerateEmbedToken(id: string, ownerId: string): Promise<string | null> {
  if (id !== ownerId) return null;

  const { data, error } = await db
    .from("users")
    .update({ embed_token: crypto.randomUUID().replace(/-/g, ""), updated_at: new Date().toISOString() })
    .eq("id", ownerId)
    .select("embed_token")
    .single();

  if (error || !data) {
    console.error("[db/workspaces regenerateEmbedToken]", error);
    return null;
  }

  return data.embed_token as string;
}
