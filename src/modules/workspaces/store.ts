"use client";

import { create } from "zustand";
import type { Workspace } from "@/modules/workspaces/types";

// Every account has at most one project now (see 0005_workspace_limit_one and the phase 7
// route flattening) — this store holds that single project directly instead of an array +
// "active id" pointer. `workspace` is `null` until the account finishes onboarding.
interface WorkspaceState {
  workspace: Workspace | null;
  isLoading: boolean;
  loadWorkspace: () => Promise<void>;
  setWorkspace: (workspace: Workspace | null) => void;
  updateWorkspace: (patch: Partial<Workspace>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  isLoading: false,

  loadWorkspace: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const workspaces: Workspace[] = data.workspaces ?? [];
        set({ workspace: workspaces[0] ?? null, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setWorkspace: (workspace) => set({ workspace }),

  updateWorkspace: (patch) =>
    set((s) => ({
      workspace: s.workspace ? { ...s.workspace, ...patch, updatedAt: new Date().toISOString() } : s.workspace,
    })),
}));
