"use client";

import * as React from "react";
import { ArrowRight, ArrowUp, LayoutPanelLeft, Mail, MessageCircle, Shirt, User } from "lucide-react";
import { AgentOrb } from "@/components/ui/agent-orb";
import { resolveWearableBranding } from "@/modules/wearable-agent/branding-context";
import type { WorkspaceBranding } from "@/modules/workspaces/types";
import { cn } from "@/lib/utils/cn";

export type PreviewDevice = "desktop" | "mobile";
export type PreviewScreen = "chat" | "sign-in" | "launcher";

interface BrandingAgentPreviewProps {
  branding: WorkspaceBranding;
  device: PreviewDevice;
  screen: PreviewScreen;
}

/** Non-interactive chrome that mirrors the real widget screens so merchants can judge
 *  branding without spinning up a working agent. */
export function BrandingAgentPreview({ branding, device, screen }: BrandingAgentPreviewProps) {
  const resolved = resolveWearableBranding(branding);
  const mobile = device === "mobile";

  const radius = branding.borderRadius;
  return (
    <div
      className="relative isolate h-full min-h-0 overflow-hidden pointer-events-none select-none"
      style={{ borderRadius: radius, ["--brand-radius" as string]: radius }}
    >
      <AmbientBackdrop />
      {screen === "sign-in" && (
        <SignInScreen radius={radius} agentName={resolved.agentName} logoUrl={resolved.logoUrl} message={resolved.signInMessage} />
      )}
      {screen === "chat" && (
        <ChatScreen
          radius={radius}
          compact={mobile}
          agentName={resolved.agentName}
          statusText={resolved.statusText}
          welcomeMessage={branding.welcomeMessage}
          logoUrl={resolved.logoUrl}
          placeholder={resolved.inputPlaceholder}
          quickReplies={resolved.quickReplies.map((q) => q.label)}
        />
      )}
      {screen === "launcher" && (
        <LauncherScreen radius={radius} agentName={resolved.agentName} logoUrl={resolved.logoUrl} label={resolved.launcherLabel} />
      )}
    </div>
  );
}

function BrandMark({ logoUrl, size = "sm" }: { logoUrl: string | null; size?: "sm" | "xs" }) {
  const box = size === "sm" ? "h-8 w-8" : "h-5 w-5";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={cn(box, "rounded-full object-cover shrink-0 shadow-sm")} />;
  }
  return size === "sm" ? <AgentOrb size="sm" animated /> : <MessageCircle className="h-5 w-5 shrink-0 text-[var(--color-brand)]" />;
}

function ChatScreen({
  radius,
  compact,
  agentName,
  statusText,
  welcomeMessage,
  logoUrl,
  placeholder,
  quickReplies,
}: {
  radius: string;
  compact: boolean;
  agentName: string;
  statusText: string;
  welcomeMessage: string;
  logoUrl: string | null;
  placeholder: string;
  quickReplies: string[];
}) {
  const pad = compact ? "px-3" : "px-5";
  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 overflow-hidden backdrop-blur-xl bg-[var(--color-surface-card)]",
        compact ? "border-0" : "border border-[var(--color-border)]"
      )}
      style={{ borderRadius: radius }}
    >
      <div className={cn("flex items-center justify-center gap-2.5 shrink-0 border-b border-[var(--color-border)]", pad, compact ? "py-3" : "py-4")}>
        <BrandMark logoUrl={logoUrl} />
        <div className="min-w-0 text-left">
          <span className="text-base font-bold gradient-text-brand truncate block">{agentName}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)] truncate">{statusText}</span>
          </div>
        </div>
      </div>

      <div className={cn("flex-1 overflow-hidden space-y-4 min-h-0 py-4", pad)}>
        <div className="flex items-start gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5 shadow-sm" />
          ) : (
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <LayoutPanelLeft className="h-4 w-4 text-white" />
            </div>
          )}
          <div style={{ borderRadius: radius }} className="px-4 py-2.5 text-sm leading-relaxed bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] max-w-[85%] break-words">
            {welcomeMessage.trim() || "Hi! How can I help you today?"}
          </div>
        </div>

        <div className="flex items-start gap-2.5 flex-row-reverse">
          <div className="h-8 w-8 rounded-full bg-[var(--color-brand-light)] flex items-center justify-center shrink-0 mt-0.5">
            <User className="h-4 w-4 text-[var(--color-brand)]" />
          </div>
          <div style={{ borderRadius: radius }} className="px-4 py-2.5 text-sm leading-relaxed gradient-brand text-white max-w-[85%]">
            Show me something casual for the weekend.
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 shrink-0" />
          <div className="flex gap-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="w-28 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-base)]"
                style={{ borderRadius: radius }}
              >
                <div className="flex h-20 items-center justify-center bg-[var(--color-brand-light)]">
                  <Shirt className="h-7 w-7 text-[var(--color-brand)]" />
                </div>
                <div className="space-y-1.5 p-2">
                  <span className="block h-2 w-16 rounded bg-[var(--color-border)]" />
                  <span className="block h-2 w-10 rounded bg-[var(--color-border)]" />
                  <span style={{ borderRadius: radius }} className="mt-1 block gradient-brand py-1 text-center text-[9px] font-semibold text-white">
                    Try it on
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {quickReplies.length > 0 && (
        <div className={cn("flex flex-wrap gap-2 shrink-0 pb-2", pad)}>
          {quickReplies.map((qr) => (
            <span
              key={qr}
              style={{ borderRadius: radius }}
              className="text-xs border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)]"
            >
              {qr}
            </span>
          ))}
        </div>
      )}

      <div className={cn("border-t border-[var(--color-border)] flex gap-2 shrink-0", pad, compact ? "py-3" : "py-4")}>
        <div style={{ borderRadius: radius }} className="flex-1 min-w-0 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center">
          <span className="truncate">{placeholder}</span>
        </div>
        <div style={{ borderRadius: radius }} className="h-10 w-10 gradient-brand text-white flex items-center justify-center shrink-0">
          <ArrowUp className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SignInScreen({ radius, agentName, logoUrl, message }: { radius: string; agentName: string; logoUrl: string | null; message: string }) {
  return (
    <div style={{ borderRadius: radius }} className="flex h-full flex-col items-center justify-center gap-6 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-card)] px-6 text-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" style={{ borderRadius: radius }} className="h-16 w-16 object-cover shadow-lg" />
      ) : (
        <div style={{ borderRadius: radius }} className="flex h-16 w-16 items-center justify-center gradient-violet shadow-lg">
          <Mail className="h-7 w-7 text-white" />
        </div>
      )}
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Sign in to {agentName}</h2>
        <p className="mt-2 max-w-xs mx-auto text-sm text-[var(--color-text-muted)] break-words">{message}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4 text-left">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">Email</span>
          <div style={{ borderRadius: radius }} className="flex h-12 items-center border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-base text-[var(--color-text-muted)]">
            you@email.com
          </div>
        </div>
        <div style={{ borderRadius: radius }} className="flex h-12 items-center justify-center gap-2 gradient-violet text-sm font-semibold text-white">
          Continue <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function LauncherScreen({ radius, agentName, logoUrl, label }: { radius: string; agentName: string; logoUrl: string | null; label: string }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--color-surface-card)]">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex h-[70%] w-[62%] items-end justify-center rounded-[40%_40%_12px_12px] bg-gradient-to-b from-[var(--color-brand-light)] to-transparent">
          <Shirt className="mb-[30%] h-16 w-16 text-[var(--color-brand)] opacity-60" />
        </div>
      </div>
      <div className="flex justify-center px-3 pb-8">
        <div style={{ borderRadius: radius }} className="flex min-h-14 items-center gap-2.5 border border-[var(--color-border)] bg-[var(--color-surface-base)]/90 pl-2.5 pr-5 shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-violet">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <MessageCircle className="h-[18px] w-[18px] text-white" />
            )}
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{agentName}</span>
            <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
              {label}
            </span>
          </span>
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
