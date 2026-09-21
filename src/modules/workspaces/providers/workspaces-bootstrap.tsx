"use client";

import * as React from "react";
import { useWorkspaceStore } from "@/modules/workspaces/store";

/**
 * Triggers a single project fetch from the API on first dashboard mount.
 * Renders nothing — exists only to bridge the server layout into the Zustand store.
 */
export function WorkspacesBootstrap() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);

  React.useEffect(() => {
    loadWorkspace();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
