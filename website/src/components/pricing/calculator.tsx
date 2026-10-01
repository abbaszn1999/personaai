"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const BASE = 1500;
const RATE = 0.03;
const MAX = 300_000;
const presets = [10_000, 50_000, 100_000, 250_000];

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

export function Calculator() {
  const [gmv, setGmv] = useState(50_000);
  const fee = gmv * RATE;
  const total = BASE + fee;
  const share = gmv > 0 ? (total / gmv) * 100 : 0;
  const baseWidth = (BASE / total) * 100;

  return (
    <section className="px-[var(--gutter)] py-[var(--section-y)]">
      <div className="mx-auto max-w-[1400px]">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Estimate Main</p>
          <h2 className="mt-6 font-display text-[clamp(2.4rem,5vw,5.2rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
            You pay more
            <span className="block font-serif font-normal italic text-muted">only when it sells more.</span>
          </h2>
        </div>

        <div className="mt-10 grid gap-4 min-[900px]:mt-14 min-[1000px]:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[36px] border border-hairline bg-surface p-8 min-[1000px]:p-11">
            <label htmlFor="gmv" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              Monthly GMV attributed to Persona
            </label>
            <p className="mt-5 font-display text-[clamp(3.4rem,7vw,6.5rem)] font-semibold leading-none tracking-[-0.06em] text-bone tabular-nums">
              {usd(gmv)}
            </p>
            <input
              id="gmv"
              type="range"
              min={0}
              max={MAX}
              step={1000}
              value={gmv}
              onChange={(event) => setGmv(Number(event.target.value))}
              className="range mt-10 w-full"
              style={{ ["--fill" as string]: `${(gmv / MAX) * 100}%` }}
            />
            <div className="mt-3 flex justify-between font-mono text-[10px] text-faint">
              <span>$0</span>
              <span>{usd(MAX)}</span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2 min-[560px]:flex min-[560px]:flex-wrap">
              {presets.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGmv(value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-center font-mono text-[11px] transition",
                    gmv === value ? "border-brand bg-brand/10 text-brand" : "border-hairline text-muted hover:border-bone/30 hover:text-bone",
                  )}
                >
                  {usd(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="plan-featured flex flex-col rounded-[36px] p-8 min-[1000px]:p-11">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Monthly invoice · Main</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">Estimate</span>
            </div>
            <dl className="mt-8 divide-y divide-hairline border-y border-hairline text-sm">
              <div className="flex items-center justify-between py-4">
                <dt className="text-muted">Main plan</dt>
                <dd className="font-mono text-bone tabular-nums">{usd(BASE)}</dd>
              </div>
              <div className="flex items-center justify-between py-4">
                <dt className="text-muted">3% × {usd(gmv)} GMV</dt>
                <dd className="font-mono text-bone tabular-nums">{usd(fee)}</dd>
              </div>
            </dl>
            <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-hairline">
              <span className="h-full bg-bone/80 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${baseWidth}%` }} />
              <span className="h-full flex-1 bg-[image:var(--grad-brand)]" />
            </div>
            <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              <span>Plan</span>
              <span>GMV fee</span>
            </div>
            <div className="mt-auto pt-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Total this month</p>
              <p className="mt-2 font-display text-6xl font-semibold tracking-[-0.05em] text-bone tabular-nums">{usd(total)}</p>
              <p className="mt-3 text-sm text-muted">
                {gmv > 0 ? (
                  <>
                    That is <span className="text-bone">{share.toFixed(1)}%</span> of the sales Persona brought in.
                  </>
                ) : (
                  "With no attributed sales, you pay the plan only."
                )}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          Estimate. Excludes optional top-ups. On the trial, attributed sales are recorded and not billed.
        </p>
      </div>
    </section>
  );
}
