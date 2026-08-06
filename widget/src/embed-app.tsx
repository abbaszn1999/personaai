import * as React from "react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import { ChatInterface } from "@/modules/shopping-agent/components/chat-interface";
import { FloatingChatLauncher } from "@/modules/shopping-agent/components/floating-chat-launcher";
import type { WorkspaceBranding, WorkspaceMode } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { useEmbedHeartbeat } from "@/lib/embed/client/use-embed-heartbeat";
import { useResponsiveViewportMode } from "@/lib/hooks/use-responsive-viewport-mode";

interface EmbedConfigResponse {
  mode?: string;
  branding?: WorkspaceBranding;
  error?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; mode: WorkspaceMode; branding: WorkspaceBranding };

interface EmbedAppProps {
  origin: string;
  embedToken: string;
  /** Lets this component switch the host <div>'s own footprint on the merchant's page once
   *  branding loads — see applyDisplayMode in main.tsx. */
  onDisplayModeChange?: (mode: "fullpage" | "floating") => void;
}

/** The widget.js bootstrap's React root — mirrors src/app/embed/[token]/page.tsx's fetch/
 *  render logic exactly, since both are just different mount points for the same public
 *  no-login experience (this one lives inside a merchant page's Shadow DOM instead of its
 *  own standalone page). */
export function EmbedApp({ origin, embedToken, onDisplayModeChange }: EmbedAppProps) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [rootRef, viewportMode] = useResponsiveViewportMode<HTMLDivElement>();

  useEmbedHeartbeat(`${origin}/api/embed`, embedToken);

  const isFloating = state.status === "ready" && state.mode === "unwearable" && state.branding.displayMode === "floating";
  React.useEffect(() => {
    onDisplayModeChange?.(isFloating ? "floating" : "fullpage");
  }, [isFloating, onDisplayModeChange]);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`${origin}/api/embed/workspace/${embedToken}`);
        const data: EmbedConfigResponse = await res.json().catch(() => ({}));
        if (!active) return;

        if (!res.ok || !data.branding) {
          setState({ status: "error", message: data.error || "This shopping assistant isn't available." });
          return;
        }
        // `@font-face` rules registered on the host page (light DOM) are a page-global
        // browser resource — once loaded here, `font-family: 'X'` resolves correctly even
        // inside this widget's own Shadow DOM, which never sees the host page's styles.
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
  }, [origin, embedToken]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface-base)]">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface-base)] px-6">
        <p className="text-[var(--color-text-muted)] text-sm text-center max-w-sm">{state.message}</p>
      </div>
    );
  }

  // Floating unwearable: the host <div> itself is now zero-footprint (see applyDisplayMode
  // in main.tsx), so this renders as a fixed-position overlay with no wrapping block — a
  // fullpage-style wrapper here would just be an invisible 0x0 box.
  if (isFloating) {
    return (
      <div
        style={{
          ...resolveBrandCssVars(state.branding.primaryColor),
          fontFamily: fontFamilyCssValue(state.branding.fontFamily),
        }}
        className={state.branding.theme === "dark" ? "dark" : undefined}
      >
        <FloatingChatLauncher
          embed={{ apiBase: `${origin}/api/embed`, embedToken, enableRealCart: true }}
          agentName={state.branding.agentName}
          welcomeMessage={state.branding.welcomeMessage}
          logoUrl={state.branding.logoUrl}
          primaryColor={state.branding.primaryColor}
          borderRadius={state.branding.borderRadius}
          position={state.branding.position}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "h-full bg-[var(--color-surface-base)] box-border p-4 sm:p-6",
        state.branding.theme === "dark" && "dark"
      )}
      style={{
        ...resolveBrandCssVars(state.branding.primaryColor),
        fontFamily: fontFamilyCssValue(state.branding.fontFamily),
      }}
    >
      {state.mode === "wearable" ? (
        <TryOnLayout
          viewportMode={viewportMode}
          embed={{ apiBase: `${origin}/api/embed`, embedToken, enableRealCart: true }}
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
          embed={{ apiBase: `${origin}/api/embed`, embedToken, enableRealCart: true }}
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
