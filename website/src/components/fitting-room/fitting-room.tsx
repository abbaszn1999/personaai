"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Callouts } from "@/components/fitting-room/callouts";
import { createMirrorStage, type MirrorStage } from "@/components/fitting-room/stage";
import { hero, looks } from "@/lib/content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const sources = looks.map((look) => look.src);

export function FittingRoom() {
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<MirrorStage | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!canvas.current) return;
    try {
      stage.current = createMirrorStage(canvas.current, sources);
    } catch {
      queueMicrotask(() => setWebgl(false));
    }
    return () => {
      stage.current?.destroy();
      stage.current = null;
    };
  }, []);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);

      const mm = gsap.matchMedia();
      mm.add(
        { desktop: "(min-width: 900px)", mobile: "(max-width: 899px)" },
        (ctx) => {
          const desktop = Boolean(ctx.conditions?.desktop);
          gsap.set(frame.current, desktop ? { xPercent: 58 } : { yPercent: -14, scale: 0.72 });
          gsap.set(q("[data-story], [data-callouts], [data-words]"), { autoAlpha: 1 });

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 1.1,
              onUpdate(self) {
                const progress = gsap.utils.clamp(0, 1, self.progress / 0.9) * (looks.length - 1);
                stage.current?.setProgress(progress);
                stage.current?.setIdle(self.progress < 0.04 ? 1 : 0);
                setActive(Math.round(progress));
              },
            },
          });

          tl.fromTo(q("[data-words]"), { xPercent: 6 }, { xPercent: -10, duration: 1 }, 0)
            .fromTo(q("[data-grid]"), { yPercent: 0 }, { yPercent: -18, duration: 1 }, 0)
            .fromTo(q("[data-story]"), { y: 40 }, { y: 0, duration: 0.08 }, 0);
        },
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  function onPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    stage.current?.setPointer((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }

  const look = looks[active];

  return (
    <section ref={root} id="fitting-room" className="relative h-[440vh]">
      <div className="sticky top-0 flex h-svh items-start justify-center overflow-hidden bg-bg pt-[5.25rem] min-[900px]:items-center min-[900px]:pt-0">
        <div
          aria-hidden
          className="fitting-room-ambient pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 42%, color-mix(in oklab, var(--wine-800) 55%, transparent), transparent 70%), radial-gradient(40% 40% at 80% 90%, color-mix(in oklab, var(--purple-900) 45%, transparent), transparent 70%)",
          }}
        />
        {looks.map((item, index) => (
          <div
            key={item.code}
            aria-hidden
            className="fitting-room-glow pointer-events-none absolute inset-0 transition-opacity duration-[1400ms]"
            style={{
              opacity: index === active ? 1 : 0,
              background: `radial-gradient(45% 60% at 72% 50%, ${item.glow}, transparent 70%)`,
            }}
          />
        ))}

        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(70%_70%_at_60%_50%,#000,transparent)]">
          <div
            data-grid
            className="absolute inset-x-0 top-0 h-[140%] opacity-[0.07] light:opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--text) 1px, transparent 1px), linear-gradient(to bottom, var(--text) 1px, transparent 1px)",
              backgroundSize: "88px 88px",
            }}
          />
        </div>

        <div
          data-words
          aria-hidden
          className="pointer-events-none invisible absolute inset-x-0 top-1/2 h-[26vw] -translate-y-1/2 select-none"
        >
          {looks.map((item, index) => (
            <span
              key={item.code}
              className="absolute inset-0 flex items-center justify-end pr-[2vw] font-display text-[25vw] font-semibold uppercase leading-none tracking-[-0.06em] text-white/[0.025] light:text-black/[0.03] transition-[opacity,transform,filter] duration-[1100ms] ease-[var(--ease-expo)] [-webkit-text-stroke:1px_var(--hairline)]"
              style={{
                opacity: index === active ? 1 : 0,
                transform: `translateY(${(index - active) * 12}%)`,
                filter: index === active ? "blur(0)" : "blur(10px)",
              }}
            >
              {item.word}
            </span>
          ))}
        </div>

        <div ref={frame} className="relative z-10">
          <div data-callouts className="pointer-events-none invisible absolute inset-0 z-20">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-7 inset-y-[6%] hidden w-3 min-[900px]:block"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, var(--hairline-strong) 0 1px, transparent 1px 12px), repeating-linear-gradient(to bottom, var(--brand) 0 1px, transparent 1px 60px)",
                backgroundSize: "6px 100%, 12px 100%",
                backgroundRepeat: "no-repeat",
              }}
            />
            <Callouts active={active} />
          </div>
        <div
          ref={mirror}
          onPointerMove={onPointer}
          className="relative h-[calc(100svh-17rem)] w-[min(88vw,calc((100svh-17rem)*0.5625))] overflow-hidden rounded-[28px] border border-hairline bg-[#0d0b10] shadow-[0_40px_120px_-20px_rgba(247,109,1,0.25)] light:shadow-[0_24px_70px_-15px_rgba(247,109,1,0.2),0_12px_32px_-8px_rgba(0,0,0,0.1)] min-[900px]:h-[82svh] min-[900px]:w-[calc(82svh*0.5625)]"
        >
          <canvas
            ref={canvas}
            aria-hidden
            className={webgl ? "h-full w-full" : "hidden"}
          />
          {!webgl ? (
            looks.map((item, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.src}
                src={item.src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 light:brightness-[1.2]"
                style={{ opacity: index === active ? 1 : 0 }}
              />
            ))
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 whitespace-nowrap p-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/90">
            <span>
              Look <span className="text-brand">{look.code}</span> / 04
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              {look.tag}
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-16 light:from-black/60 light:via-black/20">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">Rendered on avatar</p>
            <p className="mt-1 font-serif text-2xl italic leading-none text-white">{look.garment}</p>
          </div>
        </div>
        </div>

        <div data-story className="invisible absolute inset-y-0 left-0 z-30 flex w-full items-end px-[var(--gutter)] pb-10 min-[900px]:w-1/2 min-[900px]:items-center min-[900px]:pb-0">
          <div className="w-full max-w-lg">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">{hero.room}</p>
            <div className="relative mt-5 h-[12rem] min-[900px]:mt-12 min-[900px]:h-[24rem]">
              {looks.map((item, index) => (
                <article
                  key={item.code}
                  aria-hidden={index !== active}
                  className="absolute inset-0 transition-[opacity,transform,filter] duration-700 ease-[var(--ease-expo)]"
                  style={{
                    opacity: index === active ? 1 : 0,
                    transform: `translateY(${(index - active) * 28}px)`,
                    filter: index === active ? "blur(0)" : "blur(8px)",
                  }}
                >
                  <p className="hidden font-display text-[5.5rem] font-semibold min-[900px]:block leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_var(--hairline-strong)] min-[900px]:text-[8rem]">
                    {item.code}
                  </p>
                  <h2 className="font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-bone min-[900px]:mt-6 min-[900px]:text-5xl">
                    {item.title}
                  </h2>
                  <p className="mt-5 max-w-md text-sm leading-[1.75] text-muted min-[900px]:mt-7 min-[900px]:text-base">{item.body}</p>
                </article>
              ))}
            </div>
            <ol className="mt-8 flex gap-2 min-[900px]:mt-10" aria-label="Looks">
              {looks.map((item, index) => (
                <li key={item.code} className="h-[3px] flex-1 overflow-hidden rounded-full bg-hairline">
                  <span
                    className="block h-full origin-left bg-[image:var(--grad-brand)] transition-transform duration-700"
                    style={{ transform: `scaleX(${index <= active ? 1 : 0})` }}
                  />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
