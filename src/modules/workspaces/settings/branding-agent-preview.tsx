"use client";

import * as React from "react";
import {
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronDown,
  LayoutPanelLeft,
  Mail,
  Maximize2,
  MessageCircle,
  Pencil,
  Shirt,
  ShoppingBag,
  User,
} from "lucide-react";
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
export function BrandingAgentPreview({
  branding,
  device,
  screen,
}: BrandingAgentPreviewProps) {
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
        <SignInScreen
          radius={radius}
          agentName={resolved.agentName}
          logoUrl={resolved.logoUrl}
          message={resolved.signInMessage}
        />
      )}
      {screen === "chat" && !mobile && (
        <div className="relative flex h-full min-h-0 gap-3">
          <div className="min-h-0 min-w-0 flex-1">
            <ChatScreen
              radius={radius}
              compact={false}
              agentName={resolved.agentName}
              statusText={resolved.statusText}
              welcomeMessage={branding.welcomeMessage}
              logoUrl={resolved.logoUrl}
              placeholder={resolved.inputPlaceholder}
              quickReplies={resolved.quickReplies.map((q) => q.label)}
            />
          </div>
          <div className="min-h-0 w-[46%] shrink-0">
            <AvatarPanelScreen
              radius={radius}
              theme={branding.theme}
              backdropId={resolved.studioBackdropId}
              liveTryOnEnabled={resolved.liveTryOnEnabled}
            />
          </div>
        </div>
      )}
      {screen === "chat" && mobile && (
        <MobileStage
          radius={radius}
          backdropId={resolved.studioBackdropId}
          liveTryOnEnabled={resolved.liveTryOnEnabled}
          sheetOpen
        >
          <MobileChatSheet
            radius={radius}
            agentName={resolved.agentName}
            welcomeMessage={branding.welcomeMessage}
            logoUrl={resolved.logoUrl}
            placeholder={resolved.inputPlaceholder}
          />
        </MobileStage>
      )}
      {screen === "launcher" && (
        <MobileStage
          radius={radius}
          backdropId={resolved.studioBackdropId}
          liveTryOnEnabled={resolved.liveTryOnEnabled}
        >
          <LauncherPill
            radius={radius}
            agentName={resolved.agentName}
            logoUrl={resolved.logoUrl}
            label={resolved.launcherLabel}
          />
        </MobileStage>
      )}
    </div>
  );
}

function BrandMark({
  logoUrl,
  size = "sm",
}: {
  logoUrl: string | null;
  size?: "sm" | "xs";
}) {
  const box = size === "sm" ? "h-8 w-8" : "h-5 w-5";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn(box, "rounded-full object-cover shrink-0 shadow-sm")}
      />
    );
  }
  return size === "sm" ? (
    <AgentOrb size="sm" animated />
  ) : (
    <MessageCircle className="h-5 w-5 shrink-0 text-[var(--color-brand)]" />
  );
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
        compact ? "border-0" : "border border-[var(--color-border)]",
      )}
      style={{ borderRadius: radius }}
    >
      <div
        className={cn(
          "flex items-center justify-center gap-2.5 shrink-0 border-b border-[var(--color-border)]",
          pad,
          compact ? "py-3" : "py-4",
        )}
      >
        <BrandMark logoUrl={logoUrl} />
        <div className="min-w-0 text-left">
          <span className="text-base font-bold gradient-text-brand truncate block">
            {agentName}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)] truncate">
              {statusText}
            </span>
          </div>
        </div>
      </div>

      <div className={cn("flex-1 overflow-hidden space-y-4 min-h-0 py-4", pad)}>
        <div className="flex items-start gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5 shadow-sm"
            />
          ) : (
            <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <LayoutPanelLeft className="h-4 w-4 text-white" />
            </div>
          )}
          <div
            style={{ borderRadius: radius }}
            className="px-4 py-2.5 text-sm leading-relaxed bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] max-w-[85%] break-words"
          >
            {welcomeMessage.trim() || "Hi! How can I help you today?"}
          </div>
        </div>

        <div className="flex items-start gap-2.5 flex-row-reverse">
          <div className="h-8 w-8 rounded-full bg-[var(--color-brand-light)] flex items-center justify-center shrink-0 mt-0.5">
            <User className="h-4 w-4 text-[var(--color-brand)]" />
          </div>
          <div
            style={{ borderRadius: radius }}
            className="px-4 py-2.5 text-sm leading-relaxed gradient-brand text-white max-w-[85%]"
          >
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
                  <span
                    style={{ borderRadius: radius }}
                    className="mt-1 block gradient-brand py-1 text-center text-[9px] font-semibold text-white"
                  >
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

      <div
        className={cn(
          "border-t border-[var(--color-border)] flex gap-2 shrink-0",
          pad,
          compact ? "py-3" : "py-4",
        )}
      >
        <div
          style={{ borderRadius: radius }}
          className="flex-1 min-w-0 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center"
        >
          <span className="truncate">{placeholder}</span>
        </div>
        <div
          style={{ borderRadius: radius }}
          className="h-10 w-10 gradient-brand text-white flex items-center justify-center shrink-0"
        >
          <ArrowUp className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SignInScreen({
  radius,
  agentName,
  logoUrl,
  message,
}: {
  radius: string;
  agentName: string;
  logoUrl: string | null;
  message: string;
}) {
  return (
    <div
      style={{ borderRadius: radius }}
      className="flex h-full flex-col items-center justify-center gap-6 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-card)] px-6 text-center"
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          style={{ borderRadius: radius }}
          className="h-16 w-16 object-cover shadow-lg"
        />
      ) : (
        <div
          style={{ borderRadius: radius }}
          className="flex h-16 w-16 items-center justify-center gradient-violet shadow-lg"
        >
          <Mail className="h-7 w-7 text-white" />
        </div>
      )}
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Sign in to {agentName}
        </h2>
        <p className="mt-2 max-w-xs mx-auto text-sm text-[var(--color-text-muted)] break-words">
          {message}
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4 text-left">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Email
          </span>
          <div
            style={{ borderRadius: radius }}
            className="flex h-12 items-center border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 text-base text-[var(--color-text-muted)]"
          >
            you@email.com
          </div>
        </div>
        <div
          style={{ borderRadius: radius }}
          className="flex h-12 items-center justify-center gap-2 gradient-violet text-sm font-semibold text-white"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function AgentAvatar({
  logoUrl,
  size,
}: {
  logoUrl: string | null;
  size: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full gradient-violet",
        size,
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <MessageCircle className="h-1/2 w-1/2 text-white" />
      )}
    </span>
  );
}

/** Glass pills over the photo stay dark in both themes, matching the real phone widget. */
const PHONE_GLASS = "bg-black/50 text-white backdrop-blur-md";

/** The phone layout: the avatar fills the frame, controls float on top, and the chat
 *  (open sheet or collapsed button) sits at the bottom. */
function MobileStage({
  radius,
  backdropId,
  liveTryOnEnabled,
  sheetOpen = false,
  children,
}: {
  radius: string;
  backdropId: string;
  liveTryOnEnabled: boolean;
  sheetOpen?: boolean;
  children: React.ReactNode;
}) {
  const photo =
    STUDIO_PREVIEW_PHOTOS[backdropId] ?? STUDIO_PREVIEW_PHOTOS["backdrop-1"];
  const stageBottom = sheetOpen ? "58%" : "0%";
  return (
    <div className="relative h-full overflow-hidden bg-[#0d0b14]">
      <div className="absolute inset-x-0 top-0" style={{ bottom: stageBottom }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />

        <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[10px]",
              PHONE_GLASS,
            )}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
            <span className="font-bold">92% Fit</span>
            <span className="truncate text-white/60">Style 1 of 2</span>
          </span>
          <span
            className={cn(
              "flex h-7 shrink-0 items-center gap-0.5 rounded-full px-2.5 text-[10px] font-medium",
              PHONE_GLASS,
            )}
          >
            Details <ChevronDown className="h-3 w-3" />
          </span>
        </div>

        {liveTryOnEnabled && (
          <span
            className={cn(
              "absolute left-2.5 flex h-8 w-8 items-center justify-center rounded-full",
              PHONE_GLASS,
              sheetOpen ? "top-[42%]" : "top-1/2",
            )}
          >
            <Camera className="h-3.5 w-3.5" />
          </span>
        )}

        <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
          <div className="flex gap-1.5">
            {[0, 1].map((index) => (
              <span
                key={index}
                className={cn(
                  "h-9 w-7 overflow-hidden border",
                  index === 0
                    ? "border-[var(--color-brand)]"
                    : "border-white/30",
                )}
                style={{ borderRadius: `min(${radius}, 8px)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt=""
                  className="h-full w-full object-cover object-top"
                />
              </span>
            ))}
          </div>
          <span
            className={cn(
              "flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold",
              PHONE_GLASS,
            )}
          >
            <ShoppingBag className="h-3 w-3" /> Cart · $144.60
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

function MobileChatSheet({
  radius,
  agentName,
  welcomeMessage,
  logoUrl,
  placeholder,
}: {
  radius: string;
  agentName: string;
  welcomeMessage: string;
  logoUrl: string | null;
  placeholder: string;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex h-[60%] flex-col overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-surface-card)]"
      style={{ borderTopLeftRadius: radius, borderTopRightRadius: radius }}
    >
      <div className="flex shrink-0 justify-center pt-1.5">
        <span className="h-1 w-8 rounded-full bg-[var(--color-border-strong)]" />
      </div>
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <span
          className="flex h-7 items-center gap-1 border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 text-[10px] text-[var(--color-text-secondary)]"
          style={{ borderRadius: radius }}
        >
          <User className="h-3 w-3" /> Alex
        </span>
        <span className="flex items-center gap-1.5">
          <AgentAvatar logoUrl={logoUrl} size="h-5 w-5" />
          <span className="text-[12px] font-bold text-[var(--color-text-primary)]">
            {agentName}
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
        </span>
        <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-3 py-1">
        <div className="flex items-start gap-2">
          <AgentAvatar logoUrl={logoUrl} size="h-6 w-6" />
          <div
            className="max-w-[80%] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-[11px] leading-snug text-[var(--color-text-primary)]"
            style={{ borderRadius: radius }}
          >
            {welcomeMessage.trim() || "Hi! How can I help you today?"}
          </div>
        </div>
        <div className="flex items-start justify-end gap-2">
          <div
            className="gradient-brand max-w-[80%] px-3 py-2 text-[11px] font-medium text-white"
            style={{ borderRadius: radius }}
          >
            Find me a jacket
          </div>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-light)]">
            <User className="h-3 w-3 text-[var(--color-brand)]" />
          </span>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 px-3 pb-3 pt-1.5">
        <div
          className="flex h-9 min-w-0 flex-1 items-center border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 text-[11px] text-[var(--color-text-muted)]"
          style={{ borderRadius: radius }}
        >
          <span className="truncate">{placeholder}</span>
        </div>
        <span className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
          <ArrowUp className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function LauncherPill({
  radius,
  agentName,
  logoUrl,
  label,
}: {
  radius: string;
  agentName: string;
  logoUrl: string | null;
  label: string;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/40 to-transparent px-3 pb-5 pt-10">
      <div
        style={{ borderRadius: radius }}
        className="flex min-h-12 items-center gap-2.5 bg-[var(--color-surface-card)] pl-2 pr-5 shadow-[0_10px_32px_rgba(0,0,0,0.35)]"
      >
        <AgentAvatar logoUrl={logoUrl} size="h-8 w-8" />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
            {agentName}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            {label}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Same studios as the backdrop plates, with a model already standing in them. */
const STUDIO_PREVIEW_PHOTOS: Record<string, string> = {
  "backdrop-1": "/avatars/preview/studio-1.webp",
  "backdrop-2": "/avatars/preview/studio-2.webp",
  "backdrop-3": "/avatars/preview/studio-3.webp",
  "backdrop-4": "/avatars/preview/studio-4.webp",
};

const PANEL_TONE = {
  dark: {
    bg: "#0d0b14",
    border: "border-white/[0.06]",
    rail: "border-white/[0.12] bg-black/50 text-white/70",
    divider: "bg-white/[0.12]",
    card: "border-white/[0.08] bg-[rgba(18,15,26,0.88)]",
    fg: "text-white",
    muted: "text-white/45",
    track: "bg-white/[0.08]",
    cta: "text-white",
  },
  light: {
    bg: "#f2f0f5",
    border: "border-black/[0.06]",
    rail: "border-black/[0.08] bg-white/90 text-[#17121d]/65",
    divider: "bg-black/[0.08]",
    card: "border-black/[0.06] bg-white/95",
    fg: "text-[#17121d]",
    muted: "text-[#17121d]/50",
    track: "bg-black/[0.06]",
    cta: "text-[#17121d]",
  },
} as const;

const FIT_ROWS = [
  { label: "Shoulders", value: 94 },
  { label: "Chest", value: 88 },
  { label: "Waist", value: 92 },
  { label: "Length", value: 93 },
];

const SAMPLE_STATS = [
  { label: "Height", value: "180 cm" },
  { label: "Weight", value: "75 kg" },
  { label: "Chest", value: "98 cm" },
  { label: "Waist", value: "82 cm" },
  { label: "Shoe Size", value: "EU 43" },
];

const SAMPLE_SIZES = [
  { label: "Jacket", value: "M" },
  { label: "Trousers", value: "32" },
];

function AvatarPanelScreen({
  radius,
  theme,
  backdropId,
  liveTryOnEnabled,
}: {
  radius: string;
  theme: "dark" | "light";
  backdropId: string;
  liveTryOnEnabled: boolean;
}) {
  const tone = PANEL_TONE[theme];
  const photo =
    STUDIO_PREVIEW_PHOTOS[backdropId] ?? STUDIO_PREVIEW_PHOTOS["backdrop-1"];
  return (
    <div
      className={cn("relative h-full overflow-hidden border", tone.border)}
      style={{ borderRadius: radius, background: tone.bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt=""
        className="absolute inset-y-0 left-0 h-full w-auto max-w-none"
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, transparent 45%, ${tone.bg}CC 58%, ${tone.bg} 66%)`,
        }}
      />

      <div
        className={cn(
          "absolute left-2.5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 border p-1 backdrop-blur-xl",
          tone.rail,
        )}
        style={{ borderRadius: radius }}
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <Maximize2 className="h-3 w-3" />
        </span>
        {liveTryOnEnabled && (
          <>
            <span className={cn("h-px w-3.5", tone.divider)} />
            <span className="flex h-6 w-6 items-center justify-center">
              <Camera className="h-3 w-3" />
            </span>
          </>
        )}
      </div>

      <div className="absolute inset-y-2.5 right-2.5 flex w-[42%] min-w-[128px] flex-col gap-2">
        <div
          className={cn("shrink-0 border p-2.5 backdrop-blur-xl", tone.card)}
          style={{ borderRadius: radius }}
        >
          <p className={cn("text-[10px] font-semibold", tone.fg)}>
            Fit Analysis
          </p>
          <p className={cn("mt-1.5 text-center text-[7px]", tone.muted)}>
            Fit Score
          </p>
          <div className="mt-1 flex flex-col items-center">
            <div className="relative h-12 w-12">
              <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="19"
                  fill="none"
                  strokeWidth="4"
                  className={
                    theme === "dark" ? "stroke-white/10" : "stroke-black/[0.07]"
                  }
                />
                <circle
                  cx="24"
                  cy="24"
                  r="19"
                  fill="none"
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="var(--color-brand)"
                  strokeDasharray={`${2 * Math.PI * 19 * 0.92} ${2 * Math.PI * 19}`}
                />
              </svg>
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-[11px] font-bold",
                  tone.fg,
                )}
              >
                92%
              </span>
            </div>
            <p className={cn("mt-1 text-[8px] font-semibold", tone.fg)}>
              Excellent Fit
            </p>
          </div>
          <div className="mt-2 space-y-1.5">
            {FIT_ROWS.map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-[8px]">
                  <span className={tone.muted}>{row.label}</span>
                  <span className={tone.fg}>{row.value}%</span>
                </div>
                <div
                  className={cn(
                    "mt-0.5 h-1 overflow-hidden rounded-full",
                    tone.track,
                  )}
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)]"
                    style={{ width: `${row.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "min-h-0 shrink overflow-hidden border p-2.5 backdrop-blur-xl",
            tone.card,
          )}
          style={{ borderRadius: radius }}
        >
          <div className="flex items-center justify-between">
            <p className={cn("text-[10px] font-semibold", tone.fg)}>
              Model Stats
            </p>
            <span className="flex items-center gap-0.5 text-[8px] font-medium text-[var(--color-brand)]">
              <Pencil className="h-2 w-2" /> Edit
            </span>
          </div>
          <div className="mt-1.5 space-y-1">
            {SAMPLE_STATS.map((row) => (
              <div key={row.label} className="flex justify-between text-[8px]">
                <span className={tone.muted}>{row.label}</span>
                <span className={cn("font-semibold", tone.fg)}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div className={cn("my-2 h-px", tone.divider)} />
          <p
            className={cn(
              "text-[6.5px] font-bold uppercase tracking-[0.14em]",
              tone.muted,
            )}
          >
            Size Recommendation
          </p>
          <div className="mt-1 space-y-1">
            {SAMPLE_SIZES.map((row) => (
              <div key={row.label} className="flex justify-between text-[8px]">
                <span className={tone.muted}>{row.label}</span>
                <span className={cn("font-semibold", tone.fg)}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[8px] font-medium text-[var(--color-brand)]">
            View Size Guide
          </p>
        </div>
        <div
          className={cn(
            "mt-auto flex h-8 shrink-0 items-center justify-between bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-2.5 text-[9px] font-semibold",
            tone.cta,
          )}
          style={{ borderRadius: radius }}
        >
          <span className="flex items-center gap-1">
            <ShoppingBag className="h-3 w-3" /> Add All to Cart
          </span>
          <span className="text-[10px] font-bold">$144.60</span>
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
