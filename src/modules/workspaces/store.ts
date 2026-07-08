"use client";

import { create } from "zustand";
import type { Workspace } from "@/modules/workspaces/types";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  loadWorkspaces: () => Promise<void>;
  setActiveWorkspace: (id: string) => void;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
  removeWorkspace: (id: string) => void;
  activeWorkspace: () => Workspace | null;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,

  loadWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const workspaces: Workspace[] = data.workspaces ?? [];
        set((s) => ({
          workspaces,
          isLoading: false,
          // Keep active selection if it still exists, else default to first
          activeWorkspaceId:
            s.activeWorkspaceId && workspaces.some((w) => w.id === s.activeWorkspaceId)
              ? s.activeWorkspaceId
              : (workspaces[0]?.id ?? null),
        }));
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  addWorkspace: (workspace) =>
    set((s) => ({
      workspaces: [...s.workspaces, workspace],
      activeWorkspaceId: s.activeWorkspaceId ?? workspace.id,
    })),

  updateWorkspace: (id, patch) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w
      ),
    })),

  removeWorkspace: (id) =>
    set((s) => {
      const remaining = s.workspaces.filter((w) => w.id !== id);
      return {
        workspaces: remaining,
        activeWorkspaceId:
          s.activeWorkspaceId === id ? (remaining[0]?.id ?? null) : s.activeWorkspaceId,
      };
    }),

  activeWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get();
    return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  },
}));
