"use client";

import * as React from "react";

export interface AnchoredPanelRect {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  available: number;
  themeClass: string;
}

/** Positions shared dropdown panels outside overflow-clipped tables and modals. */
export function useAnchoredPanel(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  estimatedHeight = 200
): AnchoredPanelRect | null {
  const [rect, setRect] = React.useState<AnchoredPanelRect | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;

    function measure() {
      const element = ref.current;
      if (!element) return;
      const box = element.getBoundingClientRect();
      const below = window.innerHeight - box.bottom - 6;
      const above = box.top - 6;
      const flip = below < estimatedHeight && above > below;
      setRect({
        ...(flip ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }),
        left: box.left,
        width: box.width,
        available: Math.max(120, flip ? above : below),
        themeClass: document.documentElement.className,
      });
    }

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [estimatedHeight, open, ref]);

  return rect;
}
