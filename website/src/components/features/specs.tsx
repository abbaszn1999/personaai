"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { reasons, specs } from "@/lib/features";
import { appPath } from "@/lib/site";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function Reasons() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from("[data-reason]", {
        autoAlpha: 0,
        y: 40,
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.12,
        scrollTrigger: { trigger: root.current, start: "top 80%" },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="border-y border-hairline px-[var(--gutter)]">
      <div className="mx-auto grid max-w-[1400px] divide-hairline min-[900px]:grid-cols-3 min-[900px]:divide-x max-[899px]:divide-y">
        {reasons.map((reason) => (
          <div key={reason.n} data-reason className="py-12 min-[900px]:px-10 min-[900px]:first:pl-0 min-[900px]:last:pr-0">
            <span className="font-mono text-xs text-brand">{reason.n}</span>
            <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.035em] text-bone">{reason.title}</h3>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{reason.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Specs() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from("[data-spec]", {
        autoAlpha: 0,
        y: 24,
        duration: 0.9,
        ease: "expo.out",
        stagger: 0.06,
        scrollTrigger: { trigger: "[data-specs]", start: "top 80%" },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="px-[var(--gutter)] py-[var(--section-y)]">
      <div className="mx-auto grid max-w-[1400px] gap-14 min-[1100px]:grid-cols-[0.8fr_1.2fr]">
        <div className="min-[1100px]:sticky min-[1100px]:top-32 min-[1100px]:self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Under the hood</p>
          <h2 className="mt-6 font-display text-[clamp(2.4rem,4.4vw,4.6rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
            Built to sit quietly
            <span className="block font-serif font-normal italic text-muted">in your theme.</span>
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">
            Read-only access, encrypted credentials, and a widget that never touches your checkout.
          </p>
        </div>
        <dl data-specs className="border-t border-hairline">
          {specs.map((spec, index) => (
            <div
              key={spec.k}
              data-spec
              className="group grid gap-2 border-b border-hairline py-6 transition-colors min-[700px]:grid-cols-[3rem_11rem_1fr] min-[700px]:items-baseline"
            >
              <span className="hidden font-mono text-[10px] text-faint min-[700px]:block">{String(index + 1).padStart(2, "0")}</span>
              <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">{spec.k}</dt>
              <dd className="text-[15px] leading-relaxed text-bone/80 transition-colors group-hover:text-bone">{spec.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function FeaturesCta() {
  return (
    <section className="px-[var(--gutter)] pb-[6vh]">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] p-10 min-[900px]:p-16" style={{ background: "var(--grad-dusk)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-10 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <h2 className="max-w-[14ch] font-display text-[clamp(2.4rem,5vw,5rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-white">
            Thirty days to see it sell.
          </h2>
          <div className="flex flex-wrap gap-3">
            <a href={appPath("/sign-up")} className="auth-out rounded-full bg-white px-7 py-4 text-sm font-semibold text-black transition hover:bg-white/90 shadow-md">
              Start the $450 trial →
            </a>
            <Link href="/pricing" className="rounded-full border border-white/40 px-7 py-4 text-sm font-medium text-white transition hover:bg-white/10">
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
