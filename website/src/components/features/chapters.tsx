"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { chapters } from "@/lib/features";
import { cn } from "@/lib/cn";
import { AvatarVisual, CartVisual, LiveVisual, SizingVisual, StylistVisual, TryOnVisual } from "@/components/features/visuals";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const visuals = {
  avatar: AvatarVisual,
  "try-on": TryOnVisual,
  live: LiveVisual,
  stylist: StylistVisual,
  sizing: SizingVisual,
  cart: CartVisual,
} as const;

type Q = (selector: string) => HTMLElement[];

function counter(q: Q, selector: string, to: number, format = (v: number) => String(Math.round(v))) {
  const state = { v: 0 };
  return gsap.to(state, {
    v: to,
    duration: 1,
    onUpdate: () => q(selector).forEach((el) => (el.textContent = format(state.v))),
  });
}

function build(id: string, q: Q, tl: gsap.core.Timeline) {
  if (id === "avatar") {
    tl.from(q("[data-row]"), { autoAlpha: 0, x: -12, stagger: 0.12, duration: 0.3 })
      .from(q("[data-fill]"), { scaleX: 0, stagger: 0.12, duration: 0.4 }, "<")
      .to(q("[data-scan]"), { top: "100%", duration: 0.8 }, 0.1)
      .from(q("[data-avatar]"), { clipPath: "inset(100% 0 0 0)", duration: 0.9 }, ">-0.2")
      .to(q("[data-discard]"), { opacity: 1, duration: 0.3 });
  }
  if (id === "try-on") {
    tl.from(q("[data-garment]"), { autoAlpha: 0, x: 16, stagger: 0.18, duration: 0.3 })
      .add(counter(q, "[data-garment-count]", 4), 0)
      .to(q("[data-slot='on']"), { backgroundColor: "#f76d01", stagger: 0.18, duration: 0.1 }, 0)
      .to(q("[data-dressed]"), { clipPath: "inset(0 0 0% 0)", duration: 1 }, 0.3)
      .to(q("[data-wipe]"), { top: "100%", duration: 1 }, "<")
      .to(q("[data-wipe]"), { opacity: 0, duration: 0.1 });
  }
  if (id === "live") {
    tl.to(q("[data-loaded]"), { opacity: 1, duration: 0.2 })
      .to(q("[data-session]"), { scaleX: 1, duration: 1.5 }, 0.1)
      .add(
        counter(q, "[data-timer]", 90, (v) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(Math.floor(v % 60)).padStart(2, "0")}`).duration(1.5),
        0.1,
      )
      .to(q("[data-track]"), { x: 14, y: 6, duration: 0.5, ease: "sine.inOut" }, 0.1)
      .to(q("[data-track]"), { x: -8, y: 2, duration: 0.5, ease: "sine.inOut" })
      .to(q("[data-track]"), { x: 0, y: 0, duration: 0.5, ease: "sine.inOut" });
  }
  if (id === "stylist") {
    const msgs = q("[data-msg]");
    tl.from(msgs[0], { autoAlpha: 0, y: 14, duration: 0.3 })
      .from(msgs[1], { autoAlpha: 0, y: 14, duration: 0.3 })
      .add(counter(q, "[data-found-n]", 3).duration(0.4))
      .from(q("[data-result]"), { autoAlpha: 0, y: 18, scale: 0.95, stagger: 0.12, duration: 0.3 }, "<")
      .from(msgs[2], { autoAlpha: 0, y: 14, duration: 0.3 })
      .from(msgs[3], { autoAlpha: 0, duration: 0.3 });
  }
  if (id === "sizing") {
    tl.from(q("[data-size]"), { autoAlpha: 0, stagger: 0.1, duration: 0.25 })
      .from(q("[data-marker]"), { left: "0%", stagger: 0.1, duration: 0.6 })
      .to(q("[data-hit]"), { opacity: 1, duration: 0.25 })
      .to(q("[data-rec]"), { opacity: 1, duration: 0.25 }, "<");
  }
  if (id === "cart") {
    tl.from(q("[data-item]"), { autoAlpha: 0, x: 30, stagger: 0.2, duration: 0.35 })
      .add(counter(q, "[data-cart-n]", 3, (v) => `(${Math.round(v)})`).duration(0.6), 0)
      .to(q("[data-toast]"), { opacity: 1, duration: 0.25 });
  }
}

export function Chapters() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const panels = gsap.utils.toArray<HTMLElement>("[data-panel]", root.current);
      const mm = gsap.matchMedia();

      panels.forEach((panel, index) => {
        const q = gsap.utils.selector(panel) as Q;
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: panel, start: "top 75%", end: "center 45%", scrub: 0.6 },
        });
        build(panel.dataset.panel ?? "", q, tl);

        ScrollTrigger.create({
          trigger: panel,
          start: "top 55%",
          end: "bottom 55%",
          onToggle: (self) => self.isActive && setActive(index),
        });
      });

      mm.add("(min-width: 1100px)", () => {
        gsap.to("[data-progress]", {
          scaleY: 1,
          ease: "none",
          scrollTrigger: { trigger: "[data-panels]", start: "top center", end: "bottom center", scrub: true },
        });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const current = chapters[active];

  return (
    <section ref={root} className="relative px-[var(--gutter)] py-[var(--section-y)]">
      <div className="mx-auto max-w-[1400px]">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">The shopper&apos;s side</p>
          <h2 className="mt-6 font-display text-[clamp(2.4rem,5vw,5.2rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
            Six things happen
            <span className="block font-serif font-normal italic text-muted">between browse and buy.</span>
          </h2>
        </div>

        <div className="mt-12 min-[900px]:mt-[10vh] grid gap-16 min-[1100px]:grid-cols-[0.85fr_1.15fr] min-[1100px]:gap-20">
          <aside className="relative hidden min-[1100px]:block">
            <div className="sticky top-0 flex h-svh flex-col justify-center py-24">
              <div className="flex gap-8">
                <div className="relative w-px shrink-0 bg-hairline">
                  <span data-progress className="absolute inset-0 origin-top scale-y-0 bg-[image:var(--grad-brand)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <ol className="grid w-fit grid-cols-3 gap-x-8 gap-y-2.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                    {chapters.map((chapter, index) => (
                      <li key={chapter.id}>
                        <a href={`#${chapter.id}`} className={cn("transition-colors", index === active ? "text-brand" : "text-faint hover:text-muted")}>
                          {chapter.n} {chapter.label}
                        </a>
                      </li>
                    ))}
                  </ol>

                  <div className="relative mt-12 min-h-[26rem]">
                    {chapters.map((chapter, index) => (
                      <div
                        key={chapter.id}
                        aria-hidden={index !== active}
                        className={cn(
                          "absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          index === active ? "translate-y-0 opacity-100" : index < active ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0",
                        )}
                      >
                        <span className="font-display text-[7rem] font-semibold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgba(243,238,230,0.18)]">
                          {chapter.n}
                        </span>
                        <h3 className="mt-2 font-display text-[clamp(2rem,3vw,3.2rem)] font-semibold leading-[1] tracking-[-0.045em] text-bone">
                          {chapter.title}
                        </h3>
                        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">{chapter.body}</p>
                        <ul className="mt-8 space-y-2.5">
                          {chapter.facts.map((fact) => (
                            <li key={fact} className="flex items-center gap-3 text-sm text-bone">
                              <span className="h-px w-5 bg-brand" />
                              {fact}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="sr-only" aria-live="polite">
                    {current.label}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <div data-panels className="space-y-24 min-[1100px]:space-y-0">
            {chapters.map((chapter) => {
              const Visual = visuals[chapter.id];
              return (
                <div
                  key={chapter.id}
                  id={chapter.id}
                  data-panel={chapter.id}
                  className="scroll-mt-24 min-[1100px]:flex min-[1100px]:min-h-svh min-[1100px]:items-center"
                >
                  <div className="w-full">
                    <div className="mb-8 min-[1100px]:hidden">
                      <span className="font-mono text-xs text-brand">
                        {chapter.n} · {chapter.label}
                      </span>
                      <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-bone">{chapter.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted">{chapter.body}</p>
                      <ul className="mt-5 space-y-2">
                        {chapter.facts.map((fact) => (
                          <li key={fact} className="flex items-center gap-3 text-sm text-bone">
                            <span className="h-px w-4 bg-brand" />
                            {fact}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Visual />
                  </div>
                </div>
              );
            })}
            <p className="pb-8 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              Example screens. Names, sizes and prices come from your store.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
