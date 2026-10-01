"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { chapters, featuresHero } from "@/lib/features";
import { appPath } from "@/lib/site";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const columns = [
  ["/media/look-1.webp", "/media/studio-1.webp", "/media/look-3.webp", "/media/studio-3.webp"],
  ["/media/look-2.webp", "/media/backdrop-1.webp", "/media/look-4.webp", "/media/face.webp"],
  ["/media/studio-2.webp", "/media/look-3.webp", "/media/backdrop-3.webp", "/media/look-1.webp"],
];

export function FeaturesHero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const split = SplitText.create(q("[data-line]"), { type: "chars", mask: "chars" });
      gsap.set(split.masks, { paddingTop: "0.16em", marginTop: "-0.16em", paddingBottom: "0.16em", marginBottom: "-0.16em" });
      gsap.set(q(".reveal-pending"), { visibility: "visible" });
      const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
      intro
        .from(split.chars, { yPercent: 110, duration: 1.2, stagger: 0.018 })
        .from(q("[data-fade]"), { autoAlpha: 0, y: 24, duration: 1, stagger: 0.08 }, "-=0.8")
        .from(q("[data-col]"), { autoAlpha: 0, yPercent: 12, duration: 1.4, stagger: 0.12 }, 0.2);

      gsap.to(q("[data-cols]"), {
        yPercent: -10,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
      gsap.to(q("[data-copy]"), {
        yPercent: -18,
        autoAlpha: 0.2,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });

      return () => split.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative min-h-svh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 80% 30%, rgba(247,109,1,0.14), transparent 70%), radial-gradient(50% 40% at 10% 90%, rgba(107,53,141,0.16), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(var(--bone-50) 1px, transparent 1px), linear-gradient(90deg, var(--bone-50) 1px, transparent 1px)", backgroundSize: "88px 88px", maskImage: "radial-gradient(80% 70% at 40% 50%, #000, transparent)" }}
      />

      <div
        data-cols
        aria-hidden
        className="absolute inset-y-0 right-[var(--gutter)] hidden w-[40vw] max-w-[620px] grid-cols-3 gap-4 [mask-image:linear-gradient(transparent,#000_18%,#000_82%,transparent)] min-[1100px]:grid"
      >
        {columns.map((images, col) => (
          <div key={col} data-col className="relative overflow-hidden">
            <div
              className="flex flex-col gap-4"
              style={{ animation: `${col === 1 ? "col-down" : "col-up"} ${38 + col * 8}s linear infinite` }}
            >
              {[...images, ...images].map((src, index) => (
                <div key={index} className="relative aspect-[9/14] overflow-hidden rounded-3xl border border-hairline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div data-copy className="relative flex min-h-svh flex-col justify-center px-[var(--gutter)] pb-16 pt-28 min-[900px]:pb-[10vh] min-[900px]:pt-[18vh]">
        <p data-fade className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">
          {featuresHero.kicker}
        </p>
        <h1 className="reveal-pending mt-7 font-display text-[clamp(2.8rem,5.9vw,7rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-bone">
          <span data-line className="block">{featuresHero.lineA}</span>
          <span data-line className="block">{featuresHero.lineB}</span>
          <span data-line className="block font-serif font-normal italic tracking-[-0.03em] text-muted">
            {featuresHero.lineC}
          </span>
        </h1>
        <p data-fade className="mt-9 max-w-[46ch] text-base leading-relaxed text-muted">
          {featuresHero.lede}
        </p>
        <div data-fade className="mt-10 flex flex-wrap items-center gap-3">
          <a
            href={appPath("/sign-up")}
            className="auth-out w-full rounded-full bg-[image:var(--grad-brand)] px-7 py-4 text-center text-sm min-[480px]:w-auto font-semibold text-white transition hover:brightness-110"
          >
            Start the trial →
          </a>
          <a href="#avatar" className="w-full rounded-full border border-hairline px-7 py-4 text-center text-sm text-bone min-[480px]:w-auto transition hover:border-bone/40">
            Explore the features
          </a>
        </div>
        <nav data-fade aria-label="Feature index" className="mt-14 flex max-w-[640px] flex-wrap gap-2">
          {chapters.map((chapter) => (
            <a
              key={chapter.id}
              href={`#${chapter.id}`}
              className="group flex items-center gap-2 rounded-full border border-hairline bg-[var(--surface-card)] px-3.5 py-2 text-xs text-muted backdrop-blur transition hover:border-brand/50 hover:text-bone"
            >
              <span className="font-mono text-[10px] text-brand">{chapter.n}</span>
              {chapter.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
