"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Shirt } from "lucide-react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { CatalogReadyGate } from "@/modules/store/components/catalog-ready-gate";
import { cn } from "@/lib/utils/cn";

export default function CustomerPreviewPage() {
  const ws = useWorkspaceStore((s) => s.workspace);
  const hasLoaded = useWorkspaceStore((s) => s.hasLoaded);

  React.useEffect(() => {
    if (ws) loadGoogleFont(ws.branding.fontFamily);
  }, [ws?.branding.fontFamily]);

  if (!hasLoaded) {
    return <div className="h-screen bg-[var(--color-surface-base)]" />;
  }

  if (!ws) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-surface-base)]">
        <p className="text-[var(--color-text-muted)]">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--color-surface-base)]">
      {/* Thin banner indicating this is the customer preview */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[var(--color-brand)] text-white text-xs font-medium shrink-0">
        <Link
          href="/branding"
          className="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Branding
        </Link>
        <span className="opacity-40">|</span>
        <span className="flex items-center gap-1.5">
          <Shirt className="h-3.5 w-3.5" />
          Customer Preview — {ws.name}
        </span>
        <span className="ml-auto opacity-70">This is how shoppers will see your widget</span>
      </div>

      {/* Full-height agent frame — no sidebar */}
      <div
        className={cn(
          "flex-1 overflow-hidden box-border p-4 sm:p-6",
          ws.branding.theme === "dark" && "dark"
        )}
        style={{
          ...resolveBrandCssVars(ws.branding.primaryColor),
          fontFamily: fontFamilyCssValue(ws.branding.fontFamily),
        }}
      >
        <CatalogReadyGate label="The customer preview">
          <TryOnLayout
            workspaceId={ws.id}
            theme={ws.branding.theme}
            branding={{
              agentName: ws.branding.agentName,
              welcomeMessage: ws.branding.welcomeMessage,
              logoUrl: ws.branding.logoUrl,
              borderRadius: ws.branding.borderRadius,
              liveTryOnEnabled: ws.branding.liveTryOnEnabled,
            }}
          />
        </CatalogReadyGate>
      </div>
    </div>
  );
}
