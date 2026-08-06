"use client";

import * as React from "react";
import type { PreviewViewportMode } from "@/modules/wearable-agent/components/preview-viewport-toggle";

/** Below this rendered width (px), a real embed switches to its mobile layout. Matches
 *  Tailwind's `md` breakpoint so it lines up with how the rest of the app reasons about
 *  "mobile" vs "desktop". */
const MOBILE_BREAKPOINT_PX = 768;

/**
 * Detects "mobile" vs "desktop" for a *real* embed (widget.js / `/embed/[token]`) by measuring
 * the widget's own rendered width via `ResizeObserver`, not `window.innerWidth`. This matters
 * because a merchant can place the widget in a narrow `data-target` container on an otherwise
 * wide desktop browser (or vice versa) — the widget's own box is the thing that actually needs
 * to fit the mobile layout, not the browser window.
 *
 * Returns a *callback ref* rather than a plain `useRef` object on purpose: both call sites
 * mount the ref-bearing element conditionally (only once branding finishes loading — a
 * "loading" spinner renders first, with no such element at all). A plain ref never re-runs an
 * effect when it's attached later, so an empty-deps `useEffect` reading `ref.current` would see
 * `null` once, bail out, and then never measure anything — `mode` would stay stuck at its
 * `"desktop"` default forever. A callback ref fires (and its effect re-runs, since it's a state
 * value) exactly when the real element mounts, however late that happens.
 *
 * Starts at `"desktop"` until the element mounts and the first measurement lands — mirrors
 * other client-only detection hooks in this app that can't know the real answer up front.
 */
export function useResponsiveViewportMode<T extends HTMLElement>(): [(el: T | null) => void, PreviewViewportMode] {
  const [node, setNode] = React.useState<T | null>(null);
  const [mode, setMode] = React.useState<PreviewViewportMode>("desktop");

  const ref = React.useCallback((el: T | null) => setNode(el), []);

  React.useEffect(() => {
    if (!node) return;

    const applyWidth = (width: number) => {
      setMode(width < MOBILE_BREAKPOINT_PX ? "mobile" : "desktop");
    };

    applyWidth(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) applyWidth(entry.contentRect.width);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [node]);

  return [ref, mode];
}
