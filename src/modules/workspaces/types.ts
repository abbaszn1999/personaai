import type { StoreConnection } from "@/modules/store/types";

export type WorkspaceMode = "wearable" | "unwearable";

export type WorkspaceStatus = "active" | "draft" | "paused";

export interface Workspace {
  id: string;
  name: string;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  storeConnection: StoreConnection | null;
  selectedCategoryIds: string[];
  createdAt: string;
  updatedAt: string;
}
