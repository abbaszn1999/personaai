import * as React from "react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
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
  onDisplayModeChange?: (mode: "fullpage" | "floating" | "compact") => void;
}

/** The widget.js bootstrap's React root — mirrors src/app/embed/[token]/page.tsx's fetch/
 *  render logic exactly, since both are just different mount points for the same public
 *  no-login experience (this one lives inside a merchant page's Shadow DOM instead of its
 *  own standalone page). */
export function EmbedApp({ origin, embedToken, onDisplayModeChange }: EmbedAppProps) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [rootRef, viewportMode] = useResponsiveViewportMode<HTMLDivElement>();
  const [fillViewport, setFillViewport] = React.useState(false);

  useEmbedHeartbeat(`${origin}/api/embed`, embedToken);

  const isCompact = !fillViewport;
  React.useLayoutEffect(() => {
    onDisplayModeChange?.(isCompact ? "compact" : "fullpage");
  }, [isCompact, onDisplayModeChange]);

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
          mode: "wearable",
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
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-4 py-3 text-center text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-elevated)] max-w-sm">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        // Transparent by design — this box sits directly on the merchant's own page
        // background (any color/pattern), so only the card/panel surfaces inside it (which
        // keep their own bg + shadow) should ever paint a background.
        "box-border p-4 sm:p-6",
        isCompact ? "h-auto" : "h-full",
        state.branding.theme === "dark" && "dark"
      )}
      style={{
        ...resolveBrandCssVars(state.branding.primaryColor),
        fontFamily: fontFamilyCssValue(state.branding.fontFamily),
      }}
    >
      <TryOnLayout
        viewportMode={viewportMode}
        embed={{ apiBase: `${origin}/api/embed`, embedToken, enableRealCart: true }}
        theme={state.branding.theme}
        branding={{
          agentName: state.branding.agentName,
          welcomeMessage: state.branding.welcomeMessage,
          logoUrl: state.branding.logoUrl,
          borderRadius: state.branding.borderRadius,
          liveTryOnEnabled: state.branding.liveTryOnEnabled,
        }}
        onFillViewportChange={setFillViewport}
      />
    </div>
  );
}
