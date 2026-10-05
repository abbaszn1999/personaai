"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/cn";
import { snippet, steps } from "@/lib/content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const storeUrl = "atelier-north.myshopify.com";
const scriptLine = `<script src="…/widget.js?w=…" async></script>`;
const swatches = ["#f76d01", "#c40000", "#6b358d"];
const backdrops = ["/media/look-1.webp", "/media/look-2.webp", "/media/look-3.webp"];
const thumbs: Array<[string, string, string]> = [
  ["/media/look-2.webp", "50% 30%", "300%"],
  ["/media/look-3.webp", "50% 36%", "260%"],
  ["/media/look-4.webp", "50% 32%", "280%"],
  ["/media/look-1.webp", "50% 30%", "300%"],
  ["/media/look-2.webp", "50% 24%", "620%"],
  ["/media/look-4.webp", "50% 72%", "300%"],
  ["/media/look-3.webp", "50% 20%", "520%"],
  ["/media/look-2.webp", "50% 92%", "300%"],
];
const categories = ["Suits", "Shirts", "Knitwear", "Shoes", "Outerwear"];

function Chars({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split("").map((char, index) => (
        <span key={index} data-c>
          {char}
        </span>
      ))}
    </span>
  );
}

function Window({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)]", className)}>
      <div className="flex items-center gap-1.5 border-b border-hairline px-3.5 py-2.5">
        <span className="h-2 w-2 rounded-full bg-hairline" />
        <span className="h-2 w-2 rounded-full bg-hairline" />
        <span className="h-2 w-2 rounded-full bg-hairline" />
        <span className="ml-3 font-mono text-[10px] tracking-[0.08em] text-faint">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ConnectVisual() {
  return (
    <Window title="Persona · Connect store">
      <div className="space-y-3 p-4">
        <div className="relative grid grid-cols-2 rounded-xl bg-[var(--surface-well)] p-1 text-center text-[12px]">
          <span className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-surface shadow-xs" />
          <span className="relative py-1.5 font-medium text-bone">Shopify</span>
          <span className="relative py-1.5 text-faint">WooCommerce</span>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Store URL</p>
          <div className="mt-1.5 flex h-9 items-center rounded-lg border border-hairline bg-[var(--surface-input)] px-3 font-mono text-[12px] text-bone">
            <Chars text={storeUrl} />
            <span data-caret className="ml-px h-4 w-px animate-pulse bg-brand" />
          </div>
        </div>
        <div className="relative h-9 overflow-hidden rounded-lg text-[12px] font-semibold">
          <span data-btn-idle className="absolute inset-0 grid place-items-center bg-bone text-[var(--bg)] shadow-xs">
            Connect · read-only
          </span>
          <span data-btn-done className="absolute inset-0 grid place-items-center bg-[image:var(--grad-brand)] text-white opacity-0 shadow-xs">
            ✓ Connected · read-only
          </span>
        </div>
        <div data-index className="rounded-xl border border-hairline bg-[var(--surface-well)] p-3">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-muted">Indexing catalog</span>
            <span className="text-bone">
              <span data-count>0</span> products
            </span>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-hairline">
            <span data-bar className="block h-full origin-left scale-x-0 bg-[image:var(--grad-brand)]" />
          </div>
          <div className="mt-3 grid grid-cols-8 gap-1.5">
            {thumbs.map(([src, pos, size], index) => (
              <span
                key={index}
                data-thumb
                className="aspect-[3/4] rounded-md bg-cover bg-no-repeat opacity-0"
                style={{ backgroundImage: `url(${src})`, backgroundPosition: pos, backgroundSize: size }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">Mapped</span>
            {categories.map((name) => (
              <span
                key={name}
                data-cat
                className="rounded-full border border-hairline bg-surface px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted opacity-0"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

function BrandVisual() {
  return (
    <div
      data-brand
      className="grid gap-3 min-[560px]:grid-cols-[1fr_1.05fr]"
      style={{ ["--accent" as string]: swatches[0], ["--r" as string]: "26px" }}
    >
      <Window title="Branding">
        <div className="space-y-4 p-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Brand color</p>
            <div className="relative mt-2 flex gap-2.5">
              {swatches.map((color) => (
                <span key={color} className="h-8 w-8 shrink-0 rounded-full" style={{ background: color }} />
              ))}
              <span data-ring className="pointer-events-none absolute -left-1 -top-1 h-10 w-10 rounded-full border-2 border-bone" />
            </div>
          </div>
          <div>
            <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              <span>Corner radius</span>
              <span data-radius-label className="text-bone">26px</span>
            </div>
            <div className="relative mt-3 h-1 rounded-full bg-hairline">
              <span data-knob className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone shadow-xs" style={{ left: "85%" }} />
            </div>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Backdrop</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {backdrops.map((src, index) => (
                <span key={src} className="relative aspect-[3/4] overflow-hidden rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <span data-pick={index} className={cn("absolute inset-0 rounded-md ring-2 ring-inset ring-[var(--accent)]", index > 0 && "opacity-0")} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </Window>

      <div className="relative overflow-hidden border border-hairline bg-surface p-2.5" style={{ borderRadius: "var(--r)" }}>
        <div className="relative h-full min-h-[15rem] overflow-hidden" style={{ borderRadius: "calc(var(--r) - 8px)" }}>
          {backdrops.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} data-bg={index} src={src} alt="" className={cn("absolute inset-0 h-full w-full object-cover object-[50%_12%]", index > 0 && "opacity-0")} />
          ))}
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3">
            <span className="grid h-6 w-6 place-items-center rounded-full font-display text-[10px] font-bold text-black" style={{ background: "var(--accent)" }}>
              A
            </span>
            <span className="text-[11px] font-medium text-white">Atelier North</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10">
            <p className="min-h-[1.4em] text-[11px] leading-snug text-white/85">
              <Chars text="Welcome in. Try anything on." />
            </p>
            <span
              className="mt-2 block py-2 text-center text-[11px] font-semibold text-white"
              style={{ background: "var(--accent)", borderRadius: "calc(var(--r) - 12px)" }}
            >
              Try it on
            </span>
          </div>
        </div>
        <span className="absolute right-4 top-3.5 hidden rounded-full sm:block bg-black/60 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-white/70 backdrop-blur">
          Live preview
        </span>
      </div>
    </div>
  );
}

function PasteVisual() {
  const before = ["<head>", "  {{ content_for_header }}", "</head>", "<body>", "  {{ content_for_layout }}"];
  return (
    <Window title="theme.liquid">
      <div className="py-3 font-mono text-[11px] leading-6">
        {before.map((line, index) => (
          <div key={index} className="flex px-3 text-faint">
            <span className="w-7 shrink-0 text-right opacity-40">{index + 1}</span>
            <span className="ml-4 whitespace-pre">{line}</span>
          </div>
        ))}
        <div data-line className="relative flex px-3 text-bone">
          <span data-line-bg className="absolute inset-0 border-l-2 border-brand bg-brand/10 opacity-0" />
          <span className="relative w-7 shrink-0 text-right text-brand">6</span>
          <span className="relative ml-4 whitespace-pre">
            {"  "}
            <Chars text={scriptLine} />
          </span>
        </div>
        <div className="flex px-3 text-faint">
          <span className="w-7 shrink-0 text-right opacity-40">7</span>
          <span className="ml-4">&lt;/body&gt;</span>
        </div>
      </div>
      <div className="relative border-t border-hairline bg-[var(--surface-well)] p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-mono text-[9px] text-muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className="h-2.5 w-2.5">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            atelier-north.com
          </span>
          <span data-live className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-brand opacity-0">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand shadow-[0_0_10px_var(--brand)]" /> Widget live
          </span>
        </div>
        <div data-store className="mt-2.5 grid grid-cols-4 gap-1.5 opacity-50 grayscale">
          {thumbs.slice(0, 4).map(([src, pos, size], index) => (
            <span key={index} className="block">
              <span
                className="block aspect-[4/5] rounded-md bg-cover bg-no-repeat"
                style={{ backgroundImage: `url(${src})`, backgroundPosition: pos, backgroundSize: size }}
              />
              <span className="mt-1 block h-1 w-3/4 rounded-full bg-hairline" />
            </span>
          ))}
        </div>
        <span
          data-launcher
          className="absolute bottom-5 right-5 inline-flex scale-0 items-center gap-1.5 rounded-full bg-[image:var(--grad-brand)] px-3.5 py-2 text-[11px] font-semibold text-white shadow-[0_10px_30px_-5px_rgba(247,109,1,0.75)]"
        >
          ✦ Try it on
        </span>
      </div>
    </Window>
  );
}

const visuals = { "01": ConnectVisual, "02": BrandVisual, "03": PasteVisual } as const;

function animateCard(card: HTMLElement, scrollTrigger: ScrollTrigger.Vars) {
  const q = gsap.utils.selector(card);
  const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger });
  const kind = card.dataset.step;

  tl.from(q("[data-reveal]"), { autoAlpha: 0, y: 18, duration: 0.25, stagger: 0.06, ease: "power2.out" }, 0);

  if (kind === "01") {
    tl.from(q("[data-c]"), { autoAlpha: 0, stagger: 0.04, duration: 0.01 })
      .to(q("[data-caret]"), { autoAlpha: 0, duration: 0.1 })
      .to(q("[data-btn-done]"), { opacity: 1, duration: 0.2 }, "+=0.1")
      .to(q("[data-bar]"), { scaleX: 1, duration: 1.2 }, "+=0.1")
      .fromTo(
        q("[data-count]"),
        { textContent: 0 },
        {
          textContent: 1284,
          duration: 1.2,
          modifiers: { textContent: (value: string) => Math.round(Number(value)).toLocaleString("en-US") },
        },
        "<",
      )
      .to(q("[data-thumb]"), { opacity: 1, duration: 0.12, stagger: 0.13 }, "<")
      .to(q("[data-cat]"), { opacity: 1, duration: 0.1, stagger: 0.12 }, ">-0.3");
  }

  if (kind === "02") {
    const brand = q("[data-brand]")[0];
    const label = q("[data-radius-label]")[0];
    const radius = { v: 26 };
    const setRadius = () => {
      brand?.style.setProperty("--r", `${radius.v.toFixed(1)}px`);
      if (label) label.textContent = `${Math.round(radius.v)}px`;
    };
    tl.from(q("[data-c]"), { autoAlpha: 0, stagger: 0.025, duration: 0.01 });
    [1, 2].forEach((i) => {
      const r = i === 1 ? 10 : 20;
      tl.to(q("[data-ring]"), { x: i * 42, duration: 0.4, ease: "power2.inOut" })
        .to(brand, { "--accent": swatches[i], duration: 0.4 }, "<")
        .to(q("[data-knob]"), { left: `${((r - 4) / 26) * 100}%`, duration: 0.5, ease: "power2.inOut" }, ">")
        .to(radius, { v: r, duration: 0.5, ease: "power2.inOut", onUpdate: setRadius }, "<")
        .to(q(`[data-bg='${i}']`), { opacity: 1, duration: 0.4 }, ">-0.1")
        .to(q(`[data-pick='${i - 1}']`), { opacity: 0, duration: 0.2 }, "<")
        .to(q(`[data-pick='${i}']`), { opacity: 1, duration: 0.2 }, "<")
        .to({}, { duration: 0.3 });
    });
  }

  if (kind === "03") {
    tl.to(q("[data-line-bg]"), { opacity: 1, duration: 0.15 })
      .from(q("[data-c]"), { autoAlpha: 0, stagger: 0.03, duration: 0.01 })
      .to(q("[data-live]"), { opacity: 1, duration: 0.2 }, "+=0.1")
      .to(q("[data-store]"), { opacity: 1, filter: "grayscale(0)", duration: 0.3 }, "<")
      .to(q("[data-launcher]"), { scale: 1, duration: 0.35, ease: "back.out(2.5)" });
  }
}

export function GoLive() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState(-1);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const cards = q("[data-step]") as HTMLElement[];
      const mm = gsap.matchMedia();

      mm.add("(min-width: 900px)", () => {
        const distance = () => (track.current ? track.current.scrollWidth - window.innerWidth : 0);
        const scroller = gsap.to(track.current, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => `+=${distance() * 1.3}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
        cards.forEach((card, index) =>
          animateCard(card, {
            ...(index === 0
              ? { trigger: root.current, start: "top 55%", end: "top -35%" }
              : { trigger: card, containerAnimation: scroller, start: "left 80%", end: "center 62%" }),
            scrub: 0.6,
            onEnter: () => setActive(index),
            onLeaveBack: () => setActive(index - 1),
          }),
        );
      });

      mm.add("(max-width: 899px)", () => {
        cards.forEach((card) => animateCard(card, { trigger: card, start: "top 75%", end: "bottom 60%", scrub: 0.6 }));
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section ref={root} id="go-live" className="relative overflow-hidden min-[900px]:h-svh">
      <div
        ref={track}
        className="flex flex-col gap-4 px-[var(--gutter)] py-[var(--section-y)] min-[900px]:h-full min-[900px]:w-max min-[900px]:flex-row min-[900px]:items-stretch min-[900px]:gap-6 min-[900px]:py-[9vh]"
      >
        <div className="flex shrink-0 flex-col justify-end min-[900px]:w-[36vw] min-[900px]:pr-[4vw]">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Go live</p>
          <h2 className="mt-6 font-display text-[clamp(2.8rem,7vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.055em] text-bone">
            Three steps.
            <span className="block font-serif font-normal italic text-muted">One tag.</span>
          </h2>
          <p className="mt-8 max-w-sm text-sm leading-relaxed text-muted">
            From an empty store to a live fitting room without a developer. Keep scrolling and watch it happen.
          </p>
          <ol className="mt-10 hidden max-w-sm border-t border-hairline min-[900px]:block">
            {steps.map((step, index) => (
              <li key={step.n} className="flex items-center gap-4 border-b border-hairline py-3">
                <span className={cn("font-mono text-[11px] transition-colors duration-500", index <= active ? "text-brand" : "text-faint")}>
                  {step.n}
                </span>
                <span className={cn("text-sm transition-colors duration-500", index <= active ? "text-bone" : "text-faint")}>
                  {step.title} <span className="font-serif italic">{step.accent}</span>
                </span>
                <span className="relative ml-auto h-px w-14 overflow-hidden bg-hairline">
                  <span
                    className="absolute inset-0 origin-left bg-brand transition-transform duration-700 ease-[var(--ease-expo)]"
                    style={{ transform: `scaleX(${index <= active ? 1 : 0})` }}
                  />
                </span>
              </li>
            ))}
          </ol>
        </div>

        {steps.map((step) => {
          const Visual = visuals[step.n];
          return (
            <article
              key={step.n}
              data-step={step.n}
              className="relative flex shrink-0 flex-col overflow-hidden rounded-[32px] border border-hairline bg-surface p-7 min-[900px]:w-[min(40vw,560px)]"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ background: "radial-gradient(80% 50% at 50% 0%, rgba(247,109,1,0.07), transparent 70%)" }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -top-5 right-4 select-none font-display text-[9rem] font-semibold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_var(--hairline-strong)]"
              >
                {step.n}
              </span>
              <div className="relative flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
                <span className="text-brand">Step {step.n}</span>
                <span className="text-faint">/ 0{steps.length} · {step.label}</span>
              </div>
              <div className="relative my-6 flex flex-1 flex-col justify-center">
                <Visual />
              </div>
              <div className="relative">
                <h3 className="font-display text-[clamp(2rem,2.7vw,2.75rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-bone">
                  <span data-reveal className="inline-block">{step.title}</span>{" "}
                  <span data-reveal className="inline-block font-serif font-normal italic tracking-[-0.02em] text-muted">
                    {step.accent}
                  </span>
                </h3>
                <p data-reveal className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                  {step.body}
                </p>
                <dl className="mt-5 grid grid-cols-3 border-t border-hairline">
                  {step.facts.map(([label, value]) => (
                    <div key={label} data-reveal className="border-r border-hairline pr-3 pt-3.5 last:border-r-0 [&:not(:first-child)]:pl-4">
                      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{label}</dt>
                      <dd className="mt-1 text-[12.5px] leading-snug text-bone">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          );
        })}

        <div className="relative flex shrink-0 flex-col justify-between overflow-hidden rounded-[32px] bg-[image:var(--grad-brand)] p-8 text-white min-[900px]:w-[min(38vw,520px)] shadow-xl">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/90">The whole integration</p>
            <code className="mt-6 block break-all rounded-2xl bg-black/85 p-5 font-mono text-[13px] leading-relaxed text-white ring-1 ring-white/10">
              {snippet}
            </code>
            <button
              type="button"
              onClick={copy}
              className="mt-4 w-fit rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 shadow-md"
            >
              {copied ? "Copied ✓" : "Copy the tag"}
            </button>
          </div>
          <ul className="mt-10 divide-y divide-white/20 border-y border-white/20 text-sm">
            {[
              ["Token in the URL", "The only credential"],
              ["Kill switch", "Every snippet off at once"],
              ["Regenerate token", "Issue a fresh one anytime"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-center justify-between py-3.5">
                <span className="font-semibold text-white">{k}</span>
                <span className="text-white/80">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
