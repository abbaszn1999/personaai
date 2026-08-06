"use client";

import * as React from "react";
import { ArrowUp, LayoutPanelLeft, MessageCircle, Minimize2, Package, User } from "lucide-react";
import { AgentOrb } from "@/components/ui/agent-orb";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceMode } from "@/modules/workspaces/types";

interface BrandingAgentPreviewProps {
  mode: WorkspaceMode;
  displayMode: "floating" | "fullpage";
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
  primaryColor: string;
  borderRadius: string;
  position: string;
}

const UNWEARABLE_QUICK = ["WiFi issues", "Home office setup", "Gaming gear", "Best laptop for work"];
const UNWEARABLE_INLINE = ["Fix a tech problem", "Home office setup", "Gaming setup", "Smart home / networking"];
const WEARABLE_QUICK = ["Casual looks", "Office outfits", "Evening wear", "Something new"];

/** Non-interactive chrome that mirrors the real ChatInterface / TryOn chat / floating launcher
 *  so merchants can judge branding without spinning up a working agent. */
export function BrandingAgentPreview({
  mode,
  displayMode,
  agentName,
  welcomeMessage,
  logoUrl,
  primaryColor,
  borderRadius,
  position,
}: BrandingAgentPreviewProps) {
  if (mode === "unwearable" && displayMode === "floating") {
    return (
      <FloatingPreview
        agentName={agentName}
        welcomeMessage={welcomeMessage}
        logoUrl={logoUrl}
        primaryColor={primaryColor}
        borderRadius={borderRadius}
        position={position}
      />
    );
  }

  if (mode === "wearable") {
    return (
      <div className="h-full min-h-0" style={{ borderRadius, overflow: "hidden" }}>
        <WearableFullPreview agentName={agentName} welcomeMessage={welcomeMessage} logoUrl={logoUrl} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0" style={{ borderRadius, overflow: "hidden" }}>
      <UnwearableFullPreview agentName={agentName} welcomeMessage={welcomeMessage} logoUrl={logoUrl} />
    </div>
  );
}

function UnwearableFullPreview({
  agentName,
  welcomeMessage,
  logoUrl,
}: {
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
}) {
  return (
    <div className="relative isolate flex h-full min-h-0 overflow-hidden pointer-events-none select-none">
      <AmbientBackdrop />
      <div className="flex-1 min-w-0 h-full min-h-0">
        <ChatChrome
          mode="unwearable"
          agentName={agentName}
          welcomeMessage={welcomeMessage}
          logoUrl={logoUrl}
          statusLine="Online — finding the best solutions for you"
          placeholder="Describe your need or problem…"
          quickReplies={UNWEARABLE_QUICK}
          inlineOptions={UNWEARABLE_INLINE}
        />
      </div>
      <div className="w-4 shrink-0" />
      <div className="w-[280px] shrink-0 h-full min-h-0 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] backdrop-blur-xl overflow-hidden flex flex-col items-center justify-center px-6 text-center">
        <Package className="h-10 w-10 text-[var(--color-text-muted)] mb-3 opacity-50" />
        <p className="text-[13px] font-semibold text-[var(--color-text-secondary)] mb-1">Solution Board</p>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Start chatting and I&apos;ll build your<br />personal solution kit here.
        </p>
      </div>
    </div>
  );
}

function WearableFullPreview({
  agentName,
  welcomeMessage,
  logoUrl,
}: {
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
}) {
  return (
    <div className="relative isolate h-full min-h-0 overflow-hidden pointer-events-none select-none">
      <AmbientBackdrop />
      <ChatChrome
        mode="wearable"
        agentName={agentName}
        welcomeMessage={welcomeMessage}
        logoUrl={logoUrl}
        statusLine="Online — personalised for your profile"
        placeholder="Ask about clothes, style, sizing…"
        quickReplies={WEARABLE_QUICK}
      />
    </div>
  );
}

function FloatingPreview({
  agentName,
  welcomeMessage,
  logoUrl,
  primaryColor,
  borderRadius,
  position,
}: {
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
  primaryColor: string;
  borderRadius: string;
  position: string;
}) {
  const [open, setOpen] = React.useState(true);
  const sideClass = position === "bottom-left" ? "left-5" : "right-5";

  return (
    <>
      <div className="absolute inset-0 p-6 grid grid-cols-3 gap-4 opacity-[0.12] pointer-events-none select-none">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-[var(--color-text-muted)] aspect-[3/4]" />
        ))}
      </div>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "absolute bottom-5 z-10 flex items-center gap-2 shadow-xl px-4 py-2.5 transition-transform hover:scale-105",
            sideClass
          )}
          style={{ background: primaryColor, borderRadius }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
          ) : (
            <MessageCircle className="h-4 w-4 text-white" />
          )}
          <span className="text-white text-sm font-semibold">{agentName}</span>
        </button>
      )}

      {open && (
        <div
          className={cn(
            "absolute bottom-5 z-10 w-[360px] max-w-[92%] h-[560px] max-h-[85%] shadow-2xl overflow-hidden flex flex-col",
            sideClass
          )}
          style={{ borderRadius }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: primaryColor }}>
            <div className="flex items-center gap-2 min-w-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-white/25 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {agentName.charAt(0)}
                </div>
              )}
              <p className="text-white text-sm font-semibold leading-none truncate">{agentName}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
              aria-label="Minimize preview"
            >
              <Minimize2 className="h-3 w-3 text-white" />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-[var(--color-surface-card)] pointer-events-none select-none">
            <ChatChrome
              mode="unwearable"
              agentName={agentName}
              welcomeMessage={welcomeMessage}
              logoUrl={logoUrl}
              statusLine="Online — finding the best solutions for you"
              placeholder="Describe your need or problem…"
              quickReplies={UNWEARABLE_QUICK}
              inlineOptions={UNWEARABLE_INLINE}
              compact
            />
          </div>
        </div>
      )}
    </>
  );
}

function ChatChrome({
  mode,
  agentName,
  welcomeMessage,
  logoUrl,
  statusLine,
  placeholder,
  quickReplies,
  inlineOptions,
  compact = false,
}: {
  mode: WorkspaceMode;
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
  statusLine: string;
  placeholder: string;
  quickReplies: string[];
  inlineOptions?: string[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 overflow-hidden backdrop-blur-xl",
        compact
          ? "bg-transparent"
          : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
      )}
    >
      <div className={cn("flex items-center gap-3 shrink-0 border-b border-[var(--color-border)]", compact ? "px-3 py-3" : "px-5 py-4")}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 shadow-sm" />
        ) : (
          <AgentOrb mode={mode} size="sm" animated />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-base font-bold gradient-text-brand truncate block">{agentName}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)]">{statusLine}</span>
          </div>
        </div>
      </div>

      <div className={cn("flex-1 overflow-hidden space-y-4 min-h-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        <div className="flex items-start gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5 shadow-sm" />
          ) : (
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <LayoutPanelLeft className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 items-start max-w-[88%]">
            <div className="rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] px-4 py-2.5 text-sm leading-relaxed bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)]">
              {welcomeMessage || "Hi! How can I help you today?"}
            </div>
            {inlineOptions && inlineOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {inlineOptions.map((opt) => (
                  <span
                    key={opt}
                    className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)]"
                  >
                    {opt}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sample user turn — shows brand color on the bubble */}
        <div className="flex items-start gap-2.5 flex-row-reverse">
          <div className="h-8 w-8 rounded-full bg-[var(--color-brand-light)] flex items-center justify-center shrink-0 mt-0.5">
            <User className="h-4 w-4 text-[var(--color-brand)]" />
          </div>
          <div className="rounded-[var(--radius-xl)] rounded-br-[var(--radius-sm)] px-4 py-2.5 text-sm leading-relaxed bg-[var(--color-accent)]/90 text-white max-w-[88%]">
            {mode === "wearable" ? "Show me something casual for the weekend." : "I need a better home WiFi setup."}
          </div>
        </div>
      </div>

      <div className={cn("flex flex-wrap gap-2 shrink-0", compact ? "px-3 pb-2" : "px-5 pb-2")}>
        {quickReplies.map((qr) => (
          <span
            key={qr}
            className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)]"
          >
            {qr}
          </span>
        ))}
      </div>

      <div className={cn("border-t border-[var(--color-border)] flex gap-2 shrink-0", compact ? "px-3 py-3" : "px-5 py-4")}>
        <div className="flex-1 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-full)] text-[var(--color-text-muted)] flex items-center">
          {placeholder}
        </div>
        <div className="h-10 w-10 rounded-full gradient-brand text-white flex items-center justify-center shrink-0">
          <ArrowUp className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background:
          "radial-gradient(60% 50% at 12% 8%, var(--color-brand-light), transparent 65%), " +
          "radial-gradient(55% 45% at 92% 88%, var(--color-accent-light), transparent 65%)",
      }}
    />
  );
}
