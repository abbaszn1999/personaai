import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
import type { WorkspaceMode } from "@/modules/workspaces/types";

export async function resolveBillingWorkspaceMode(
  ownerId: string,
  workspaceId?: string | null
): Promise<WorkspaceMode | null> {
  if (workspaceId) {
    return (await getWorkspaceByIdForOwner(workspaceId, ownerId))?.mode ?? null;
  }
  return (await getWorkspacesByOwner(ownerId))[0]?.mode ?? null;
}
