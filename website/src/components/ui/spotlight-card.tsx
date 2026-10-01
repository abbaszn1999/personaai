"use client";

import type { PointerEvent, ReactNode } from "react";

export function SpotlightCard({ className, children }: { className?: string; children: ReactNode }) {
  function move(event: PointerEvent<HTMLElement>) {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
    el.style.setProperty("--spot", "1");
  }

  return (
    <article
      className={className}
      onPointerMove={move}
      onPointerLeave={(event) => event.currentTarget.style.setProperty("--spot", "0")}
    >
      {children}
    </article>
  );
}
