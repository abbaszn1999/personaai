"use client";

import * as React from "react";

export type SheetSnap = "peek" | "half" | "full";

/** `peek` is measured from the header row instead of a fraction, so the collapsed sheet is
 *  exactly as tall as its own content on any device rather than a magic 72px. */
const SNAP_FRACTION: Record<Exclude<SheetSnap, "peek">, number> = { half: 0.56, full: 0.92 };

const ORDERED_SNAPS: readonly SheetSnap[] = ["peek", "half", "full"];

/** Below this, a viewport shrink is the browser's own collapsing toolbar, not a keyboard. */
const KEYBOARD_MIN_INSET = 120;

/** A pointer that moved less than this is a tap on the header, not a drag of the sheet. */
const DRAG_SLOP = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Drag-and-snap bottom sheet for the mobile try-on layout.
 *
 * The sheet's height is published as a `--sheet-h` custom property on the root element rather
 * than kept only in React state. Everything layered over the avatar — the mode toggle, the
 * style swatches, the cart pill, the inline panels — positions itself against that variable,
 * so the free space above the sheet is the single source of truth for what is reachable. That
 * is what stops controls from being stranded under an expanded sheet, and writing a custom
 * property lets a drag repaint at pointer rate without re-rendering the message list on every
 * frame.
 */
export function useBottomSheet(peekFallback = 72) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);

  const [snap, setSnap] = React.useState<SheetSnap>("peek");
  const [containerHeight, setContainerHeight] = React.useState(0);
  const [peekHeight, setPeekHeight] = React.useState(peekFallback);
  const [isDragging, setIsDragging] = React.useState(false);
  const [keyboardInset, setKeyboardInset] = React.useState(0);

  const heightFor = React.useCallback(
    (target: SheetSnap) => {
      if (target === "peek" || containerHeight === 0) return peekHeight;
      return Math.round(containerHeight * SNAP_FRACTION[target]);
    },
    [containerHeight, peekHeight]
  );

  const publish = React.useCallback((height: number) => {
    rootRef.current?.style.setProperty("--sheet-h", `${height}px`);
  }, []);

  // ── Measurement ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // Border box, not contentRect — collapsed padding (the gap that keeps the launcher
      // from sitting flush on the screen edge) has to count, or extra pb just gets clipped
      // by `--sheet-h`. Round up so a fractional height can't leave a hairline of the
      // sheet's own background showing through.
      setPeekHeight(Math.ceil(el.offsetHeight));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── On-screen keyboard ───────────────────────────────────────────────────
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardInset(hidden > KEYBOARD_MIN_INSET ? Math.round(hidden) : 0);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  // Keep the published height in sync with whatever the current snap resolves to — including
  // after a rotation or a host-page resize changes `containerHeight`.
  React.useEffect(() => {
    if (isDragging) return;
    publish(heightFor(snap));
  }, [snap, heightFor, isDragging, publish]);

  // ── Drag ─────────────────────────────────────────────────────────────────
  const drag = React.useRef({ startY: 0, startHeight: 0, moved: false });

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      drag.current = { startY: e.clientY, startHeight: heightFor(snap), moved: false };
      setIsDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [heightFor, snap]
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging) return;
      const delta = drag.current.startY - e.clientY;
      if (Math.abs(delta) > DRAG_SLOP) drag.current.moved = true;
      publish(clamp(drag.current.startHeight + delta, peekHeight, heightFor("full")));
    },
    [isDragging, publish, peekHeight, heightFor]
  );

  const onPointerUp = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      const released = clamp(
        drag.current.startHeight + (drag.current.startY - e.clientY),
        peekHeight,
        heightFor("full")
      );
      const nearest = ORDERED_SNAPS.reduce((best, candidate) =>
        Math.abs(heightFor(candidate) - released) < Math.abs(heightFor(best) - released) ? candidate : best
      );
      setSnap(nearest);
      // `setSnap` is a no-op when the sheet snapped back to where it started, and the sync
      // effect would then never run to undo the in-progress drag height.
      publish(heightFor(nearest));
    },
    [isDragging, peekHeight, heightFor, publish]
  );

  /** True when the gesture that just ended was a real drag, so the header's tap-to-toggle
   *  doesn't also fire and immediately undo the snap the shopper chose. */
  const consumedDrag = React.useCallback(() => drag.current.moved, []);

  const toggle = React.useCallback(() => {
    setSnap((current) => (current === "peek" ? "half" : "peek"));
  }, []);

  return {
    rootRef,
    headerRef,
    snap,
    setSnap,
    toggle,
    isDragging,
    consumedDrag,
    keyboardInset,
    expanded: snap !== "peek",
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
