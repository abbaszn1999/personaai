"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const card =
  "absolute w-[15.5rem] rounded-2xl border border-hairline bg-surface/90 p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] light:bg-white light:shadow-[0_20px_50px_-12px_rgba(14,12,19,0.14)] backdrop-blur-xl transition-[opacity,transform,filter] duration-700 ease-[var(--ease-expo)]";
const label = "font-mono text-[10px] uppercase tracking-[0.18em] text-faint";
const left = "right-[calc(100%-2.75rem)]";
const right = "left-[calc(100%-2.75rem)]";

function state(visible: boolean, from: "left" | "right") {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateX(0)" : `translateX(${from === "left" ? "-24px" : "24px"})`,
    filter: visible ? "blur(0)" : "blur(6px)",
  };
}

function Check() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-white" aria-hidden>
      ✓
    </span>
  );
}

function LiveTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((s) => (s + 1) % 90), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="font-mono text-2xl tabular-nums text-bone">
      {mm}:{ss}
      <span className="text-sm text-faint"> / 01:30</span>
    </span>
  );
}

export function Callouts({ active }: { active: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden min-[1100px]:block">
      {/* 01 — avatar */}
      <div className={cn(card, left, "top-[12%]")} style={state(active === 0, "left")}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/face.webp" alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-hairline" />
          <div>
            <p className="text-sm text-bone">Selfie received</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
              <Check /> Face locked
            </p>
          </div>
        </div>
      </div>
      <div className={cn(card, right, "bottom-[4%]")} style={state(active === 0, "right")}>
        <p className={label}>Measurements</p>
        <dl className="mt-3 space-y-2 text-sm">
          {[
            ["Height", "182 cm"],
            ["Chest", "98 cm"],
            ["Waist", "82 cm"],
            ["Inseam", "81 cm"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-hairline pb-2 last:border-0 last:pb-0">
              <dt className="text-muted">{k}</dt>
              <dd className="font-mono text-bone">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 02 — catalog */}
      <div className={cn(card, right, "bottom-[5%] w-[16.5rem]")} style={state(active === 1, "right")}>
        <p className={label}>Synced from your store</p>
        <div className="mt-3 flex gap-3">
          <div
            className="h-16 w-12 shrink-0 rounded-lg bg-cover"
            style={{ backgroundImage: "url(/media/look-2.webp)", backgroundPosition: "50% 28%", backgroundSize: "260%" }}
          />
          <div className="flex flex-1 flex-col justify-between">
            <p className="text-sm leading-snug text-bone">Navy two-piece suit</p>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-bone">$189</span>
              <span className="text-brand">In stock</span>
            </div>
          </div>
        </div>
      </div>
      <div className={cn(card, left, "top-[5%]")} style={state(active === 1, "left")}>
        <p className={label}>Render</p>
        <p className="mt-2 text-sm text-bone">One pass per outfit</p>
        <div className="mt-3 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/face.webp" alt="" className="h-7 w-7 rounded-full object-cover" />
          <span className="h-px flex-1 bg-[image:var(--grad-brand)]" />
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
            <Check /> Same face
          </span>
        </div>
      </div>

      {/* 03 — sizing */}
      <div className={cn(card, right, "bottom-[4%] w-[16.5rem]")} style={state(active === 2, "right")}>
        <p className={label}>Recommended size</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {["XS", "S", "M", "L", "XL"].map((size) => (
            <span
              key={size}
              className={cn(
                "grid h-9 place-items-center rounded-lg font-mono text-xs",
                size === "M" ? "bg-brand font-semibold text-white" : "border border-hairline text-muted",
              )}
            >
              {size}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-2.5">
          {[
            ["Chest", 0.52],
            ["Waist", 0.48],
            ["Length", 0.55],
          ].map(([k, v]) => (
            <div key={k as string} className="flex items-center gap-3 text-[11px]">
              <span className="w-12 text-muted">{k}</span>
              <span className="relative h-1 flex-1 rounded-full bg-hairline">
                <span className="absolute inset-y-0 left-[35%] right-[35%] rounded-full bg-muted/20" />
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]"
                  style={{ left: `${(v as number) * 100}%` }}
                />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Tight · True · Loose</p>
      </div>
      <div className={cn(card, left, "top-[5%] w-[14rem]")} style={state(active === 2, "left")}>
        <p className={label}>Size chart</p>
        <p className="mt-2 text-sm leading-snug text-bone">Your brand&apos;s own chart, read once and reused.</p>
      </div>

      {/* 04 — live */}
      <div className={cn(card, left, "top-[12%] w-[14rem]")} style={state(active === 3, "left")}>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#ff4d4d]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff3b3b] shadow-[0_0_10px_#ff3b3b]" /> Live · camera
        </p>
        <div className="mt-2">
          <LiveTimer running={active === 3} />
        </div>
      </div>
      <div className={cn(card, right, "bottom-[24%] w-[14.5rem]")} style={state(active === 3, "right")}>
        <p className={label}>Real time</p>
        <p className="mt-2 text-sm text-bone">The garment follows them.</p>
        <div className="mt-3 flex h-6 items-end gap-[3px]">
          {Array.from({ length: 22 }, (_, i) => (
            <span
              key={i}
              className="w-[3px] flex-1 origin-bottom animate-[eq_1.1s_ease-in-out_infinite] rounded-full bg-[image:var(--grad-brand)]"
              style={{ animationDelay: `${(i * 97) % 1100}ms`, height: `${30 + ((i * 37) % 70)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
