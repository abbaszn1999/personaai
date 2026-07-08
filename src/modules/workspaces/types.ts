export type WorkspaceMode = "wearable" | "unwearable";

export type WorkspaceStatus = "active" | "draft" | "paused";

export interface Workspace {
  id: string;
  name: string;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}
