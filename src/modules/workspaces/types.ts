export type WorkspaceMode = "wearable" | "unwearable";

export type WorkspaceStatus = "active" | "draft" | "paused";

export type WorkspaceDisplayMode = "floating" | "fullpage";

export type WorkspaceTheme = "dark" | "light";

/** Persisted branding/embed appearance settings, edited from ws-branding-editor.tsx. */
export interface WorkspaceBranding {
  agentName: string;
  welcomeMessage: string;
  logoUrl: string | null;
  primaryColor: string;
  fontFamily: string;
  borderRadius: string;
  position: string;
  displayMode: WorkspaceDisplayMode;
  /** Overall light/dark tone of the embed preview — applies uniformly across the chat panel
   *  and (for wearable) the avatar panel, instead of each defaulting to its own tone. */
  theme: WorkspaceTheme;
}

export interface Workspace {
  id: string;
  name: string;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  /** Opaque public credential a merchant pastes into their widget snippet — resolves to this
   *  workspace's owner without requiring shopper login. Safe to display, not secret-strength. */
  embedToken: string;
  embedEnabled: boolean;
  branding: WorkspaceBranding;
  createdAt: string;
  updatedAt: string;
}
