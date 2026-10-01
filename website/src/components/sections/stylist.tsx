"use client";

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
            setStep(t < 0.2 ? -1 : t < tl.labels.search ? 0 : t < tl.labels.build ? 1 : t < tl.labels.cart ? 2 : 3);
          },
        });

        tl.from(q("[data-char]"), { autoAlpha: 0, duration: 0.05, stagger: 0.035, ease: "none" }, 0.2)
          .from(q("[data-bubble-ask]"), { scale: 0.9, transformOrigin: "100% 100%", duration: 0.4 }, 0.2)
          .addLabel("search")
          .from(q("[data-searching]"), { autoAlpha: 0, y: 8, duration: 0.3 });

        if (desktop) {
          tl.fromTo(q("[data-scan]"), { left: "0%", autoAlpha: 1 }, { left: "100%", duration: 1.4, ease: "none" }, "search+=0.2")
            .to(q("[data-scan]"), { autoAlpha: 0, duration: 0.2 })
            .to(q("[data-tile='miss']"), { autoAlpha: 0.18, filter: "blur(3px) grayscale(1)", scale: 0.92, duration: 0.5, stagger: 0.12 }, "search+=0.4")
            .to(q("[data-tile='hit'] [data-tile-card]"), { boxShadow: "0 0 0 2px #f76d01, 0 0 40px -4px rgba(247,109,1,0.7)", duration: 0.4, stagger: 0.15 }, "search+=0.6");
        }

        tl.addLabel("build", desktop ? "search+=2" : "search+=0.5")
          .to(q("[data-searching]"), { autoAlpha: 0, height: 0, marginTop: 0, duration: 0.3 }, "build")
          .from(q("[data-bubble-answer]"), { autoAlpha: 0, y: 14, duration: 0.5 }, "build")
          .from(q("[data-bundle]"), { autoAlpha: 0, y: 14, duration: 0.4 }, "build+=0.15")
          .from(q("[data-row]"), { autoAlpha: 0, x: -16, duration: 0.5, stagger: 0.25 }, "build+=0.3");

        if (desktop) {
          q("[data-tile='hit']").forEach((tile, index) => {
            const id = tile.getAttribute("data-id");
            const target = q(`[data-row-thumb='${id}']`)[0];
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
              { x: () => delta("x"), y: () => delta("y"), scale: 0.4, duration: 0.7, ease: "power3.inOut" },
              `build+=${0.3 + index * 0.25}`,
            ).to(tile, { autoAlpha: 0, duration: 0.15 }, ">-0.1");
          });
        }

        tl.fromTo(
          budget,
          { value: 0 },
          {
            value: total,
            duration: 1,
            ease: "none",
            onUpdate: () => {
              if (amount.current) amount.current.textContent = `$${Math.round(budget.value)}`;
            },
          },
          "build+=0.4",
        )
          .fromTo(q("[data-budget-bar]"), { scaleX: 0 }, { scaleX: total / stylist.budget, duration: 1, ease: "none" }, "build+=0.4")
          .addLabel("cart", "build+=1.8")
          .to(q("[data-add]"), { scale: 0.94, duration: 0.12, ease: "power1.in" }, "cart")
          .to(q("[data-add]"), { scale: 1, duration: 0.3, ease: "back.out(3)" })
          .fromTo(q("[data-cart-count]"), { scale: 1 }, { scale: 1.7, duration: 0.15, yoyo: true, repeat: 1 }, "cart+=0.1")
          .from(q("[data-toast]"), { yPercent: -130, autoAlpha: 0, duration: 0.6, ease: "expo.out" }, "cart+=0.2")
          .to({}, { duration: desktop ? 1.2 : 0 });

        if (!desktop) tl.timeScale(1.4);
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const added = step >= 3;

  return (
    <section ref={root} id="stylist" className="relative min-[1100px]:h-[360vh]">
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

            <ol className="mt-8 max-w-md min-[1100px]:mt-12 border-t border-hairline">
              {stylist.steps.map((label, index) => (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-5 border-b border-hairline py-4 transition-colors duration-500",
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

          <div className="relative mx-auto w-full max-w-[680px] min-[1100px]:h-[82svh]">
            <div aria-hidden className="absolute inset-0 hidden min-[1100px]:block">
              {stylist.catalog.map((item, index) => (
                <div
                  key={item.id}
                  data-tile={item.match ? "hit" : "miss"}
                  data-id={item.id}
                  className={cn("absolute w-[7.5rem]", tilePositions[item.id])}
                >
                  <div className="animate-[float_6s_ease-in-out_infinite]" style={{ animationDelay: `${index * -0.9}s` }}>
                    <div data-tile-card className="overflow-hidden rounded-2xl border border-hairline bg-surface/90 light:bg-white light:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] p-1.5 backdrop-blur">
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
              className="relative z-10 mx-auto w-[min(350px,88vw)] rounded-[46px] border border-hairline bg-[var(--surface-phone)] p-3 shadow-[0_60px_140px_-30px_rgba(107,53,141,0.5)] light:shadow-[0_30px_80px_-24px_rgba(14,12,19,0.18)] backdrop-blur-xl min-[1100px]:absolute min-[1100px]:left-1/2 min-[1100px]:top-1/2 min-[1100px]:-translate-x-1/2 min-[1100px]:-translate-y-1/2"
            >
              <div className="relative flex min-h-[500px] min-[1100px]:min-h-[540px] flex-col overflow-hidden rounded-[36px] bg-surface px-4 pb-4 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[image:var(--grad-brand)] font-display text-xs font-bold text-white">
                      P
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-none text-bone">Stylist</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Your catalog only</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-bone">
                    Cart{" "}
                    <b data-cart-count className="inline-block text-brand">
                      {added ? bundle.length : 0}
                    </b>
                  </span>
                </div>

                <div className="mt-6 flex-1 space-y-2.5 text-[13px]">
                  <p
                    data-bubble-ask
                    className="ml-auto w-fit max-w-[84%] rounded-2xl rounded-br-md bg-bone px-4 py-2.5 text-[var(--bg)]"
                  >
                    {stylist.ask.split("").map((char, index) => (
                      <span key={index} data-char>
                        {char}
                      </span>
                    ))}
                  </p>

                  <p data-searching className="mt-2.5 flex items-center gap-2 overflow-hidden px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Searching your catalog
                  </p>

                  <p
                    data-bubble-answer
                    className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-hairline bg-[var(--surface-card)] px-4 py-2.5 text-bone"
                  >
                    {stylist.answer}
                  </p>

                  <div data-bundle className="rounded-2xl border border-hairline bg-[var(--surface-card)] p-2">
                    {bundle.map((item) => (
                      <div key={item.id} data-row className="flex items-center gap-3 rounded-xl p-1.5">
                        <div data-row-thumb={item.id} className="h-12 w-10 shrink-0 overflow-hidden rounded-lg">
                          <Crop item={item} className="h-full w-full" />
                        </div>
                        <span className="flex-1 text-[12px] text-bone">{item.name}</span>
                        <span className="font-mono text-[11px] text-muted">${item.price}</span>
                      </div>
                    ))}
                    <div className="mt-2 px-1.5 pb-1">
                      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                        <span className="text-faint">Budget</span>
                        <span className="text-bone">
                          <span ref={amount}>$0</span>
                          <span className="text-faint"> / ${stylist.budget}</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-hairline">
                        <span data-budget-bar className="block h-full origin-left bg-[image:var(--grad-brand)]" />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-add
                  tabIndex={-1}
                  className={cn(
                    "mt-4 w-full rounded-full py-3 text-sm font-semibold shadow-md transition-colors duration-300",
                    added ? "bg-[image:var(--grad-brand)] text-white" : "bg-bone text-[var(--bg)]",
                  )}
                >
                  {added ? "Added to your cart ✓" : `Add all to cart · $${total}`}
                </button>

                <div
                  data-toast
                  className="absolute inset-x-3 top-3 rounded-2xl border border-hairline bg-surface/95 p-3.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl"
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
