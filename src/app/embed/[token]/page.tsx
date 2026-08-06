"use client";

import { use, useEffect, useState } from "react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import { ChatInterface } from "@/modules/shopping-agent/components/chat-interface";
import { FloatingChatLauncher } from "@/modules/shopping-agent/components/floating-chat-launcher";
import type { WorkspaceBranding, WorkspaceMode } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { useEmbedHeartbeat } from "@/lib/embed/client/use-embed-heartbeat";
import { useResponsiveViewportMode } from "@/lib/hooks/use-responsive-viewport-mode";

interface Props { params: Promise<{ token: string }> }

interface EmbedConfigResponse {
  mode?: string;
  branding?: WorkspaceBranding;
  error?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; mode: WorkspaceMode; branding: WorkspaceBranding };

export default function EmbedPage({ params }: Props) {
  const { token } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rootRef, viewportMode] = useResponsiveViewportMode<HTMLDivElement>();

  useEmbedHeartbeat("/api/embed", token);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/embed/workspace/${token}`);
        const data: EmbedConfigResponse = await res.json().catch(() => ({}));
        if (!active) return;

        if (!res.ok || !data.branding) {
          setState({ status: "error", message: data.error || "This shopping assistant isn't available." });
          return;
        }
        loadGoogleFont(data.branding.fontFamily);
        setState({
          status: "ready",
          mode: data.mode === "unwearable" ? "unwearable" : "wearable",
          branding: data.branding,
        });
      } catch {
        if (active) setState({ status: "error", message: "Couldn't connect — please try again shortly." });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-surface-base)]">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-surface-base)] px-6">
        <p className="text-[var(--color-text-muted)] text-center max-w-sm">{state.message}</p>
      </div>
    );
  }

  const isFloating = state.mode === "unwearable" && state.branding.displayMode === "floating";

  return (
    <div
      ref={rootRef}
      className={cn(
        "h-screen bg-[var(--color-surface-base)] box-border",
        !isFloating && "p-4 sm:p-6",
        state.branding.theme === "dark" && "dark"
      )}
      style={{
        ...resolveBrandCssVars(state.branding.primaryColor),
        fontFamily: fontFamilyCssValue(state.branding.fontFamily),
      }}
    >
      {isFloating ? (
        // Preview of a floating launcher over an (otherwise empty) page background — same
        // fixed-position component the real widget mounts, just without a merchant page
        // behind it.
        <FloatingChatLauncher
          embed={{ apiBase: "/api/embed", embedToken: token }}
          agentName={state.branding.agentName}
          welcomeMessage={state.branding.welcomeMessage}
          logoUrl={state.branding.logoUrl}
          primaryColor={state.branding.primaryColor}
          borderRadius={state.branding.borderRadius}
          position={state.branding.position}
        />
      ) : state.mode === "wearable" ? (
        <TryOnLayout
          viewportMode={viewportMode}
          embed={{ apiBase: "/api/embed", embedToken: token }}
          theme={state.branding.theme}
          branding={{
            agentName: state.branding.agentName,
            welcomeMessage: state.branding.welcomeMessage,
            logoUrl: state.branding.logoUrl,
            borderRadius: state.branding.borderRadius,
          }}
        />
      ) : (
        <ChatInterface
          viewportMode={viewportMode}
          embed={{ apiBase: "/api/embed", embedToken: token }}
          branding={{
            agentName: state.branding.agentName,
            welcomeMessage: state.branding.welcomeMessage,
            borderRadius: state.branding.borderRadius,
            logoUrl: state.branding.logoUrl,
          }}
        />
      )}
    </div>
  );
}
