"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { included, pricingHero, tiers } from "@/lib/pricing";
import { appPath } from "@/lib/site";
import { cn } from "@/lib/cn";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const journey = [
  { day: "Day 0", title: "Paste the tag", body: "Connect your store, brand the widget, go live." },
  { day: "Day 1 – 30", title: "Trial records sales", body: "Every attributed order lands in your ledger, unbilled." },
  { day: "Upgrade", title: "Units carry over", body: "Whatever you didn't use moves to Main." },
  { day: "Monthly", title: "Main, with rollover", body: "Unused units roll over up to 2× the include." },
];

export function PricingHero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const split = SplitText.create(q("[data-line]"), { type: "chars", mask: "chars" });
      gsap.set(split.masks, { paddingBottom: "0.14em", marginBottom: "-0.14em" });
      gsap.set(q(".reveal-pending"), { visibility: "visible" });

      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from(split.chars, { yPercent: 110, duration: 1.2, stagger: 0.02 })
        .from(q("[data-fade]"), { autoAlpha: 0, y: 20, duration: 1, stagger: 0.08 }, "-=0.9")
        .from(q("[data-plan]"), { autoAlpha: 0, y: 60, duration: 1.3, stagger: 0.12 }, "-=0.9");

      q("[data-price]").forEach((el) => {
        const to = Number(el.dataset.price);
        const state = { v: 0 };
        gsap.to(state, {
          v: to,
          duration: 1.8,
          delay: 0.6,
          ease: "expo.out",
          onUpdate: () => (el.textContent = Math.round(state.v).toLocaleString("en-US")),
        });
      });

      gsap.from(q("[data-step]"), {
        autoAlpha: 0,
        y: 30,
        duration: 1,
        ease: "expo.out",
        stagger: 0.12,
        scrollTrigger: { trigger: q("[data-journey]")[0], start: "top 85%" },
      });
      gsap.from(q("[data-journey-line]"), {
        scaleX: 0,
        ease: "none",
        scrollTrigger: { trigger: q("[data-journey]")[0], start: "top 85%", end: "bottom 60%", scrub: true },
      });

      return () => split.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative overflow-hidden px-[var(--gutter)] pb-[var(--section-y)] pt-28 min-[900px]:pt-[20vh]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[80vh]"
        style={{ background: "radial-gradient(50% 60% at 70% 20%, rgba(247,109,1,0.14), transparent 70%), radial-gradient(40% 50% at 15% 10%, rgba(107,53,141,0.16), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-[1400px]">
        <div className="flex flex-col gap-10 min-[1000px]:flex-row min-[1000px]:items-end min-[1000px]:justify-between">
          <div>
            <p data-fade className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">
              {pricingHero.kicker}
            </p>
            <h1 className="reveal-pending mt-7 font-display text-[clamp(3rem,7.4vw,8rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-bone">
              <span data-line className="block">{pricingHero.lineA}</span>
              <span data-line className="block font-serif font-normal italic tracking-[-0.03em] text-muted">
                {pricingHero.lineB}
              </span>
            </h1>
          </div>
          <p data-fade className="max-w-sm text-base leading-relaxed text-muted">
            {pricingHero.lede}
          </p>
        </div>

        <div className="mt-16 grid gap-4 min-[1000px]:grid-cols-2">
          {tiers.map((tier) => (
            <div key={tier.id} data-plan>
              <SpotlightCard
                className={cn(
                  "flex h-full flex-col rounded-[36px] p-9 min-[1000px]:p-11",
                  tier.featured ? "plan-featured" : "border border-hairline bg-surface/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted">{tier.name}</p>
                  {tier.featured ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
                      For live stores
                    </span>
                  ) : (
                    <span className="rounded-full border border-hairline px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                      Start here
                    </span>
                  )}
                </div>

                <div className="mt-10 flex items-end gap-3">
                  <p className="font-display text-[clamp(4rem,7vw,7rem)] font-semibold leading-[0.85] tracking-[-0.06em] text-bone">
                    <span className="sr-only">${tier.price.toLocaleString("en-US")}</span>
                    <span aria-hidden>
                      $<span data-price={tier.price} dangerouslySetInnerHTML={{ __html: tier.price.toLocaleString("en-US") }} />
                    </span>
                  </p>
                  <p className="pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{tier.cadence}</p>
                </div>
                <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">{tier.lead}</p>

                <div className="mt-10 grid grid-cols-3 gap-2">
                  {tier.units.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-hairline bg-[var(--surface-card)] p-3 min-[500px]:p-4">
                      <p className="whitespace-nowrap font-display text-base font-semibold tracking-[-0.03em] text-bone min-[500px]:text-2xl">{value}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{label}</p>
                    </div>
                  ))}
                </div>

                <ul className="mt-8 space-y-3">
                  {tier.extras.map((extra) => (
                    <li key={extra} className="flex gap-3 text-sm text-bone">
                      <span className="mt-2 h-px w-4 shrink-0 bg-brand" />
                      {extra}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-10">
                  <a
                    href={appPath("/sign-up")}
                    className={cn(
                      "auth-out inline-flex items-center gap-2 rounded-full px-7 py-4 text-sm font-semibold transition",
                      tier.featured ? "bg-[image:var(--grad-brand)] text-white hover:brightness-110" : "bg-bone text-[var(--bg)] hover:opacity-90",
                    )}
                  >
                    {tier.cta} →
                  </a>
                </div>
              </SpotlightCard>
            </div>
          ))}
        </div>

        <div data-fade className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-full border border-hairline px-6 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">In every plan</span>
          {included.map((item) => (
            <span key={item} className="flex items-center gap-2 text-[13px] text-bone">
              <span className="h-1 w-1 rounded-full bg-brand" />
              {item}
            </span>
          ))}
        </div>

        <div data-journey className="relative mt-16 min-[900px]:mt-[14vh]">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">How it runs</p>
          <div className="relative mt-10 grid gap-10 min-[900px]:grid-cols-4 min-[900px]:gap-6">
            <span aria-hidden className="absolute left-0 right-0 top-[7px] hidden h-px bg-hairline min-[900px]:block" />
            <span aria-hidden data-journey-line className="absolute left-0 right-0 top-[7px] hidden h-px origin-left bg-[image:var(--grad-brand)] min-[900px]:block" />
            {journey.map((step, index) => (
              <div key={step.day} data-step className="relative">
                <span className={cn("relative block h-[15px] w-[15px] rounded-full border-2 border-bg", index === 3 ? "bg-[image:var(--grad-brand)]" : "bg-bone")} />
                <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">{step.day}</p>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-[-0.03em] text-bone">{step.title}</h3>
                <p className="mt-2 max-w-[26ch] text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
