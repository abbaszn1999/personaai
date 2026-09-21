"use client";

import * as React from "react";
import { ArrowUp, LayoutPanelLeft, User } from "lucide-react";
import { AgentOrb } from "@/components/ui/agent-orb";

interface BrandingAgentPreviewProps {
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
  borderRadius: string;
}

const QUICK_REPLIES = ["Casual looks", "Office outfits", "Evening wear", "Something new"];

/** Non-interactive chrome that mirrors the real try-on chat so merchants can judge branding
 *  without spinning up a working agent. */
export function BrandingAgentPreview({
  agentName,
  welcomeMessage,
  logoUrl,
  borderRadius,
}: BrandingAgentPreviewProps) {
  return (
    <div className="h-full min-h-0" style={{ borderRadius, overflow: "hidden" }}>
      <div className="relative isolate h-full min-h-0 overflow-hidden pointer-events-none select-none">
        <AmbientBackdrop />
        <ChatChrome agentName={agentName} welcomeMessage={welcomeMessage} logoUrl={logoUrl} />
      </div>
    </div>
  );
}

function ChatChrome({
  agentName,
  welcomeMessage,
  logoUrl,
}: {
  agentName: string;
  welcomeMessage: string;
  logoUrl?: string | null;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden backdrop-blur-xl rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="flex items-center gap-3 shrink-0 border-b border-[var(--color-border)] px-5 py-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 shadow-sm" />
        ) : (
          <AgentOrb size="sm" animated />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-base font-bold gradient-text-brand truncate block">{agentName}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)]">Online — personalised for your profile</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden space-y-4 min-h-0 px-5 py-4">
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
          </div>
        </div>

        {/* Sample user turn — shows brand color on the bubble */}
        <div className="flex items-start gap-2.5 flex-row-reverse">
          <div className="h-8 w-8 rounded-full bg-[var(--color-brand-light)] flex items-center justify-center shrink-0 mt-0.5">
            <User className="h-4 w-4 text-[var(--color-brand)]" />
          </div>
          <div className="rounded-[var(--radius-xl)] rounded-br-[var(--radius-sm)] px-4 py-2.5 text-sm leading-relaxed bg-[var(--color-accent)]/90 text-white max-w-[88%]">
            Show me something casual for the weekend.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 shrink-0 px-5 pb-2">
        {QUICK_REPLIES.map((qr) => (
          <span
            key={qr}
            className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)]"
          >
            {qr}
          </span>
        ))}
      </div>

      <div className="border-t border-[var(--color-border)] flex gap-2 shrink-0 px-5 py-4">
        <div className="flex-1 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-full)] text-[var(--color-text-muted)] flex items-center">
          Ask about clothes, style, sizing…
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
