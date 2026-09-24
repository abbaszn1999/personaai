"use client";

import { use, useEffect, useState } from "react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import type { WorkspaceBranding } from "@/modules/workspaces/types";
import { toWearableBranding } from "@/modules/workspaces/branding-schema";
import { cn } from "@/lib/utils/cn";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { useEmbedHeartbeat } from "@/lib/embed/client/use-embed-heartbeat";
import { useResponsiveViewportMode } from "@/lib/hooks/use-responsive-viewport-mode";

interface Props { params: Promise<{ token: string }> }

interface EmbedConfigResponse {
  branding?: WorkspaceBranding;
  error?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; branding: WorkspaceBranding };

export default function EmbedPage({ params }: Props) {
  const { token } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rootRef, viewportMode] = useResponsiveViewportMode<HTMLDivElement>();
  const [fillViewport, setFillViewport] = useState(false);

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

  const isCompact = !fillViewport;

  return (
    <div
      ref={rootRef}
      className={cn(
        "bg-[var(--color-surface-base)] box-border",
        isCompact ? "h-auto" : "h-screen",
        // This padding exists to preview how the widget sits inside a desktop page's own
        // margins — on an actual mobile device (or any real embed, which always renders
        // edge-to-edge on the host page) it just eats into the already-tight viewport, leaves
        // a background-colored gap the shopper can't scroll from within the widget itself, and
        // shoves absolutely-positioned corner controls (e.g. the profile switcher pill) away
        // from the real screen edge they're meant to dock to. Compact onboarding keeps a
        // little inset so the short form doesn't glue itself to the screen edges.
        (viewportMode !== "mobile" || isCompact) && "p-4 sm:p-6",
        state.branding.theme === "dark" && "dark"
      )}
      style={{
        ...resolveBrandCssVars(state.branding.primaryColor),
        fontFamily: fontFamilyCssValue(state.branding.fontFamily),
      }}
    >
      <TryOnLayout
        viewportMode={viewportMode}
        embed={{ apiBase: "/api/embed", embedToken: token }}
        theme={state.branding.theme}
        branding={toWearableBranding(state.branding)}
        onFillViewportChange={setFillViewport}
      />
    </div>
  );
}
