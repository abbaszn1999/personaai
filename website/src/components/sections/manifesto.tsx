"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { manifesto } from "@/lib/content";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export function Manifesto() {
  const root = useRef<HTMLElement>(null);
  const text = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const split = SplitText.create(text.current, { type: "words" });
      gsap.fromTo(
        split.words,
        { opacity: 0.12 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.1,
          scrollTrigger: { trigger: text.current, start: "top 78%", end: "bottom 42%", scrub: true },
        },
      );
      return () => split.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="px-[var(--gutter)] py-[var(--section-y)] min-[900px]:py-[22vh]">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand">Why it exists</p>
      <p
        ref={text}
        className="mt-8 max-w-[22ch] font-display text-[clamp(2rem,5.4vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-bone"
      >
        {manifesto}
      </p>
    </section>
  );
}
