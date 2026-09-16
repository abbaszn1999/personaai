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

// One-way sweep duration — the beam bounces top→bottom→top continuously at this pace for
// as long as the overlay is mounted, since the real render call can take anywhere from a
// few seconds to well over a minute and a single one-shot pass would just freeze partway
// through a long wait.
const SWEEP_DURATION_MS = 2200;

interface AvatarWearScanOverlayProps {
  itemLabel?: string;
  /** Desktop reserves a fixed 268px info-card gutter on the right, so the corner brackets stop
   *  short of it; mobile has no such gutter — the avatar fills the full width — so the right
   *  brackets should hug the real edge instead of leaving a huge unexplained gap. */
  mobile?: boolean;
}

// Brand-derived translucent tints — `--color-brand` is overridden per-merchant on the embed
// mount root (see resolveBrandCssVars), so the whole scan HUD recolors with their palette.
const brandAlpha = (pct: number) => `color-mix(in srgb, var(--color-brand) ${pct}%, transparent)`;

/** Full-panel scan animation shown while a garment is being fitted onto the avatar — the
 *  beam sweeps down then back up on a loop for as long as fitting is in progress, rather
 *  than a single top→bottom pass that finishes and sits idle while the real render continues. */
export function AvatarWearScanOverlay({ itemLabel, mobile = false }: AvatarWearScanOverlayProps) {
  const [beamPosition, setBeamPosition] = React.useState(0);
  const [stageIndex, setStageIndex] = React.useState(0);

  React.useEffect(() => {
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const elapsed = now - start;

      // Triangle wave: 0 → 1 over one sweep, then 1 → 0 over the next — repeats forever.
      const cyclePos = (elapsed % (SWEEP_DURATION_MS * 2)) / SWEEP_DURATION_MS;
      const ratio = cyclePos <= 1 ? cyclePos : 2 - cyclePos;
      setBeamPosition(ratio * 100);

      setStageIndex(Math.floor(elapsed / SWEEP_DURATION_MS) % WEAR_SCAN_STAGES.length);

      frame = requestAnimationFrame(tick);
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
          backgroundImage: `linear-gradient(${brandAlpha(55)} 1px, transparent 1px), linear-gradient(90deg, ${brandAlpha(55)} 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }}
      />

      {/* Scanned region — everything above the beam gets a warm tint */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: `${beamPosition}%`,
          background: `linear-gradient(to bottom, ${brandAlpha(14)}, ${brandAlpha(6)}, transparent)`,
        }}
      />

      {/* Main scan beam */}
      <div
        className="absolute inset-x-0"
        style={{ top: `calc(${beamPosition}% - 1px)` }}
      >
        <div
          className="h-[2px] w-full bg-gradient-to-r from-transparent via-[var(--color-brand)] to-transparent"
          style={{ boxShadow: `0 0 18px 6px ${brandAlpha(75)}` }}
        />
        <div
          className="h-16 w-full -mt-8 blur-sm"
          style={{ background: `linear-gradient(to bottom, ${brandAlpha(35)}, transparent)` }}
        />
      </div>

      {/* Corner brackets — HUD frame */}
      <div className="absolute top-6 left-6 h-10 w-10 border-t-2 border-l-2 border-[var(--color-brand)]/70 rounded-tl-sm" />
      <div className={cn("absolute top-6 h-10 w-10 border-t-2 border-r-2 border-[var(--color-brand)]/70 rounded-tr-sm", mobile ? "right-6" : "right-[268px]")} />
      <div className="absolute bottom-6 left-6 h-10 w-10 border-b-2 border-l-2 border-[var(--color-brand)]/70 rounded-bl-sm" />
      <div className={cn("absolute bottom-6 h-10 w-10 border-b-2 border-r-2 border-[var(--color-brand)]/70 rounded-br-sm", mobile ? "right-6" : "right-[268px]")} />

      {/* Status card — top-left */}
      <div
        className={cn(
          "absolute z-[31] rounded-2xl border border-white/10 bg-[rgba(10,8,14,0.78)] backdrop-blur-xl px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
          mobile ? "top-4 left-4 right-4 max-w-none" : "top-8 left-10 max-w-[280px]"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-7 rounded-full bg-[var(--color-brand)]/20 flex items-center justify-center">
            <ScanLine className="h-3.5 w-3.5 text-[var(--color-brand)]" />
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
            <Shirt className="h-3 w-3 text-[var(--color-brand)] shrink-0" />
            <span className="line-clamp-1">{itemLabel}</span>
          </div>
        )}

        <p className="text-[11px] text-[var(--color-brand)] font-medium mb-2">
          {WEAR_SCAN_STAGES[stageIndex]}
        </p>

        {/* Sweep meter — pulses with the beam rather than a literal % since the real
            render has no fixed completion time and could take well past one sweep. */}
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-100 ease-linear"
            style={{ width: `${beamPosition}%` }}
          />
        </div>
        <p className="mt-1.5 flex items-center justify-end gap-1 text-[10px] font-bold text-white/50">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] animate-pulse-dot" />
          Scanning…
        </p>
      </div>

      {/* Vertical tick marks on the scan path — light up as the beam sweeps past each one */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      {[20, 40, 60, 80].map((tick) => (
        <div
          key={tick}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 h-px w-8 bg-white/20 transition-opacity duration-300",
            beamPosition >= tick ? "opacity-100" : "opacity-30"
          )}
          style={{ top: `${tick}%` }}
        />
      ))}
    </div>
  );
}
