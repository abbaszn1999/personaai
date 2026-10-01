"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { merchant } from "@/lib/features";
import { cn } from "@/lib/cn";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function Tile({ kicker, title, body, className, children }: { kicker: string; title: string; body: string; className?: string; children: ReactNode }) {
  return (
    <article data-tile className={cn("group relative flex flex-col overflow-hidden rounded-[28px] border border-hairline bg-surface p-6 transition-colors duration-500 hover:border-white/20", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(247,109,1,0.1), transparent 70%)" }} />
      <div className="relative flex-1">{children}</div>
      <div className="relative mt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">{kicker}</p>
        <h3 className="mt-2 font-display text-xl font-semibold tracking-[-0.03em] text-bone">{title}</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </article>
  );
}

const funnel = [
  ["Widget sessions", 1],
  ["Avatars created", 0.62],
  ["Try-ons", 0.48],
  ["Added to cart", 0.27],
  ["Orders", 0.16],
] as const;

const orders = [
  ["#1042", "Line tag", "$293.00"],
  ["#1043", "Device match", "$189.00"],
  ["#1045", "Line tag", "$104.00"],
] as const;

const mapping = [
  ["Blazers", "Tailoring"],
  ["Sneakers", "Footwear"],
  ["Knitwear", "Tops"],
  ["Chinos", "Bottoms"],
] as const;

const meters = [
  ["Session units", 0.64, "64,210 / 100,000"],
  ["Live minutes", 0.38, "38 / 100"],
  ["Garment units", 0.52, "13,040 / 25,000"],
] as const;

export function Merchant() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      gsap.from(q("[data-tile]"), {
        autoAlpha: 0,
        y: 50,
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.08,
        scrollTrigger: { trigger: q("[data-grid]")[0], start: "top 80%" },
      });
      q("[data-bar]").forEach((bar) =>
        gsap.from(bar, { scaleX: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: bar, start: "top 90%" } }),
      );
      gsap.from(q("[data-order]"), {
        autoAlpha: 0,
        x: -20,
        stagger: 0.15,
        duration: 0.8,
        ease: "expo.out",
        scrollTrigger: { trigger: q("[data-orders]")[0], start: "top 85%" },
      });
      gsap.from(q("[data-map-arrow]"), {
        scaleX: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: "expo.out",
        scrollTrigger: { trigger: q("[data-mapping]")[0], start: "top 85%" },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="px-[var(--gutter)] py-[var(--section-y-lg)]">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">{merchant.kicker}</p>
            <h2 className="mt-6 font-display text-[clamp(2.4rem,5vw,5.2rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
              A control room
              <span className="block font-serif font-normal italic text-muted">behind the mirror.</span>
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted">{merchant.body}</p>
        </div>

        <div data-grid className="mt-14 grid gap-4 min-[900px]:grid-cols-12">
          <Tile
            className="min-[900px]:col-span-7"
            kicker="Analytics"
            title="See where every sale starts."
            body="Funnel, top products, shopper stats, assistant and try-on insights, and a revenue breakdown for everything Persona touched."
          >
            <div className="space-y-3">
              {funnel.map(([label, w]) => (
                <div key={label} className="grid grid-cols-[8.5rem_1fr] items-center gap-4 text-[12px]">
                  <span className="text-muted">{label}</span>
                  <span className="h-7 overflow-hidden rounded-lg bg-white/[0.04]">
                    <span data-bar className="block h-full origin-left rounded-lg bg-[image:var(--grad-brand)]" style={{ width: `${w * 100}%`, opacity: 0.35 + w * 0.65 }} />
                  </span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile
            className="min-[900px]:col-span-5"
            kicker="GMV attribution"
            title="Every order, traced back."
            body="Orders are matched to Persona by line tag or device match and written to a ledger. On the trial, sales are recorded, not billed."
          >
            <ul data-orders className="divide-y divide-hairline rounded-2xl border border-hairline bg-[var(--surface-card)]">
              {orders.map(([id, how, total]) => (
                <li key={id} data-order className="flex items-center justify-between px-4 py-3 text-[12px]">
                  <span className="font-mono text-bone">{id}</span>
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-brand">{how}</span>
                  <span className="font-mono text-bone">{total}</span>
                </li>
              ))}
            </ul>
          </Tile>

          <Tile
            className="min-[900px]:col-span-4"
            kicker="Branding"
            title="It looks like your store."
            body="Logo, color, font, assistant name, status line, quick replies, light or dark, and your own backdrops."
          >
            <div className="rounded-2xl border border-hairline bg-[var(--surface-card)] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-sm font-bold text-white">A</span>
                <div>
                  <p className="text-[13px] font-medium text-bone">Atelier Stylist</p>
                  <p className="text-[11px] text-brand">● Online · replies instantly</p>
                </div>
                <span className="ml-auto font-serif text-2xl italic text-muted">Aa</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {["Dinner look", "Find my size", "Under $200"].map((reply) => (
                  <span key={reply} className="rounded-full border border-hairline px-3 py-1 text-[11px] text-muted">
                    {reply}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                {["#f76d01", "#c40000", "#6b358d", "#f3eee6"].map((c) => (
                  <span key={c} className="h-5 w-5 rounded-full ring-1 ring-white/10" style={{ background: c }} />
                ))}
              </div>
            </div>
          </Tile>

          <Tile
            className="min-[900px]:col-span-4"
            kicker="Catalog"
            title="Your categories, understood."
            body="Products are indexed by category and mapped to one universal taxonomy, so search and sizing speak the same language."
          >
            <ul data-mapping className="space-y-2">
              {mapping.map(([from, to]) => (
                <li key={from} className="grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 text-[12px]">
                  <span className="rounded-lg border border-hairline bg-[var(--surface-card)] px-3 py-2 text-muted">{from}</span>
                  <span data-map-arrow className="h-px origin-left bg-[image:var(--grad-brand)]" />
                  <span className="rounded-lg border border-brand/25 bg-brand/[0.07] px-3 py-2 text-bone">{to}</span>
                </li>
              ))}
            </ul>
          </Tile>

          <Tile
            className="min-[900px]:col-span-4"
            kicker="Usage"
            title="Metered, never a surprise."
            body="Session units, live minutes and garment units per cycle. On Main, unused units roll over up to twice the include."
          >
            <ul className="space-y-4">
              {meters.map(([label, w, value]) => (
                <li key={label}>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted">{label}</span>
                    <span className="font-mono text-bone">{value}</span>
                  </div>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <span data-bar className="block h-full origin-left rounded-full bg-[image:var(--grad-brand)]" style={{ width: `${w * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Tile>

          <article data-tile className="flex flex-col gap-6 rounded-[28px] border border-hairline bg-surface p-6 min-[900px]:col-span-12 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">Controls</p>
              <h3 className="mt-2 font-display text-xl font-semibold tracking-[-0.03em] text-bone">Off in one click. New token in one more.</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-3 rounded-full border border-hairline bg-[var(--surface-card)] py-2 pl-4 pr-2 text-[12px] text-bone">
                Widget live
                <span className="relative h-6 w-11 rounded-full bg-brand">
                  <span className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm" />
                </span>
              </span>
              <span className="flex items-center gap-2 rounded-full border border-hairline bg-[var(--surface-card)] px-4 py-2.5 font-mono text-[11px] text-muted">
                w=•••••••3f9a
                <span className="text-bone">↻ Regenerate</span>
              </span>
              <span className="flex overflow-hidden rounded-full border border-hairline font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className="bg-hairline px-3 py-2.5 text-bone">Active</span>
                <span className="px-3 py-2.5 text-faint">Paused</span>
                <span className="px-3 py-2.5 text-faint">Draft</span>
              </span>
            </div>
          </article>
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Example data.</p>
      </div>
    </section>
  );
}
