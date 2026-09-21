"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Shirt, BotMessageSquare } from "lucide-react";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import { ChatInterface } from "@/modules/shopping-agent/components/chat-interface";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { WORKSPACE_MODE_LABELS } from "@/modules/workspaces/constants";
import { fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { resolveBrandCssVars } from "@/lib/branding/resolve-brand-vars";
import { CatalogReadyGate } from "@/modules/store/components/catalog-ready-gate";
import { cn } from "@/lib/utils/cn";

interface Props { params: Promise<{ id: string }> }

export default function EmbedPreviewPage({ params }: Props) {
  const { id } = use(params);
  const { workspaces } = useWorkspaceStore();
  const ws = workspaces.find((w) => w.id === id);

  React.useEffect(() => {
    if (ws) loadGoogleFont(ws.branding.fontFamily);
  }, [ws?.branding.fontFamily]);

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
          href={`/workspaces/${id}/settings`}
          className="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </Link>
        <span className="opacity-40">|</span>
        <span className="flex items-center gap-1.5">
          {ws.mode === "wearable"
            ? <Shirt className="h-3.5 w-3.5" />
            : <BotMessageSquare className="h-3.5 w-3.5" />}
          Customer Preview — {ws.name} ({WORKSPACE_MODE_LABELS[ws.mode]})
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
        {ws.mode === "wearable" ? (
          // Gated for wearable only: the unwearable assistant below searches the store API live
          // and has no index to wait on.
          <CatalogReadyGate label="The customer preview">
            <TryOnLayout
              workspaceId={id}
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
        ) : (
          <ChatInterface
            workspaceId={id}
            branding={{
              agentName: ws.branding.agentName,
              welcomeMessage: ws.branding.welcomeMessage,
              borderRadius: ws.branding.borderRadius,
              logoUrl: ws.branding.logoUrl,
            }}
          />
        )}
      </div>
    </div>
  );
}
