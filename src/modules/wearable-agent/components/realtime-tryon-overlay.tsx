"use client";

import * as React from "react";
import {
  Camera,
  Check,
  Download,
  Loader2,
  RotateCcw,
  Share2,
  ShoppingBag,
  Sparkles,
  SwitchCamera,
  X,
} from "lucide-react";
import type { CameraFacingMode, RealtimeTryOnStatus, RecordedClip } from "../hooks/use-realtime-tryon";
import { cn } from "@/lib/utils/cn";

/** One avatar version the shopper can wear on camera: their avatar already dressed in a look. */
export interface LiveVersion {
  id: string;
  imageUrl: string;
  /** "Version 2": the same name the rest of the widget gives it. */
  label: string;
}

export interface RealtimeTryOnOverlayProps {
  status: RealtimeTryOnStatus;
  stream: MediaStream | null;
  remainingSeconds: number;
  /** Length of one live session, shown before the camera opens. */
  maxSeconds: number;
  errorMessage: string | null;
  versions: LiveVersion[];
  /** The version being worn (or about to be); null when none is chosen yet. */
  selectedVersionId: string | null;
  /** Studio plate layered under a cut-out avatar, so thumbnails look like the main picture. */
  backdropUrl?: string | null;
  isApplying: boolean;
  facingMode: CameraFacingMode;
  isRecording: boolean;
  recordingSeconds: number;
  clip: RecordedClip | null;
  canShareClip: boolean;
  onSelectVersion: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
  onFlipCamera: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSaveClip: () => void;
  onShareClip: () => void;
  onDismissClip: () => void;
  /** The products in the look, as a sheet the shopper opens from the camera (phones). */
  shopSheet?: React.ReactNode;
  shopCount?: number;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A version's picture: the avatar over the studio plate when it is a cut-out. */
function VersionPicture({ version, backdropUrl }: { version: LiveVersion; backdropUrl?: string | null }) {
  return (
    <>
      {backdropUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdropUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={version.imageUrl}
        alt={version.label}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    </>
  );
}

/**
 * The versions as a row of round pictures: the camera's zoom pills, but each one dresses the shopper
 * in that version. The chosen one is larger and ringed; it shows a spinner while it is being applied.
 */
function VersionStrip({
  versions,
  selectedId,
  applying,
  backdropUrl,
  tone,
  onSelect,
}: {
  versions: LiveVersion[];
  selectedId: string | null;
  applying: boolean;
  backdropUrl?: string | null;
  tone: "dark" | "light";
  onSelect: (id: string) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label="Version to wear"
      className={cn(
        "flex max-w-full items-center gap-2.5 overflow-x-auto rounded-full px-2.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        tone === "dark"
          ? "border border-white/10 bg-black/40 backdrop-blur-xl"
          : "border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)]"
      )}
    >
      {versions.map((version) => {
        const active = version.id === selectedId;
        return (
          <button
            key={version.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={version.label}
            data-active={active}
            onClick={() => onSelect(version.id)}
            className={cn(
              "relative h-12 w-12 shrink-0 overflow-hidden rounded-full transition-all duration-200 active:scale-95",
              tone === "dark" ? "bg-white/10" : "bg-[var(--color-surface-base)]",
              active
                ? cn(
                    "scale-110 ring-2 ring-offset-2",
                    tone === "dark"
                      ? "ring-white ring-offset-black/60"
                      : "ring-[var(--color-brand)] ring-offset-[var(--color-surface-card)]"
                  )
                : "opacity-70 hover:opacity-100"
            )}
          >
            <VersionPicture version={version} backdropUrl={backdropUrl} />
            {active && applying && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The recording, ready to keep: a small preview with Save and, where the device allows, Share. */
function ClipCard({
  clip,
  canShare,
  placement,
  onSave,
  onShare,
  onDismiss,
}: {
  clip: RecordedClip;
  canShare: boolean;
  /** Over the camera it sits at the top, so it never covers the record button. */
  placement: "top" | "bottom";
  onSave: () => void;
  onShare: () => void;
  onDismiss: () => void;
}) {
  const [saved, setSaved] = React.useState(false);
  return (
    <div
      className={cn(
        "absolute inset-x-0 z-40 flex justify-center p-4",
        placement === "top" ? "top-[4.25rem]" : "bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
      )}
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/90 p-3 text-white shadow-2xl backdrop-blur-2xl">
        <video
          src={clip.url}
          muted
          playsInline
          loop
          autoPlay
          className="h-20 w-14 shrink-0 rounded-xl bg-black object-cover"
          aria-label="Your recorded clip"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Your clip is ready</p>
          <p className="mt-0.5 text-[11px] text-white/55">{formatClock(clip.seconds)} · saved on this device only</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSave();
                setSaved(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-3.5 text-[12px] font-semibold text-white transition-all hover:brightness-110 active:scale-95"
            >
              {saved ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {saved ? "Saved" : "Save"}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 text-[12px] font-semibold transition-colors hover:bg-white/20 active:scale-95"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Discard clip"
          className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function RealtimeTryOnOverlay({
  status,
  stream,
  remainingSeconds,
  maxSeconds,
  errorMessage,
  versions,
  selectedVersionId,
  backdropUrl,
  isApplying,
  facingMode,
  isRecording,
  recordingSeconds,
  clip,
  canShareClip,
  onSelectVersion,
  onStart,
  onStop,
  onFlipCamera,
  onStartRecording,
  onStopRecording,
  onSaveClip,
  onShareClip,
  onDismissClip,
  shopSheet,
  shopCount = 0,
}: RealtimeTryOnOverlayProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [shopOpen, setShopOpen] = React.useState(false);

  React.useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    if (stream) void videoRef.current.play().catch(() => {});
  }, [stream]);

  const hasLook = versions.length > 0;
  // Start puts on the chosen version, or the newest one when none is chosen yet.
  const previewVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[versions.length - 1] ?? null;
  const clipCard = (placement: "top" | "bottom") =>
    clip && (
      <ClipCard
        clip={clip}
        canShare={canShareClip}
        placement={placement}
        onSave={onSaveClip}
        onShare={onShareClip}
        onDismiss={onDismissClip}
      />
    );

  // ─── Before the camera opens ────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="absolute inset-0 z-[12] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-[var(--color-surface-base)] px-6 py-8">
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-[var(--color-brand-from)] to-[var(--color-brand-to)] opacity-20 blur-2xl"
          />
          <div className="relative aspect-[3/4] w-[clamp(180px,24vw,270px)] overflow-hidden rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)]">
            {previewVersion ? (
              <>
                <VersionPicture version={previewVersion} backdropUrl={backdropUrl} />
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                  <Sparkles className="h-3 w-3" />
                  {previewVersion.label}
                </span>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center text-[var(--color-text-secondary)]">
                <Sparkles className="h-6 w-6 text-[var(--color-brand-strong)]" />
                <p className="text-[12px] leading-relaxed">Create a look in the chat, then wear it here.</p>
              </div>
            )}
            <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[var(--color-brand-strong)] shadow-md">
              <Camera className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="max-w-xs text-center">
          <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">Try it on, live</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            {hasLook
              ? "Open your camera and see yourself wearing the version you pick."
              : "Your looks will appear here once you have created one."}
          </p>
        </div>

        {versions.length > 1 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Choose a version</p>
            <VersionStrip
              versions={versions}
              selectedId={previewVersion?.id ?? null}
              applying={false}
              backdropUrl={backdropUrl}
              tone="light"
              onSelect={onSelectVersion}
            />
          </div>
        )}

        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={onStart}
            disabled={!hasLook}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-7 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Camera className="h-4 w-4" />
            Start live try-on
          </button>
          {hasLook && (
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Uses your camera · up to {formatClock(maxSeconds)} per session
            </p>
          )}
        </div>
        {clipCard("bottom")}
      </div>
    );
  }

  // ─── Camera ─────────────────────────────────────────────────────────────────
  const live = status === "live";
  // The sheet belongs to a running camera: it is open only while live, so it is closed again
  // whenever the session ends or restarts.
  const sheetOpen = shopOpen && live;
  const lowTime = live && remainingSeconds <= 15;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;

  return (
    <div className="absolute inset-0 z-[12] overflow-hidden bg-black">
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
          aria-label="Live virtual try-on camera"
        />
      )}

      {/* Softens the top and bottom edges so the controls stay readable on any picture. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/65 to-transparent" />

      {(status === "requesting-permission" || status === "connecting") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand)]" />
          <p className="text-sm font-medium">
            {status === "requesting-permission" ? "Waiting for camera permission…" : "Connecting live try-on…"}
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 backdrop-blur-md">
          <div className="max-w-sm text-center">
            <p className="text-sm font-semibold text-white">Live try-on couldn&apos;t start</p>
            <p className="mt-2 text-xs leading-relaxed text-white/55">{errorMessage}</p>
            <button
              type="button"
              onClick={onStart}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Top bar: what is happening on the left, a way out on the right. */}
      {(live || status === "connecting" || status === "requesting-permission") && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
          <div className="flex flex-col items-start gap-2">
            {live && (
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-xl">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Live
                <span className={cn("tabular-nums", lowTime ? "animate-pulse font-semibold text-amber-300" : "text-white/55")}>
                  {formatClock(remainingSeconds)}
                </span>
              </div>
            )}
            {isRecording && (
              <div className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/25 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-xl">
                <span className="h-1.5 w-1.5 rounded-[2px] bg-red-500" />
                REC
                <span className="tabular-nums text-white/75">{formatClock(recordingSeconds)}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onStop}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-xl transition-colors hover:bg-red-500/85 active:scale-90"
            aria-label="Stop live try-on"
            title="Stop live try-on"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {live && (
        <>
          {/* Said once, near the top, so it never covers the shopper. */}
          {(isApplying || lowTime) && !errorMessage && (
            <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-20 flex justify-center px-4">
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-[12px] font-medium text-white shadow-lg backdrop-blur-xl">
                {isApplying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Putting on {selectedVersion?.label ?? "your look"}…
                  </>
                ) : (
                  <>Session ends in {formatClock(remainingSeconds)}</>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="absolute inset-x-4 top-[4.5rem] z-20 rounded-xl border border-red-400/20 bg-red-500/90 px-3 py-2 text-center text-xs text-white shadow-lg">
              {errorMessage}
            </div>
          )}

          {/* Bottom controls: versions above, then bag · record · flip, like a camera app. */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {versions.length > 0 && (
              <div className="flex max-w-full flex-col items-center gap-1.5">
                <VersionStrip
                  versions={versions}
                  selectedId={selectedVersionId}
                  applying={isApplying}
                  backdropUrl={backdropUrl}
                  tone="dark"
                  onSelect={onSelectVersion}
                />
                {selectedVersion && <span className="text-[11px] font-medium text-white/75">{selectedVersion.label}</span>}
              </div>
            )}

            <div className="grid w-full max-w-xs grid-cols-3 items-center">
              <div className="flex justify-start">
                {shopSheet ? (
                  <button
                    type="button"
                    onClick={() => setShopOpen((open) => !open)}
                    aria-label="Products in this look"
                    aria-expanded={sheetOpen}
                    className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-xl transition-colors hover:bg-white/15 active:scale-90"
                  >
                    <ShoppingBag className="h-5 w-5" />
                    {shopCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
                        {shopCount}
                      </span>
                    )}
                  </button>
                ) : null}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={isRecording ? onStopRecording : onStartRecording}
                  aria-label={isRecording ? "Stop recording" : "Record video"}
                  title={isRecording ? "Stop recording" : "Record video"}
                  className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-90"
                >
                  {isRecording && <span aria-hidden className="absolute -inset-1.5 animate-ping rounded-full border-2 border-red-500/60" />}
                  <span
                    className={cn(
                      "block bg-red-500 shadow-inner transition-all duration-200",
                      isRecording ? "h-7 w-7 rounded-lg" : "h-[58px] w-[58px] rounded-full"
                    )}
                  />
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onFlipCamera}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-xl transition-colors hover:bg-white/15 active:scale-90"
                  aria-label={facingMode === "user" ? "Switch to rear camera" : "Switch to front camera"}
                  title={facingMode === "user" ? "Switch to rear camera" : "Switch to front camera"}
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {shopSheet && sheetOpen && (
            <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={() => setShopOpen(false)}>
              <div className="relative" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShopOpen(false)}
                  aria-label="Close products"
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-[var(--color-text-secondary)] hover:bg-black/20"
                >
                  <X className="h-4 w-4" />
                </button>
                {shopSheet}
              </div>
            </div>
          )}
        </>
      )}
      {clipCard("top")}
    </div>
  );
}
