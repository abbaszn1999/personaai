"use client";

import * as React from "react";
import { ScanLine, Shirt } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const WEAR_SCAN_STAGES = [
  "Mapping body silhouette…",
  "Aligning shoulders & chest…",
  "Draping garment mesh…",
  "Calibrating fit zones…",
  "Rendering on avatar…",
] as const;

const SCAN_DURATION_MS = 2400;

interface AvatarWearScanOverlayProps {
  itemLabel?: string;
}

/** Full-panel top→bottom scan animation shown while a garment is being fitted onto the avatar. */
export function AvatarWearScanOverlay({ itemLabel }: AvatarWearScanOverlayProps) {
  const [progress, setProgress] = React.useState(0);
  const [stageIndex, setStageIndex] = React.useState(0);

  React.useEffect(() => {
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / SCAN_DURATION_MS);
      setProgress(ratio * 100);
      setStageIndex(
        Math.min(
          WEAR_SCAN_STAGES.length - 1,
          Math.floor(ratio * WEAR_SCAN_STAGES.length)
        )
      );
      if (ratio < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="absolute inset-0 z-[30] overflow-hidden pointer-events-none select-none">
      {/* Base dim — avatar stays visible underneath */}
      <div className="absolute inset-0 bg-[rgba(6,4,10,0.52)] backdrop-blur-[1.5px]" />

      {/* Fine scan grid */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(247,109,1,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(247,109,1,0.55) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Scanned region — everything above the beam gets a warm tint */}
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-[rgba(247,109,1,0.14)] via-[rgba(247,109,1,0.06)] to-transparent"
        style={{ height: `${progress}%` }}
      />

      {/* Main scan beam */}
      <div
        className="absolute inset-x-0"
        style={{ top: `calc(${progress}% - 1px)` }}
      >
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#ff8a2b] to-transparent shadow-[0_0_18px_6px_rgba(247,109,1,0.75)]" />
        <div className="h-16 w-full -mt-8 bg-gradient-to-b from-[rgba(247,109,1,0.35)] to-transparent blur-sm" />
      </div>

      {/* Corner brackets — HUD frame */}
      <div className="absolute top-6 left-6 h-10 w-10 border-t-2 border-l-2 border-[#f76d01]/70 rounded-tl-sm" />
      <div className="absolute top-6 right-[268px] h-10 w-10 border-t-2 border-r-2 border-[#f76d01]/70 rounded-tr-sm" />
      <div className="absolute bottom-6 left-6 h-10 w-10 border-b-2 border-l-2 border-[#f76d01]/70 rounded-bl-sm" />
      <div className="absolute bottom-6 right-[268px] h-10 w-10 border-b-2 border-r-2 border-[#f76d01]/70 rounded-br-sm" />

      {/* Status card — top-left */}
      <div className="absolute top-8 left-10 z-[31] max-w-[280px] rounded-2xl border border-white/10 bg-[rgba(10,8,14,0.78)] backdrop-blur-xl px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-7 rounded-full bg-[#f76d01]/20 flex items-center justify-center">
            <ScanLine className="h-3.5 w-3.5 text-[#f76d01]" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
              Garment Fit Scan
            </p>
            <p className="text-[12px] font-semibold text-white leading-tight">
              Fitting onto avatar
            </p>
          </div>
        </div>

        {itemLabel && (
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] text-white/70">
            <Shirt className="h-3 w-3 text-[#f76d01] shrink-0" />
            <span className="line-clamp-1">{itemLabel}</span>
          </div>
        )}

        <p className="text-[11px] text-[#f76d01] font-medium mb-2">
          {WEAR_SCAN_STAGES[stageIndex]}
        </p>

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#f76d01] to-[#ff8a2b] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-right text-[10px] font-bold text-white/50 tabular-nums">
          {Math.round(progress)}%
        </p>
      </div>

      {/* Vertical tick marks on the scan path */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      {[20, 40, 60, 80].map((tick) => (
        <div
          key={tick}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 h-px w-8 bg-white/20 transition-opacity duration-300",
            progress >= tick ? "opacity-100" : "opacity-30"
          )}
          style={{ top: `${tick}%` }}
        />
      ))}
    </div>
  );
}
