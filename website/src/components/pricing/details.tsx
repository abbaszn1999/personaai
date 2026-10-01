"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { compare, faqs, topUps, units } from "@/lib/pricing";
import { appPath } from "@/lib/site";
import { cn } from "@/lib/cn";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function Heading({ kicker, a, b }: { kicker: string; a: string; b: string }) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">{kicker}</p>
      <h2 className="mt-6 font-display text-[clamp(2.4rem,5vw,5.2rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
        {a}
        <span className="block font-serif font-normal italic text-muted">{b}</span>
      </h2>
    </div>
  );
}

function useReveal(selector: string) {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      gsap.from(selector, {
        autoAlpha: 0,
        y: 40,
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.08,
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });
    },
    { scope: root },
  );
  return root;
}

export function Units() {
  const root = useReveal("[data-unit]");

  return (
    <section ref={root} className="px-[var(--gutter)] py-[var(--section-y)]">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <Heading kicker="What a unit is" a="Every unit," b="accounted for." />
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Units are priced from what each action actually costs to run. Nothing is rounded up, and fractions carry over instead of being lost.
          </p>
        </div>
        <div className="mt-14 grid gap-4 min-[1000px]:grid-cols-3">
          {units.map((unit, index) => (
            <article key={unit.key} data-unit className="group relative flex flex-col overflow-hidden rounded-[32px] border border-hairline bg-surface p-8">
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand/10 blur-3xl transition-opacity duration-700 group-hover:opacity-100 opacity-40" />
              <div className="relative flex items-center justify-between">
                <span className="font-mono text-xs text-brand">{String(index + 1).padStart(2, "0")}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{unit.per}</span>
              </div>
              <p className="relative mt-10 font-display text-6xl font-semibold tracking-[-0.05em] text-bone">{unit.price}</p>
              <h3 className="relative mt-3 font-display text-xl font-semibold tracking-[-0.03em] text-bone">{unit.name}</h3>
              <p className="relative mt-3 text-sm leading-relaxed text-muted">{unit.body}</p>
              <div className="relative mt-auto pt-8">
                <dl className="divide-y divide-hairline border-t border-hairline text-[13px]">
                  {unit.example.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-3">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-mono text-bone">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TopUps() {
  const root = useReveal("[data-top]");

  return (
    <section ref={root} className="px-[var(--gutter)] py-[8vh]">
      <div className="mx-auto grid max-w-[1400px] gap-10 rounded-[36px] border border-hairline p-8 min-[1000px]:grid-cols-[0.8fr_1.2fr] min-[1000px]:p-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Top-ups</p>
          <h3 className="mt-5 font-display text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-bone">
            Need more? Buy it at cost.
          </h3>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
            Busy month or a big launch, top up any unit from the dashboard. Packs are priced at cost.
          </p>
        </div>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {topUps.map((top) => (
            <li key={top.name} data-top className="grid items-center gap-2 py-6 min-[700px]:grid-cols-[1fr_1fr_auto] min-[700px]:gap-6">
              <div>
                <p className="font-display text-lg font-semibold tracking-[-0.02em] text-bone">{top.name}</p>
                <p className="text-[13px] text-muted">{top.unit}</p>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{top.range}</p>
              <p className="font-display text-3xl font-semibold tracking-[-0.04em] text-bone">{top.price}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Compare() {
  const root = useReveal("[data-row]");

  return (
    <section ref={root} className="px-[var(--gutter)] py-[var(--section-y)]">
      <div className="mx-auto max-w-[1400px]">
        <Heading kicker="Side by side" a="Trial and Main," b="line by line." />
        <div className="mt-14 overflow-hidden rounded-[32px] border border-hairline">
          <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-white/[0.02] px-6 py-5 font-mono text-[10px] uppercase tracking-[0.2em] min-[700px]:px-10">
            <span className="text-faint">Plan</span>
            <span className="text-bone">Trial</span>
            <span className="text-brand">Main</span>
          </div>
          {compare.map(([label, trial, main]) => (
            <div
              key={label}
              data-row
              className="grid grid-cols-[1.2fr_1fr_1fr] gap-3 border-t border-hairline px-6 py-5 text-[13px] transition-colors hover:bg-white/[0.02] min-[700px]:px-10 min-[700px]:text-sm"
            >
              <span className="text-muted">{label}</span>
              <span className="text-bone">{trial}</span>
              <span className="text-bone">{main}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="scroll-mt-20 px-[var(--gutter)] py-[var(--section-y)]">
      <div className="mx-auto grid max-w-[1400px] gap-14 min-[1000px]:grid-cols-[0.8fr_1.2fr]">
        <div className="min-[1000px]:sticky min-[1000px]:top-32 min-[1000px]:self-start">
          <Heading kicker="Questions" a="Asked often," b="answered plainly." />
          <Link href="/contact" className="mt-8 inline-flex rounded-full border border-hairline px-6 py-3 text-sm text-bone transition hover:border-bone/40">
            Something else? Talk to us →
          </Link>
        </div>
        <ul className="border-t border-hairline">
          {faqs.map((faq, index) => {
            const isOpen = open === index;
            return (
              <li key={faq.q} className="border-b border-hairline">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-6 py-6 text-left"
                >
                  <span className={cn("font-display text-lg font-semibold tracking-[-0.02em] transition-colors min-[700px]:text-xl", isOpen ? "text-bone" : "text-bone/75")}>
                    {faq.q}
                  </span>
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-lg transition duration-500",
                      isOpen ? "rotate-45 border-brand bg-brand text-white" : "border-hairline text-muted",
                    )}
                  >
                    +
                  </span>
                </button>
                <div className={cn("grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <p className="overflow-hidden pr-14 text-[15px] leading-relaxed text-muted">
                    <span className="block pb-6">{faq.a}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function PricingCta() {
  return (
    <section className="px-[var(--gutter)] pb-[6vh]">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] p-10 min-[900px]:p-16" style={{ background: "var(--grad-dusk)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-10 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <h2 className="max-w-[16ch] font-display text-[clamp(2.4rem,5vw,5rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-white">
            See the sales first. Decide after.
          </h2>
          <div className="flex flex-wrap gap-3">
            <a href={appPath("/sign-up")} className="auth-out rounded-full bg-white px-7 py-4 text-sm font-semibold text-black transition hover:bg-white/90 shadow-md">
              Start the $450 trial →
            </a>
            <Link href="/contact" className="rounded-full border border-white/40 px-7 py-4 text-sm font-medium text-white transition hover:bg-white/10">
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
