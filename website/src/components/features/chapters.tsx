"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { chapters, chaptersIntro } from "@/lib/features";
import { stylist } from "@/lib/content";
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

const total = stylist.catalog.filter((item) => item.match).reduce((sum, item) => sum + item.price, 0);

const count = (q: Q, selector: string, to: number, duration: number, format = (v: number) => String(Math.round(v))) =>
  gsap.fromTo(q(selector), { textContent: 0 }, { textContent: to, duration, modifiers: { textContent: (v: string) => format(Number(v)) } });

const press = (tl: gsap.core.Timeline, target: HTMLElement[], at?: string | number) =>
  tl.to(target, { scale: 0.94, duration: 0.08, ease: "power1.in" }, at).to(target, { scale: 1, duration: 0.2, ease: "back.out(3)" });

const clock = (v: number) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(Math.floor(v % 60)).padStart(2, "0")}`;

function build(id: string, q: Q, tl: gsap.core.Timeline) {
  if (id === "avatar") {
    const steps = q("[data-ostep]");
    tl.from(q("[data-field]"), { autoAlpha: 0, y: 6, stagger: 0.06, duration: 0.2, ease: "power2.out" })
      .to(steps[0], { scaleX: 1, duration: 0.3 }, "<")
      .from(q("[data-selfie]"), { scale: 0, autoAlpha: 0, duration: 0.3, ease: "back.out(2)" })
      .from(q("[data-photo-ok]"), { autoAlpha: 0, duration: 0.15 })
      .to(steps[1], { scaleX: 1, duration: 0.3 }, "<");
    press(tl, q("[data-create]"));
    tl.to(q("[data-gen]"), { opacity: 1, duration: 0.15 })
      .add(count(q, "[data-pct]", 100, 0.8))
      .to(q("[data-gen-bar]"), { scaleX: 1, duration: 0.8 }, "<")
      .to(q("[data-scan]"), { opacity: 1, duration: 0.05 }, "<")
      .to(q("[data-scan]"), { top: "100%", duration: 0.8, ease: "sine.inOut" }, "<")
      .fromTo(q("[data-reveal]"), { clipPath: "inset(0% 0% 0% 0%)" }, { clipPath: "inset(100% 0% 0% 0%)", duration: 0.8, ease: "sine.inOut" }, "<")
      .to(q("[data-gen]"), { opacity: 0, duration: 0.2 }, ">-0.35")
      .to(q("[data-scan]"), { opacity: 0, duration: 0.1 })
      .to(steps[2], { scaleX: 1, duration: 0.3 }, "<")
      .to(q("[data-done]"), { opacity: 1, duration: 0.2 })
      .to(q("[data-note]"), { opacity: 1, duration: 0.2 }, "<");
  }
  if (id === "try-on") {
    tl.from(q("[data-garment]"), { autoAlpha: 0, x: 16, stagger: 0.15, duration: 0.3, ease: "power2.out" })
      .to(q("[data-check]"), { backgroundColor: "#f76d01", borderColor: "#f76d01", color: "#fff", stagger: 0.15, duration: 0.1 }, 0.15)
      .to(q("[data-slot='on']"), { backgroundColor: "#f76d01", stagger: 0.15, duration: 0.1 }, 0.15)
      .add(count(q, "[data-gcount]", 3, 0.45), 0.15);
    press(tl, q("[data-wear]"));
    tl.to(q("[data-scanov]"), { opacity: 1, duration: 0.15 })
      .to(q("[data-beam]"), { opacity: 1, duration: 0.05 }, "<")
      .to(q("[data-beam]"), { top: "100%", duration: 1, ease: "sine.inOut" })
      .to(q("[data-next]"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1, ease: "sine.inOut" }, "<")
      .to(q("[data-scanov], [data-beam]"), { opacity: 0, duration: 0.2 })
      .from(q("[data-hot]"), { autoAlpha: 0, scale: 0.3, stagger: 0.1, duration: 0.25, ease: "back.out(2.5)" })
      .to(q("[data-note]"), { opacity: 1, duration: 0.2 }, "<");
  }
  if (id === "live") {
    const host = q("[data-live-rack]")[0];
    const cursor = q("[data-live-cursor]");
    const spot = (index: number, dx = 0.62, dy = 0.5) => {
      const card = q(`[data-live-card="${index}"]`)[0];
      const a = host.getBoundingClientRect();
      const b = card.getBoundingClientRect();
      return { x: b.left - a.left + b.width * dx, y: b.top - a.top + b.height * dy };
    };
    const wear = (from: number, to: number) => {
      tl.to(cursor, { opacity: 1, duration: 0.2 })
        .to(cursor, { x: () => spot(to).x, y: () => spot(to).y, duration: 0.6, ease: "power2.inOut" }, "<")
        .to(cursor, { scale: 0.8, duration: 0.1, yoyo: true, repeat: 1 })
        .fromTo(q(`[data-live-ripple="${to}"]`), { scale: 0, opacity: 0.9 }, { scale: 1.8, opacity: 0, duration: 0.45, ease: "power2.out" }, "<")
        .to(q(`[data-live-ring="${from}"]`), { opacity: 0, duration: 0.15 }, "<")
        .to(q(`[data-live-badge="${from}"]`), { opacity: 0, duration: 0.15 }, "<")
        .to(q(`[data-live-ring="${to}"]`), { opacity: 1, duration: 0.15 }, "<")
        .to(q(`[data-live-badge="${to}"]`), { opacity: 1, duration: 0.15 }, "<")
        .to(q("[data-live-flash]"), { opacity: 0.55, duration: 0.08, yoyo: true, repeat: 1 }, "<")
        .fromTo(q("[data-live-sweep]"), { top: "0%", opacity: 1 }, { top: "100%", duration: 0.6, ease: "sine.inOut" }, "<")
        .to(q(`[data-live-img="${to}"]`), { opacity: 1, duration: 0.3 }, "<0.15")
        .to(q(`[data-live-img="${from}"]`), { opacity: 0, duration: 0.3 }, "<")
        .to(q(`[data-live-cap="${from}"]`), { opacity: 0, y: -6, duration: 0.2 }, "<")
        .fromTo(q(`[data-live-cap="${to}"]`), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25 }, "<0.05")
        .to(q("[data-live-sweep]"), { opacity: 0, duration: 0.1 })
        .to({}, { duration: 0.9 });
    };
    press(tl, q("[data-cam-btn]"), 0.4);
    tl.to(q("[data-cam-off]"), { opacity: 0, duration: 0.4 })
      .to(q("[data-live-ui]"), { opacity: 1, duration: 0.3 }, "<0.1")
      .fromTo(q("[data-live-joint]"), { scale: 0 }, { scale: 1, stagger: 0.03, duration: 0.2, ease: "back.out(3)" }, "<0.1")
      .add(count(q, "[data-timer]", 14, 9, clock), "<")
      .to({}, { duration: 0.8 });
    wear(0, 1);
    wear(1, 2);
    wear(2, 3);
    tl.to(cursor, { opacity: 0, duration: 0.2 });
  }
  if (id === "stylist") {
    const msgs = q("[data-msg]");
    tl.from(msgs[0], { autoAlpha: 0, y: 14, duration: 0.3, ease: "power2.out" })
      .from(msgs[1], { autoAlpha: 0, y: 14, duration: 0.3, ease: "power2.out" })
      .from(q("[data-tag]"), { autoAlpha: 0, x: -6, stagger: 0.08, duration: 0.15 })
      .add(count(q, "[data-found]", 3, 0.3))
      .from(q("[data-result]"), { autoAlpha: 0, y: 18, scale: 0.95, stagger: 0.12, duration: 0.3, ease: "power2.out" }, "<")
      .from(msgs[2], { autoAlpha: 0, y: 14, duration: 0.3, ease: "power2.out" })
      .from(msgs[3], { autoAlpha: 0, duration: 0.3 })
      .to(q("[data-budget]"), { scaleX: total / stylist.budget, duration: 0.4 }, "<");
    press(tl, q("[data-wear]"));
    tl.to(q("[data-beam]"), { opacity: 1, duration: 0.05 })
      .to(q("[data-beam]"), { top: "100%", duration: 0.9, ease: "sine.inOut" })
      .to(q("[data-next]"), { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "sine.inOut" }, "<")
      .to(q("[data-beam]"), { opacity: 0, duration: 0.1 })
      .from(q("[data-hot]"), { autoAlpha: 0, scale: 0.3, stagger: 0.1, duration: 0.25, ease: "back.out(2.5)" });
  }
  if (id === "sizing") {
    tl.from(q("[data-measure]"), { autoAlpha: 0, stagger: 0.2, duration: 0.2 })
      .from(q("[data-measure-line]"), { scaleX: 0, stagger: 0.2, duration: 0.4, ease: "power2.out" }, "<")
      .from(q("[data-size]"), { autoAlpha: 0, x: -8, stagger: 0.08, duration: 0.2 }, 0.1)
      .to(q("[data-hit]"), { opacity: 1, duration: 0.25 })
      .to(q("[data-ring]"), { "--p": 94, duration: 0.7, ease: "power2.out" })
      .add(count(q, "[data-fit]", 94, 0.7), "<")
      .to(q("[data-rec]"), { opacity: 1, duration: 0.25 }, ">-0.2");
  }
  if (id === "cart") {
    press(tl, q("[data-add]"), 0.1);
    tl.to(q("[data-add-a]"), { opacity: 0, duration: 0.1 })
      .to(q("[data-add-b]"), { opacity: 1, duration: 0.1 }, "<")
      .from(q("[data-item]"), { autoAlpha: 0, x: 30, stagger: 0.18, duration: 0.35, ease: "power2.out" })
      .add(count(q, "[data-cart-n]", 3, 0.54, (v) => `(${Math.round(v)})`), "<")
      .add(count(q, "[data-cart]", 3, 0.54), "<");
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
        // Plays on its own in real time when the chapter comes into view, loops, and rests when it leaves.
        const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1.8, defaults: { ease: "power2.out" } });
        build(panel.dataset.panel ?? "", q, tl);

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          tl.repeat(0).progress(1);
        } else {
          ScrollTrigger.create({
            trigger: panel,
            start: "top 70%",
            end: "bottom 30%",
            onToggle: (self) => (self.isActive ? tl.restart() : tl.pause()),
          });
        }

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
        <div className="grid gap-8 min-[1100px]:grid-cols-[1.3fr_0.7fr] min-[1100px]:items-end min-[1100px]:gap-20">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">{chaptersIntro.kicker}</p>
            <h2 className="mt-6 max-w-[16ch] font-display text-[clamp(2.4rem,5vw,5.2rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
              {chaptersIntro.title}{" "}
              <span className="font-serif font-normal italic tracking-[-0.03em] text-muted">{chaptersIntro.accent}</span>
            </h2>
          </div>
          <div>
            <p className="max-w-md leading-relaxed text-muted">{chaptersIntro.body}</p>
            <ol className="mt-6 grid max-w-md grid-cols-3 gap-x-4 gap-y-2 border-t border-hairline pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <a href={`#${chapter.id}`} className="transition-colors hover:text-bone">
                    <span className="text-brand">{chapter.n}</span> {chapter.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
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

                  <div className="relative mt-10 min-h-[36rem]">
                    {chapters.map((chapter, index) => (
                      <div
                        key={chapter.id}
                        aria-hidden={index !== active}
                        className={cn(
                          "absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          index === active ? "translate-y-0 opacity-100" : index < active ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0",
                        )}
                      >
                        <span className="font-display text-[6rem] font-semibold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_var(--hairline-strong)]">
                          {chapter.n}
                        </span>
                        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">The problem</p>
                        <p className="mt-2 max-w-md font-serif text-[1.35rem] italic leading-snug text-muted">{chapter.problem}</p>
                        <p className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
                          What Persona does
                        </p>
                        <h3 className="mt-2 font-display text-[clamp(2rem,2.8vw,3rem)] font-semibold leading-[1] tracking-[-0.045em] text-bone">
                          {chapter.title}
                        </h3>
                        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">{chapter.body}</p>
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
            {chapters.map((chapter, chapterIndex) => {
              const Visual = visuals[chapter.id];
              const next = chapters[chapterIndex + 1];
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
                      <p className="mt-3 font-serif text-lg italic leading-snug text-muted">{chapter.problem}</p>
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
                    <div className="relative">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10 opacity-70"
                        style={{
                          background:
                            "radial-gradient(50% 50% at 70% 35%, rgba(247,109,1,0.16), transparent 70%), radial-gradient(45% 45% at 20% 80%, rgba(107,53,141,0.2), transparent 70%)",
                        }}
                      />
                      <Visual />

                      <div className="mt-5 flex items-center gap-3">
                        <ol className="flex flex-1 items-center gap-1.5" aria-label={`Step ${chapter.n} of 6`}>
                          {chapters.map((step, stepIndex) => (
                            <li
                              key={step.id}
                              className={cn(
                                "h-[3px] flex-1 rounded-full transition-colors",
                                stepIndex < chapterIndex ? "bg-brand/60" : stepIndex === chapterIndex ? "bg-[image:var(--grad-brand)]" : "bg-hairline",
                              )}
                            />
                          ))}
                        </ol>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                          <span className="text-brand">{chapter.n}</span> / 06
                          {next ? (
                            <>
                              {" "}· Next <span className="text-muted">{next.label}</span> →
                            </>
                          ) : (
                            <> · Done</>
                          )}
                        </span>
                      </div>
                    </div>
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
