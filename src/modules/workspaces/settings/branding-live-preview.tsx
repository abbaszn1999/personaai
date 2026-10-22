"use client";

import * as React from "react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import { DESKTOP_AGENT_STAGE, PreviewViewportShell } from "@/modules/wearable-agent/components/preview-viewport-shell";
import { ShopperSignIn } from "@/modules/wearable-agent/components/onboarding/shopper-sign-in";
import { WearableThemeProvider } from "@/modules/wearable-agent/theme-context";
import { WearableBrandingProvider } from "@/modules/wearable-agent/branding-context";
import { demoAudienceFor } from "@/modules/wearable-agent/demo-profile";
import type { TryOnAudience } from "@/modules/wearable-agent/types";
import { useCatalogReadiness } from "@/modules/store/components/catalog-ready-gate";
import { toWearableBranding } from "@/modules/workspaces/branding-schema";
import type { WorkspaceBranding } from "@/modules/workspaces/types";
import { fontFamilyCssValue } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars, resolveRadiusCssVars } from "@/lib/branding/resolve-brand-vars";
import { cn } from "@/lib/utils/cn";

export type PreviewDevice = "desktop" | "mobile";
export type PreviewScreen = "chat" | "sign-in";

/** Same frame the real desktop embed uses, scaled down to fit this panel. */
const DESKTOP_STAGE = DESKTOP_AGENT_STAGE;

interface BrandingLivePreviewProps {
  /** The unsaved form, so every edit shows up immediately. */
  branding: WorkspaceBranding;
  device: PreviewDevice;
  screen: PreviewScreen;
  workspaceId: string;
  /** The departments the store sells; the first one is the shopper the preview starts as. */
  audiences?: TryOnAudience[];
  /** Changing this throws the whole conversation away and starts a fresh shopper. */
  resetKey: number;
}

/**
 * The real widget, running inside the branding page.
 *
 * It is the same `TryOnLayout` shoppers get, driven by the form's unsaved branding. Instead of
 * sign-in and avatar creation it starts as a ready-made shopper (see `demo-profile.ts`), so the
 * chat, size advice, Wear and cart can all be tried at once. Chat and try-on are live: they call
 * the same endpoints as the customer preview and use the workspace's credits.
 */
export function BrandingLivePreview({
  branding,
  device,
  screen,
  workspaceId,
  audiences,
  resetKey,
}: BrandingLivePreviewProps) {
  const wearable = React.useMemo(() => toWearableBranding(branding), [branding]);
  const demoAudience = demoAudienceFor(audiences);
  const demo = React.useMemo(() => ({ audience: demoAudience }), [demoAudience]);
  const catalog = useCatalogReadiness();
  const desktop = device === "desktop";

  const surfaceStyle: React.CSSProperties = {
    ...resolveBrandCssVars(branding.primaryColor),
    fontFamily: fontFamilyCssValue(branding.fontFamily),
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden",
        desktop &&
          "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]"
      )}
    >
      {desktop && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
          <div className="ml-2 flex h-5 flex-1 items-center rounded-full bg-[var(--color-surface-base)] px-3 text-[10px] text-[var(--color-text-muted)]">
            yourstore.com
          </div>
        </div>
      )}

      {catalog.state !== "ready" && catalog.state !== "loading" && (
        <p className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-warning-light,#fef3c7)] px-3 py-1.5 text-center text-[11px] text-[var(--color-text-secondary)]">
          Your catalog isn&apos;t ready yet, so the assistant can&apos;t find products. The design is still accurate.
        </p>
      )}

      {/* Pins the widget's own light/dark tokens, so the dashboard's theme never leaks into it. */}
      <div
        className={cn(
          "embed-preview-surface relative min-h-0 flex-1 overflow-hidden bg-[var(--color-surface-base)]",
          branding.theme === "dark" && "dark"
        )}
        style={surfaceStyle}
      >
        {/* The chat stays mounted while the sign-in screen is shown, so a conversation survives a
            quick look at the other screen. */}
        <div className={cn("h-full", screen !== "chat" && "hidden")}>
          <ScaledStage stage={desktop ? DESKTOP_STAGE : null}>
            <div className={cn("h-full", desktop && "p-6")}>
              <TryOnLayout
                key={`${resetKey}:${demoAudience}`}
                viewportMode={device}
                theme={branding.theme}
                branding={wearable}
                workspaceId={workspaceId}
                audiences={audiences}
                demo={demo}
              />
            </div>
          </ScaledStage>
        </div>

        {screen === "sign-in" && (
          <div className="h-full">
            <WearableThemeProvider theme={branding.theme}>
              <WearableBrandingProvider branding={wearable}>
                <div
                  className={cn("relative h-full min-h-0 overflow-hidden", branding.theme === "dark" && "dark")}
                  style={{ borderRadius: branding.borderRadius, ...resolveRadiusCssVars(branding.borderRadius) }}
                >
                  <PreviewViewportShell mode={device} layout="card">
                    <SignInPreview />
                  </PreviewViewportShell>
                </div>
              </WearableBrandingProvider>
            </WearableThemeProvider>
          </div>
        )}
      </div>
    </div>
  );
}

/** The real sign-in screen, with the network replaced: no email is sent and no code is accepted. */
function SignInPreview() {
  const [note, setNote] = React.useState<string | null>(null);

  const requestCode = React.useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return true;
  }, []);
  const verifyCode = React.useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    setNote("This is a preview: no email was sent, so no code is accepted.");
    return { ok: false };
  }, []);

  return <ShopperSignIn error={note} onRequestCode={requestCode} onVerifyCode={verifyCode} />;
}

/**
 * Lays its children out at a fixed size and scales that down to fit the panel (never up). The
 * same elements are rendered whether or not a stage is given, so switching between desktop and
 * mobile keeps the conversation instead of remounting it.
 */
function ScaledStage({
  stage,
  children,
}: {
  stage: { width: number; height: number } | null;
  children: React.ReactNode;
}) {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  const scale = stage && size.width > 0 && size.height > 0 ? Math.min(1, size.width / stage.width, size.height / stage.height) : 1;

  return (
    <div ref={setHost} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className={stage ? "relative shrink-0" : "h-full w-full"}
        style={stage ? { width: stage.width * scale, height: stage.height * scale } : undefined}
      >
        <div
          className={stage ? "absolute left-0 top-0" : "h-full w-full"}
          style={
            stage
              ? { width: stage.width, height: stage.height, transform: `scale(${scale})`, transformOrigin: "top left" }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
