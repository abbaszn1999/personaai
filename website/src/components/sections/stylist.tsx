"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/cn";
import { stylist } from "@/lib/content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const tilePositions: Record<string, string> = {
  suit: "left-[3%] top-[6%]",
  coat: "right-[2%] top-[3%]",
  shirt: "right-[0%] top-[40%]",
  tee: "left-[0%] top-[42%]",
  loafers: "left-[6%] bottom-[5%]",
  bomber: "right-[5%] bottom-[3%]",
};

/** Where each piece sits on the rendered avatar, as percentages of the 9:16 photo. */
const pins: Record<string, { top: string; left: string }> = {
  suit: { top: "38%", left: "64%" },
  shirt: { top: "25%", left: "50%" },
  loafers: { top: "92%", left: "61%" },
};

const bundle = stylist.catalog.filter((item) => item.match);
const total = bundle.reduce((sum, item) => sum + item.price, 0);

function Crop({ item, className }: { item: (typeof stylist.catalog)[number]; className?: string }) {
  return (
    <div
      className={cn("bg-cover bg-no-repeat", className)}
      style={{ backgroundImage: `url(${item.image})`, backgroundPosition: item.crop, backgroundSize: item.zoom }}
    />
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
    </svg>
  );
}

function AvatarStage() {
  return (
    <div data-stage className="relative h-[37%] shrink-0 overflow-hidden rounded-[22px] bg-[#120f16]">
      <img src="/media/look-1.webp" alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl" />
      <img data-look-new src="/media/look-2.webp" alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl" />
      <div className="absolute inset-y-0 left-1/2 aspect-[9/16] -translate-x-1/2 shadow-[0_0_40px_10px_rgba(0,0,0,0.35)]">
        <img src="/media/look-1.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <img data-look-new src="/media/look-2.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        {bundle.map((item) => (
          <span key={item.id} data-pin className="absolute z-10 -ml-[7px] -mt-[7px] h-3.5 w-3.5" style={pins[item.id]}>
            <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
            <span className="absolute inset-0 rounded-full border-2 border-white bg-brand" />
          </span>
        ))}
        <div data-beam className="pointer-events-none absolute inset-x-0 top-0 h-0">
          <div className="absolute inset-x-[-40%] bottom-0 h-14 bg-gradient-to-t from-brand/35 to-transparent" />
          <div className="absolute inset-x-[-40%] -top-px h-[2px] bg-brand shadow-[0_0_16px_3px_rgba(247,109,1,0.75)]" />
        </div>
      </div>

      <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1 pr-2.5 text-[9px] font-medium text-white backdrop-blur">
        <img src="/media/face.webp" alt="" className="h-4 w-4 rounded-full object-cover" />
        Your avatar
      </span>
      <span data-rendering className="absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-brand backdrop-blur">
        Rendering look…
      </span>
      <span data-fit className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-medium text-white backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
        Size M · true fit
      </span>
    </div>
  );
}

export function Stylist() {
  const root = useRef<HTMLElement>(null);
  const amount = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(-1);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      mm.add({ desktop: "(min-width: 1100px)", mobile: "(max-width: 1099px)" }, (ctx) => {
        const desktop = Boolean(ctx.conditions?.desktop);
        const budget = { value: 0 };
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          scrollTrigger: desktop
            ? { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 1 }
            : { trigger: q("[data-phone]")[0], start: "top 70%", once: true },
          onUpdate() {
            const t = tl.time();
            const at = (label: string) => tl.labels[label] ?? Infinity;
            setStep(t < 0.2 ? -1 : t < at("search") ? 0 : t < at("build") ? 1 : t < at("try") ? 2 : t < at("cart") ? 3 : 4);
          },
        });

        const grow = (target: string, at: number | string, duration = 0.4) =>
          tl.fromTo(q(target), { height: 0, autoAlpha: 0, y: 10 }, { height: "auto", autoAlpha: 1, y: 0, duration }, at);

        tl.set(q("[data-look-new]"), { clipPath: "inset(0% 0% 100% 0%)" }, 0)
          .set(q("[data-pin], [data-fit], [data-rendering]"), { autoAlpha: 0 }, 0)
          .set(q("[data-beam]"), { top: "0%", autoAlpha: 0 }, 0);

        // 01 · The shopper types the ask into the widget and sends it.
        tl.to(q("[data-placeholder]"), { autoAlpha: 0, duration: 0.1 }, 0.2)
          .to(q("[data-field]"), { boxShadow: "0 0 0 1.5px rgba(247,109,1,0.8)", duration: 0.2 }, 0.2)
          .fromTo(q("[data-char]"), { display: "none" }, { display: "inline", duration: 0.03, stagger: 0.03, ease: "none" }, 0.25);
        const typed = 0.25 + stylist.ask.length * 0.03;
        tl.to(q("[data-send]"), { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1 }, typed + 0.1)
          .to(q("[data-typed]"), { autoAlpha: 0, duration: 0.1 }, typed + 0.25)
          .to(q("[data-placeholder]"), { autoAlpha: 1, duration: 0.2 }, typed + 0.3)
          .to(q("[data-field]"), { boxShadow: "0 0 0 0px rgba(247,109,1,0)", duration: 0.2 }, typed + 0.3);
        grow("[data-bubble-ask]", typed + 0.25);

        // 02 · It searches only the indexed catalog.
        tl.addLabel("search", typed + 0.6);
        grow("[data-searching]", "search", 0.3);

        if (desktop) {
          tl.fromTo(q("[data-scan]"), { left: "0%", autoAlpha: 1 }, { left: "100%", duration: 1.4, ease: "none" }, "search+=0.2")
            .to(q("[data-scan]"), { autoAlpha: 0, duration: 0.2 })
            .to(q("[data-tile='miss']"), { autoAlpha: 0.18, filter: "blur(3px) grayscale(1)", scale: 0.92, duration: 0.5, stagger: 0.12 }, "search+=0.4")
            .to(q("[data-tile='hit'] [data-tile-card]"), { boxShadow: "0 0 0 2px #f76d01, 0 0 40px -4px rgba(247,109,1,0.7)", duration: 0.4, stagger: 0.15 }, "search+=0.6");
        }

        // 03 · It answers with real products from the store, inside the budget.
        tl.addLabel("build", desktop ? "search+=2" : "search+=0.8")
          .to(q("[data-searching]"), { height: 0, autoAlpha: 0, duration: 0.3 }, "build");
        grow("[data-bubble-answer]", "build", 0.45);
        grow("[data-bundle]", "build+=0.2", 0.5);
        tl.from(q("[data-card]"), { autoAlpha: 0, y: 16, duration: 0.45, stagger: 0.18 }, "build+=0.35");

        if (desktop) {
          q("[data-tile='hit']").forEach((tile, index) => {
            const id = tile.getAttribute("data-id");
            const target = q(`[data-card-thumb='${id}']`)[0];
            const delta = (axis: "x" | "y") => {
              const a = tile.getBoundingClientRect();
              const b = target?.getBoundingClientRect();
              if (!b) return 0;
              const current = gsap.getProperty(tile, axis) as number;
              return axis === "x"
                ? b.left + b.width / 2 - (a.left + a.width / 2) + current
                : b.top + b.height / 2 - (a.top + a.height / 2) + current;
            };
            tl.to(
              tile,
              { x: () => delta("x"), y: () => delta("y"), scale: 0.55, duration: 0.7, ease: "power3.inOut" },
              `build+=${0.35 + index * 0.18}`,
            ).to(tile, { autoAlpha: 0, duration: 0.15 }, ">-0.1");
          });
        }

        tl.fromTo(
          budget,
          { value: 0 },
          {
            value: total,
            duration: 0.9,
            ease: "none",
            onUpdate: () => {
              if (amount.current) amount.current.textContent = `$${Math.round(budget.value)}`;
            },
          },
          "build+=0.5",
        ).fromTo(q("[data-budget-bar]"), { scaleX: 0 }, { scaleX: total / stylist.budget, duration: 0.9, ease: "none" }, "build+=0.5");

        // 04 · One tap renders the whole look on their own avatar.
        tl.addLabel("try", "build+=1.7")
          .to(q("[data-try]"), { scale: 0.93, duration: 0.12, ease: "power1.in" }, "try")
          .to(q("[data-try]"), { scale: 1, duration: 0.3, ease: "back.out(3)" })
          .to(q("[data-rendering]"), { autoAlpha: 1, duration: 0.2 }, "try+=0.15")
          .to(q("[data-beam]"), { autoAlpha: 1, duration: 0.1 }, "try+=0.2")
          .to(q("[data-beam]"), { top: "100%", duration: 1.2, ease: "sine.inOut" }, "try+=0.2")
          .to(q("[data-look-new]"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "sine.inOut" }, "try+=0.2")
          .to(q("[data-beam], [data-rendering]"), { autoAlpha: 0, duration: 0.2 }, "try+=1.4")
          .fromTo(q("[data-pin]"), { autoAlpha: 0, scale: 0.3 }, { autoAlpha: 1, scale: 1, duration: 0.35, stagger: 0.12, ease: "back.out(2.5)" }, "try+=1.45")
          .fromTo(q("[data-fit]"), { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35 }, "try+=1.6");

        // 05 · Yes, and it lands in the store's own cart.
        tl.addLabel("cart", "try+=2.3")
          .to(q("[data-add]"), { scale: 0.93, duration: 0.12, ease: "power1.in" }, "cart")
          .to(q("[data-add]"), { scale: 1, duration: 0.3, ease: "back.out(3)" })
          .fromTo(q("[data-cart-count]"), { scale: 1 }, { scale: 1.7, duration: 0.15, yoyo: true, repeat: 1 }, "cart+=0.1")
          .from(q("[data-toast]"), { yPercent: -130, autoAlpha: 0, duration: 0.6, ease: "expo.out" }, "cart+=0.2")
          .to({}, { duration: desktop ? 1 : 0 });

        if (!desktop) tl.timeScale(1.3);
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const added = step >= 4;

  return (
    <section ref={root} id="stylist" className="relative min-[1100px]:h-[420vh]">
      <div className="relative overflow-hidden px-[var(--gutter)] py-[var(--section-y)] min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:flex min-[1100px]:h-svh min-[1100px]:items-center min-[1100px]:py-0">
        <div
          aria-hidden
          className="stylist-ambient pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 60% at 75% 50%, color-mix(in oklab, var(--purple-900) 55%, transparent), transparent 75%), radial-gradient(35% 45% at 65% 30%, color-mix(in oklab, var(--wine-800) 60%, transparent), transparent 75%)",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 min-[1100px]:gap-14 min-[1100px]:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">{stylist.kicker}</p>
            <h2 className="mt-6 max-w-[12ch] font-display text-[clamp(2.6rem,5.4vw,5.6rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-bone">
              It only sells <span className="font-serif font-normal italic">what you stock.</span>
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-muted min-[1100px]:mt-8">{stylist.body}</p>

            <ol className="mt-8 max-w-md border-t border-hairline min-[1100px]:mt-10">
              {stylist.steps.map((label, index) => (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-5 border-b border-hairline py-3.5 transition-colors duration-500",
                    index <= step ? "text-bone" : "text-faint",
                  )}
                >
                  <span className={cn("font-mono text-[11px] transition-colors duration-500", index <= step ? "text-brand" : "text-faint")}>
                    0{index + 1}
                  </span>
                  <span className="flex-1 text-sm">{label}</span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-all duration-500",
                      index === step ? "bg-brand shadow-[0_0_12px_var(--brand)]" : index < step ? "bg-bone/50" : "bg-hairline",
                    )}
                  />
                </li>
              ))}
            </ol>
          </div>

          <div className="relative mx-auto w-full max-w-[680px] min-[1100px]:h-[86svh]">
            <div aria-hidden className="absolute inset-0 hidden min-[1100px]:block">
              {stylist.catalog.map((item, index) => (
                <div
                  key={item.id}
                  data-tile={item.match ? "hit" : "miss"}
                  data-id={item.id}
                  className={cn("absolute w-[7.5rem]", tilePositions[item.id])}
                >
                  <div className="animate-[float_6s_ease-in-out_infinite]" style={{ animationDelay: `${index * -0.9}s` }}>
                    <div data-tile-card className="overflow-hidden rounded-2xl border border-hairline bg-surface/90 p-1.5 backdrop-blur light:bg-white light:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)]">
                      <Crop item={item} className="aspect-[4/5] w-full rounded-xl" />
                      <div className="flex items-center justify-between px-1 pb-0.5 pt-2">
                        <span className="truncate text-[10px] text-bone">{item.name}</span>
                        <span className="ml-1 font-mono text-[10px] text-muted">${item.price}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <span
                data-scan
                className="invisible absolute inset-y-0 w-px -translate-x-1/2 bg-brand shadow-[0_0_24px_4px_rgba(247,109,1,0.6)]"
              />
              <span className="absolute left-1/2 top-2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                Your indexed catalog
              </span>
            </div>

            <div
              data-phone
              aria-hidden
              className="relative z-10 mx-auto w-[min(350px,88vw)] rounded-[46px] border border-hairline bg-[var(--surface-phone)] p-3 shadow-[0_60px_140px_-30px_rgba(107,53,141,0.5)] backdrop-blur-xl light:shadow-[0_30px_80px_-24px_rgba(14,12,19,0.18)] min-[1100px]:absolute min-[1100px]:left-1/2 min-[1100px]:top-1/2 min-[1100px]:-translate-x-1/2 min-[1100px]:-translate-y-1/2"
            >
              <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[36px] bg-surface px-3 pb-3 pt-3.5 min-[1100px]:h-[min(640px,76svh)]">
                <div className="flex shrink-0 items-center justify-between px-1 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,#6b358d,#400095)] text-white">
                      <Sparkle className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-none text-bone">Style Assistant</p>
                      <p className="mt-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" /> Your catalog only
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-bone">
                    Cart{" "}
                    <b data-cart-count className="inline-block text-brand">
                      {added ? bundle.length : 0}
                    </b>
                  </span>
                </div>

                <AvatarStage />

                <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden pt-3 text-[12.5px] [mask-image:linear-gradient(to_bottom,transparent_10px,black_36px)]">
                  <div data-bubble-ask className="shrink-0 overflow-hidden">
                    <p className="mb-2 ml-auto w-fit max-w-[84%] rounded-2xl rounded-br-md bg-[image:var(--grad-brand)] px-3.5 py-2 text-white">{stylist.ask}</p>
                  </div>

                  <div data-searching className="shrink-0 overflow-hidden">
                    <p className="mb-2 flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-hairline bg-[var(--surface-card)] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      <span className="flex gap-0.5">
                        {[0, 1, 2].map((dot) => (
                          <span key={dot} className="h-1 w-1 animate-pulse rounded-full bg-brand" style={{ animationDelay: `${dot * 0.2}s` }} />
                        ))}
                      </span>
                      Searching your catalog
                    </p>
                  </div>

                  <div data-bubble-answer className="shrink-0 overflow-hidden">
                    <p className="mb-2 w-fit max-w-[88%] rounded-2xl rounded-bl-md border border-hairline bg-[var(--surface-card)] px-3.5 py-2 text-bone">
                      {stylist.answer}
                    </p>
                  </div>

                  <div data-bundle className="shrink-0 overflow-hidden">
                    <div className="rounded-2xl border border-hairline bg-[var(--surface-card)] p-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {bundle.map((item) => (
                          <div key={item.id} data-card className="overflow-hidden rounded-xl border border-hairline bg-surface">
                            <div data-card-thumb={item.id} className="aspect-square bg-white">
                              <Crop item={item} className="h-full w-full" />
                            </div>
                            <div className="px-1.5 py-1.5">
                              <p className="truncate text-[10px] leading-tight text-bone">{item.name}</p>
                              <p className="mt-0.5 flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-brand">${item.price}</span>
                                <span className="font-mono text-[8.5px] text-faint">M</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2 px-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Budget</span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
                          <span data-budget-bar className="block h-full origin-left bg-[image:var(--grad-brand)]" />
                        </span>
                        <span className="font-mono text-[9.5px] text-bone">
                          <span ref={amount}>$0</span>
                          <span className="text-faint">/${stylist.budget}</span>
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <span
                          data-try
                          className="flex items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#6b358d,#400095)] py-2 text-[11px] font-semibold text-white"
                        >
                          <Sparkle className="h-3 w-3" />
                          {stylist.try}
                        </span>
                        <span
                          data-add
                          className={cn(
                            "grid place-items-center rounded-full py-2 text-[11px] font-semibold transition-colors duration-300",
                            added ? "bg-[image:var(--grad-brand)] text-white" : "bg-bone text-[var(--bg)]",
                          )}
                        >
                          {added ? "Added ✓" : `Add all · $${total}`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex shrink-0 items-center gap-2">
                  <div data-field className="relative h-10 min-w-0 flex-1 overflow-hidden rounded-full border border-hairline bg-[var(--surface-card)] px-4 text-[12px] leading-10">
                    <span data-placeholder className="absolute inset-y-0 left-4 truncate text-faint">
                      Ask about clothes, style, sizing…
                    </span>
                    <span data-typed className="absolute inset-y-0 left-4 right-3 flex items-center overflow-hidden whitespace-nowrap text-bone">
                      <span className="flex min-w-0 justify-end overflow-hidden">
                        <span className="whitespace-pre">
                          {stylist.ask.split("").map((char, index) => (
                            <span key={index} data-char>
                              {char}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="ml-px h-4 w-px shrink-0 animate-pulse bg-brand" />
                    </span>
                  </div>
                  <span data-send className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[image:var(--grad-brand)] text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className="h-4 w-4">
                      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>

                <div
                  data-toast
                  className="absolute inset-x-3 top-3 z-20 rounded-2xl border border-hairline bg-surface/95 p-3.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-md bg-[image:var(--grad-brand)] text-[10px] font-bold text-white">✓</span>
                    <p className="text-[12px] font-medium text-bone">Added to your store&apos;s cart</p>
                    <p className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-faint">now</p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {bundle.map((item) => (
                        <div key={item.id} className="h-8 w-8 overflow-hidden rounded-full ring-2 ring-surface">
                          <Crop item={item} className="h-full w-full" />
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-bone">
                      {bundle.length} items · <b>${total}</b>
                    </p>
                  </div>
                </div>
              </div>
              <p className="px-3 pb-1 pt-3 text-center text-[10px] text-faint">{stylist.note}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
