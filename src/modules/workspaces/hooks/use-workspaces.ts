"use client";

import { useWorkspaceStore } from "@/modules/workspaces/store";

export function useWorkspaces() {
  const store = useWorkspaceStore();
  return {
    workspaces:        store.workspaces,
    activeWorkspaceId: store.activeWorkspaceId,
    activeWorkspace:   store.activeWorkspace(),
    setActive:         store.setActiveWorkspace,
    add:               store.addWorkspace,
    update:            store.updateWorkspace,
    remove:            store.removeWorkspace,
  };
}
