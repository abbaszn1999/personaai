"use client";

import * as React from "react";
import type { TryOnProfile } from "../types";
import { isKidsAudience } from "../audiences";
import { useBodyBounds } from "../lib/use-body-bounds";
import {
  computeMeasurementMarks,
  fitImageRect,
  type GirthMark,
  type Rect,
} from "../lib/measurement-marks";

interface MeasurementOverlayProps {
  profile: TryOnProfile;
  /** URL of the avatar picture this overlay sits on. */
  imageUrl: string;
  /** How the picture is fitted in the overlay's box — mirrors the CSS on the <img>. */
  fit?: "contain" | "cover";
  /** `object-position` of the picture in the box, 0-1 (defaults to centred). */
  position?: { x: number; y: number };
}

const LINE = "rgba(255,255,255,0.95)";
const PILL_HEIGHT = 20;
const TICK = 5;

/** Rough text width — the labels are short and a few px of slack in the pill is invisible. */
function pillWidth(label: string) {
  return Math.round(label.length * 6.3 + 16);
}

function Pill({ x, y, label, anchor }: { x: number; y: number; label: string; anchor: "start" | "middle" | "end" }) {
  const w = pillWidth(label);
  const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return (
    <g>
      <rect x={left} y={y - PILL_HEIGHT / 2} width={w} height={PILL_HEIGHT} rx={PILL_HEIGHT / 2} fill="rgba(255,255,255,0.94)" />
      <text
        x={left + w / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill="#17121d"
        style={{ fontFamily: "inherit" }}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Height arrow, chest and waist lines and a shoe-size chip drawn over the avatar. The text is
 * real text with the shopper's real numbers (an image model would misspell it), positioned from
 * where the body actually is in the picture, so it can be toggled and follows edits live.
 * Renders nothing until the body is found — never a mark in the wrong place.
 */
export function MeasurementOverlay({ profile, imageUrl, fit = "contain", position }: MeasurementOverlayProps) {
  const scan = useBodyBounds(imageUrl);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ready = Boolean(scan?.bounds && box && box.w > 0 && box.h > 0);
  React.useEffect(() => {
    if (!ready) return;
    // Next frame, so the fade-in runs from the hidden state instead of appearing at once.
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [ready]);

  const kids = isKidsAudience(profile.audience);
  const marks = React.useMemo(
    () =>
      scan?.bounds
        ? computeMeasurementMarks(
            {
              heightCm: profile.heightCm,
              chestCm: profile.chestCm,
              waistCm: profile.waistCm,
              shoeSizeEu: profile.shoeSizeEu,
              kids,
            },
            scan.bounds
          )
        : null,
    [scan, profile.heightCm, profile.chestCm, profile.waistCm, profile.shoeSizeEu, kids]
  );

  let content: React.ReactNode = null;
  if (scan?.bounds && marks && box && box.w > 0 && box.h > 0) {
    const rect: Rect = fitImageRect(box.w, box.h, scan.aspect, fit, position?.x ?? 0.5, position?.y ?? 0.5);
    const px = (nx: number) => rect.x + nx * rect.w;
    const py = (ny: number) => rect.y + ny * rect.h;
    const clampY = (y: number) => Math.min(box.h - PILL_HEIGHT, Math.max(PILL_HEIGHT, y));

    const girth = (mark: GirthMark) => {
      const x1 = px(mark.left);
      const x2 = px(mark.right);
      const y = py(mark.y);
      const w = pillWidth(mark.label);
      // Always on the right, as on the wide stage. On a narrow card there may be less than a
      // full label's room past the line, so the label slides in over the line's end rather than
      // jumping to the other side of the body.
      const labelX = Math.max(x2 - 10, Math.min(x2 + 8, box.w - 4 - w));
      return (
        <g key={mark.label}>
          <line x1={x1} x2={x2} y1={y} y2={y} stroke={LINE} strokeWidth={1.5} strokeDasharray="5 4" />
          <line x1={x1} x2={x1} y1={y - TICK} y2={y + TICK} stroke={LINE} strokeWidth={1.5} />
          <line x1={x2} x2={x2} y1={y - TICK} y2={y + TICK} stroke={LINE} strokeWidth={1.5} />
          <Pill x={labelX} y={y} label={mark.label} anchor="start" />
        </g>
      );
    };

    const { height, chest, waist, shoe } = marks;
    content = (
      <svg
        width={box.w}
        height={box.h}
        className="absolute inset-0 overflow-visible transition-opacity duration-500"
        style={{ opacity: shown ? 1 : 0, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.55))" }}
        aria-hidden
      >
        {height && (
          <g>
            <line x1={px(height.x)} x2={px(height.x)} y1={py(height.top)} y2={py(height.bottom)} stroke={LINE} strokeWidth={1.5} />
            {/* Arrowheads at both ends, so it reads as "this far, head to toe". */}
            <polyline
              points={`${px(height.x) - 4},${py(height.top) + 7} ${px(height.x)},${py(height.top)} ${px(height.x) + 4},${py(height.top) + 7}`}
              fill="none"
              stroke={LINE}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={`${px(height.x) - 4},${py(height.bottom) - 7} ${px(height.x)},${py(height.bottom)} ${px(height.x) + 4},${py(height.bottom) - 7}`}
              fill="none"
              stroke={LINE}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1={px(height.x) - 6} x2={px(height.x) + 6} y1={py(height.top)} y2={py(height.top)} stroke={LINE} strokeWidth={1.5} />
            <line x1={px(height.x) - 6} x2={px(height.x) + 6} y1={py(height.bottom)} y2={py(height.bottom)} stroke={LINE} strokeWidth={1.5} />
            {/* A fifth of the way down rather than mid-way, which is where the tool rail sits
                on a narrow stage. */}
            <Pill x={px(height.x)} y={py(height.top) + (py(height.bottom) - py(height.top)) * 0.2} label={height.label} anchor="middle" />
          </g>
        )}
        {chest && girth(chest)}
        {waist && girth(waist)}
        {shoe && (
          <Pill
            x={px(shoe.x) + (shoe.side === "right" ? 8 : -8)}
            y={clampY(py(shoe.y))}
            label={shoe.label}
            anchor={shoe.side === "right" ? "start" : "end"}
          />
        )}
      </svg>
    );
  }

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 z-[17]">
      {content}
    </div>
  );
}
