"use client";

import * as React from "react";
import { Camera, Loader2, Play, RotateCcw, Square, SwitchCamera } from "lucide-react";
import type { CameraFacingMode, RealtimeTryOnStatus } from "../hooks/use-realtime-tryon";
import { cn } from "@/lib/utils/cn";

interface RealtimeTryOnOverlayProps {
  status: RealtimeTryOnStatus;
  stream: MediaStream | null;
  remainingSeconds: number;
  activeProductId: string | null;
  errorMessage: string | null;
  hasProducts: boolean;
  facingMode: CameraFacingMode;
  isRecording: boolean;
  recordingSeconds: number;
  onStart: () => void;
  onStop: () => void;
  onFlipCamera: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RealtimeTryOnOverlay({
  status,
  stream,
  remainingSeconds,
  activeProductId,
  errorMessage,
  hasProducts,
  facingMode,
  isRecording,
  recordingSeconds,
  onStart,
  onStop,
  onFlipCamera,
  onStartRecording,
  onStopRecording,
}: RealtimeTryOnOverlayProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    if (stream) void videoRef.current.play().catch(() => {});
  }, [stream]);

  if (status === "idle") {
    return (
      <div className="absolute inset-0 z-[12] flex items-center justify-center bg-[var(--color-surface-base)] px-6">
        <div className="max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-center shadow-[var(--shadow-card)] backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]">
            <Camera className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Live Camera Try-On</h3>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            Open your camera, then choose one of your look&apos;s products to preview it in realtime.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={!hasProducts}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-5 text-sm font-semibold text-[var(--color-brand-contrast)] shadow-[var(--shadow-glow)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="h-4 w-4" />
            {hasProducts ? "Start Live Try-On" : "Pick an item first"}
          </button>
        </div>
      </div>
    );
  }

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

      {status === "live" && (
        <>
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-xl">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live
            <span className="text-white/50">{formatRemaining(remainingSeconds)}</span>
          </div>
          {isRecording && (
            <div className="absolute left-4 top-12 flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-[2px] bg-red-500" />
              REC
              <span className="text-white/70">{formatRemaining(recordingSeconds)}</span>
            </div>
          )}
          {!activeProductId && (
            <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
              <div className="rounded-2xl border border-white/15 bg-black/55 px-5 py-3 text-center text-sm font-medium text-white shadow-xl backdrop-blur-xl">
                Choose a product to try on
                <p className="mt-1 text-[11px] font-normal text-white/50">Select an item from the product list</p>
              </div>
            </div>
          )}
          {errorMessage && (
            <div className="absolute inset-x-4 bottom-4 rounded-xl border border-red-400/20 bg-red-500/90 px-3 py-2 text-xs text-white shadow-lg">
              {errorMessage}
            </div>
          )}
        </>
      )}

      {(status === "requesting-permission" || status === "connecting" || status === "live") && (
        <>
          <button
            type="button"
            onClick={onStop}
            className="absolute right-4 top-4 z-20 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-4 text-[12px] font-semibold text-white shadow-lg backdrop-blur-xl transition-colors hover:bg-red-500/85"
            aria-label="Stop live try-on"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop Live
          </button>
          {status === "live" && (
            <button
              type="button"
              onClick={isRecording ? onStopRecording : onStartRecording}
              className={cn(
                "absolute right-4 top-[68px] z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors active:scale-90",
                isRecording
                  ? "border-red-400/40 bg-red-500 hover:brightness-110"
                  : "border-white/15 bg-black/55 hover:bg-white/15"
              )}
              aria-label={isRecording ? "Stop recording" : "Record video"}
              title={isRecording ? "Stop recording" : "Record video"}
            >
              {isRecording ? (
                <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full bg-red-500 ring-2 ring-white/70" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onFlipCamera}
            className="absolute right-4 top-[124px] z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-xl transition-colors hover:bg-white/15 active:scale-90"
            aria-label={facingMode === "user" ? "Switch to rear camera" : "Switch to front camera"}
            title={facingMode === "user" ? "Switch to rear camera" : "Switch to front camera"}
          >
            <SwitchCamera className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
