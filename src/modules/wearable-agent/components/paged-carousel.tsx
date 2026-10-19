"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Index of the item whose centre is closest to `viewCenter`; -1 when there are none. */
export function nearestIndex(centers: readonly number[], viewCenter: number): number {
  let best = -1;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const distance = Math.abs(center - viewCenter);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * The item a one-step arrow should bring into view. `direction` is physical (-1 = the item
 * to the left of the current one on screen, 1 = to the right), so the arrows stay correct in a
 * right-to-left layout, where the next item in reading order sits on the left. Null at the end.
 */
export function neighbourIndex(centers: readonly number[], current: number, direction: -1 | 1): number | null {
  if (current < 0 || current >= centers.length) return null;
  const here = centers[current];
  let best: number | null = null;
  centers.forEach((center, index) => {
    if (index === current) return;
    const ahead = direction === 1 ? center > here + 1 : center < here - 1;
    if (!ahead) return;
    if (best === null || Math.abs(center - here) < Math.abs(centers[best] - here)) best = index;
  });
  return best;
}

interface PagedCarouselProps {
  /** One element per page; each is laid out at the carousel's full width. */
  children: React.ReactNode[];
  /** Names the arrows for assistive tech: "products" -> "Previous products". */
  label: string;
  /** Vertical position of the arrows, so they sit on the card's picture rather than its buttons. */
  arrowTop?: string;
  className?: string;
}

/**
 * A swipeable row that shows one full card at a time and settles on the next card in whole —
 * never between two. The next card peeks in at the edge, which is what tells a thumb there is
 * more to swipe, and arrows on the picture step one card at a time for a tap. Used for the product
 * and bundle suggestions in the mobile chat.
 */
export function PagedCarousel({ children, label, arrowTop = "28%", className }: PagedCarouselProps) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [hasPrevious, setHasPrevious] = React.useState(false);
  const [hasNext, setHasNext] = React.useState(false);
  const pages = React.Children.toArray(children);

  const measure = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const centers = Array.from(el.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });
    const viewCenter = box.left + box.width / 2;
    return { centers, viewCenter, current: nearestIndex(centers, viewCenter) };
  }, []);

  const sync = React.useCallback(() => {
    const m = measure();
    if (!m) return;
    setHasPrevious(neighbourIndex(m.centers, m.current, -1) !== null);
    setHasNext(neighbourIndex(m.centers, m.current, 1) !== null);
  }, [measure]);

  React.useEffect(() => {
    // Measured on the next frame (and again whenever the box resizes) rather than synchronously
    // in the effect, once the pages have their final layout.
    const initial = window.requestAnimationFrame(sync);
    const el = scroller.current;
    if (!el) return () => window.cancelAnimationFrame(initial);
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(initial);
      observer.disconnect();
    };
  }, [sync, pages.length]);

  // One scroll event per frame is plenty to keep the arrows honest while swiping.
  const frame = React.useRef<number | null>(null);
  const onScroll = React.useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      sync();
    });
  }, [sync]);
  React.useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    []
  );

  const go = React.useCallback(
    (direction: -1 | 1) => {
      const el = scroller.current;
      const m = measure();
      if (!el || !m) return;
      const target = neighbourIndex(m.centers, m.current, direction);
      if (target === null) return;
      el.scrollBy({ left: m.centers[target] - m.viewCenter, behavior: "smooth" });
    },
    [measure]
  );

  const arrowClass =
    "absolute z-20 flex -translate-y-1/2 h-10 w-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)]/95 text-[var(--color-text-secondary)] shadow-[var(--shadow-md,0_4px_14px_rgba(0,0,0,0.18))] items-center justify-center active:scale-95 hover:text-[var(--color-brand)] hover:border-[var(--color-brand)] transition-colors";

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative flex w-full gap-2.5 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((page, index) => (
          <div
            // Pages are positional: a re-render never reorders them, only appends.
            key={index}
            className={cn("shrink-0 snap-start snap-always", pages.length > 1 ? "w-[86%]" : "w-full")}
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${pages.length}`}
          >
            {page}
          </div>
        ))}
      </div>

      {hasPrevious && (
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={`Previous ${label}`}
          className={cn(arrowClass, "left-1.5")}
          style={{ top: arrowTop }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={`Next ${label}`}
          className={cn(arrowClass, "right-1.5")}
          style={{ top: arrowTop }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
