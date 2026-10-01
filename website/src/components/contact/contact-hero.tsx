"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { ContactForm } from "@/components/contact/contact-form";
import { nextSteps } from "@/lib/contact";
import { appPath, site } from "@/lib/site";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const shortcuts = [
  { href: "/features", kicker: "Explore", title: "Every feature", body: "Avatar, try-on, live mirror, stylist, sizing, cart." },
  { href: "/pricing", kicker: "Compare", title: "Plans and units", body: "Trial, Main, top-ups and a GMV calculator." },
  { href: "/pricing#faq", kicker: "Read", title: "Pricing questions", body: "Attribution, rollover, live billing, payment." },
  { href: appPath("/dashboard"), kicker: "Customers", title: "Your dashboard", body: "Already on Persona? Your dashboard is here." },
];

export function ContactHero() {
  const root = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const split = SplitText.create(q("[data-line]"), { type: "chars", mask: "chars" });
      gsap.set(split.masks, { paddingBottom: "0.14em", marginBottom: "-0.14em" });
      gsap.set(q(".reveal-pending"), { visibility: "visible" });

      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from(split.chars, { yPercent: 110, duration: 1.2, stagger: 0.018 })
        .from(q("[data-fade]"), { autoAlpha: 0, y: 20, duration: 1, stagger: 0.08 }, "-=0.9")
        .from(q("[data-form]"), { autoAlpha: 0, y: 60, duration: 1.3 }, "-=1.1");

      gsap.fromTo(q("[data-shortcut]"), { autoAlpha: 0, y: 40 }, {
        autoAlpha: 1,
        y: 0,
        duration: 1,
        ease: "expo.out",
        stagger: 0.08,
        scrollTrigger: { trigger: q("[data-shortcuts]")[0], start: "top 85%" },
      });

      gsap.to(q("[data-orb]"), {
        x: "random(-40, 40)",
        y: "random(-30, 30)",
        duration: 6,
        ease: "sine.inOut",
        repeat: -1,
        repeatRefresh: true,
        yoyo: true,
      });

      return () => split.revert();
    },
    { scope: root },
  );

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(site.contactEmail);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section ref={root} className="relative overflow-hidden px-[var(--gutter)] pb-[var(--section-y)] pt-28 min-[900px]:pt-[18vh]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span data-orb className="absolute right-[8%] top-[12%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(247,109,1,0.22),transparent_65%)] blur-2xl" />
        <span data-orb className="absolute left-[-10%] top-[45%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(107,53,141,0.25),transparent_65%)] blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)", backgroundSize: "88px 88px", maskImage: "radial-gradient(70% 60% at 30% 30%, #000, transparent)" }}
        />
      </div>

      <div className="relative mx-auto grid max-w-[1400px] gap-10 min-[1100px]:gap-14 min-[1100px]:grid-cols-[0.95fr_1.05fr] min-[1100px]:grid-rows-[auto_1fr] min-[1100px]:gap-x-20">
        <div>
          <p data-fade className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">
            Contact
          </p>
          <h1 className="reveal-pending mt-7 font-display text-[clamp(3rem,6.2vw,7rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-bone">
            <span data-line className="block">Let&apos;s dress</span>
            <span data-line className="block">your store.</span>
            <span data-line className="block font-serif font-normal italic tracking-[-0.03em] text-muted">
              Say hello.
            </span>
          </h1>
          <p data-fade className="mt-8 max-w-md text-base leading-relaxed text-muted">
            A demo on your own catalog, a pricing question, or help with the integration. Tell us what you need.
          </p>

          <div data-fade className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${site.contactEmail}`}
              className="group flex items-center gap-4 rounded-full border border-hairline bg-surface/50 py-2 pl-2 pr-6 backdrop-blur transition hover:border-bone/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-bone text-[var(--bg)] font-semibold">@</span>
              <span>
                <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-faint">Email</span>
                <span className="block text-sm text-bone">{site.contactEmail}</span>
              </span>
            </a>
            <button
              type="button"
              onClick={copyEmail}
              className="rounded-full border border-hairline px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition hover:text-bone"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        <div data-form className="min-[1100px]:col-start-2 min-[1100px]:row-span-2 min-[1100px]:row-start-1">
          <ContactForm />
        </div>

        <ol className="grid gap-5 self-end border-t border-hairline pt-8 min-[1100px]:pt-10 min-[700px]:grid-cols-3 min-[1100px]:col-start-1 min-[1100px]:row-start-2">
          {nextSteps.map((step) => (
            <li key={step.n} data-fade>
              <span className="font-mono text-xs text-brand">{step.n}</span>
              <h3 className="mt-3 font-display text-lg font-semibold tracking-[-0.02em] text-bone">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div data-shortcuts className="relative mx-auto mt-16 min-[900px]:mt-[14vh] max-w-[1400px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Before you write</p>
        <div className="mt-8 grid gap-4 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-4">
          {shortcuts.map((item) => {
            const external = item.href.startsWith("http");
            const Tag = external ? "a" : Link;
            return (
              <Tag
                key={item.title}
                href={item.href}
                data-shortcut
                className="group relative flex min-h-56 flex-col justify-between overflow-hidden rounded-[28px] border border-hairline bg-surface p-6 transition duration-500 hover:-translate-y-1 hover:border-white/20"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: "radial-gradient(70% 60% at 100% 0%, rgba(247,109,1,0.14), transparent 70%)" }} />
                <span className="relative flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">{item.kicker}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-bone transition duration-500 group-hover:rotate-[-45deg] group-hover:border-brand group-hover:bg-brand group-hover:text-white">
                    →
                  </span>
                </span>
                <span className="relative">
                  <span className="block font-display text-2xl font-semibold tracking-[-0.03em] text-bone">{item.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-muted">{item.body}</span>
                </span>
              </Tag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
