"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { DemoScreen, DemoSteps } from "@/components/hero/demo-screen";
import { playDemo, showDemoEnd } from "@/components/hero/demo-timeline";
import { hero } from "@/lib/content";
import { appPath } from "@/lib/site";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const desktop = useRef<HTMLDivElement>(null);
  const mobile = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);

      document.fonts.ready.then(() => {
        const split = SplitText.create(q("[data-line]"), { type: "chars", mask: "chars" });
        gsap.set(split.masks, {
          paddingTop: "0.16em",
          marginTop: "-0.16em",
          paddingBottom: "0.16em",
          marginBottom: "-0.16em",
          paddingLeft: "0.14em",
          marginLeft: "-0.14em",
          paddingRight: "0.14em",
          marginRight: "-0.14em",
        });
        gsap.set(q(".reveal-pending"), { visibility: "visible" });
        gsap.from(split.chars, { yPercent: 110, duration: 1.2, ease: "expo.out", stagger: 0.026, delay: 0.1 });
      });
      gsap.from(q("[data-fade]"), { autoAlpha: 0, y: 16, duration: 1, ease: "expo.out", delay: 0.6, stagger: 0.08 });
      gsap.fromTo(q("[data-device]"), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: "expo.out", delay: 0.3 });

      const mm = gsap.matchMedia();
      mm.add(
        {
          wide: "(min-width: 1000px)",
          narrow: "(max-width: 999px)",
          still: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const scope = ctx.conditions?.wide ? desktop.current : mobile.current;
          if (!scope) return;
          const isMobile = !ctx.conditions?.wide;
          if (ctx.conditions?.still) {
            showDemoEnd(scope, isMobile);
            return;
          }
          return playDemo(scope, isMobile);
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="hero" className="relative overflow-hidden">
      <div
        aria-hidden
        className="hero-ambient pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 55% at 72% 45%, color-mix(in oklab, var(--wine-800) 50%, transparent), transparent 70%), radial-gradient(40% 40% at 10% 90%, color-mix(in oklab, var(--purple-900) 40%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [mask-image:radial-gradient(70%_70%_at_60%_45%,#000,transparent)] light:opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--text) 1px, transparent 1px), linear-gradient(to bottom, var(--text) 1px, transparent 1px)",
          backgroundSize: "88px 88px",
        }}
      />

      <div className="relative mx-auto grid max-w-[1560px] items-center gap-12 px-[var(--gutter)] pb-[var(--section-y)] pt-28 min-[1000px]:min-h-svh min-[1000px]:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] min-[1000px]:gap-12 min-[1000px]:pb-14 min-[1000px]:pt-32">
        <div className="min-w-0">
          <p data-fade className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">
            {hero.kicker}
          </p>
          <h1 className="reveal-pending mt-6 font-display text-[clamp(3rem,13vw,4.8rem)] font-semibold leading-[0.86] tracking-[-0.055em] text-bone min-[1000px]:text-[clamp(3.6rem,5.6vw,6.8rem)]">
            <span data-line className="block">
              {hero.lineA}
            </span>
            <span data-line className="block pb-[0.08em] pt-[0.16em] font-serif font-normal italic tracking-[-0.01em] text-muted">
              {hero.lineB}
            </span>
            <span data-line className="block">
              {hero.lineC}
            </span>
          </h1>
          <p data-fade className="mt-8 max-w-[44ch] text-base leading-relaxed text-muted">
            {hero.lede}
          </p>
          <div data-fade className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={appPath("/sign-up")}
              className="auth-out group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-[image:var(--grad-brand)] px-7 py-4 text-sm font-semibold text-white shadow-[0_12px_36px_-12px_rgba(247,109,1,0.7)] transition hover:brightness-110"
            >
              {hero.cta}
              <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
            </a>
            <a
              href={appPath("/dashboard")}
              className="auth-in group inline-flex items-center gap-3 rounded-full bg-[image:var(--grad-brand)] px-7 py-4 text-sm font-semibold text-white transition hover:brightness-110"
            >
              {hero.dashboard}
              <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#fitting-room"
              className="rounded-full border border-hairline px-7 py-4 text-sm text-bone transition hover:border-bone/40"
            >
              {hero.scroll}
            </a>
          </div>
          <ul data-fade className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            {hero.platforms.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div data-device className="reveal-pending min-w-0">
          <div ref={desktop} className="hidden min-[1000px]:block">
            <DemoScreen variant="desktop" />
            <DemoSteps />
          </div>
          <div ref={mobile} className="mx-auto w-[min(320px,84vw)] min-[1000px]:hidden">
            <DemoScreen variant="mobile" />
            <DemoSteps />
          </div>
        </div>
      </div>
    </section>
  );
}
