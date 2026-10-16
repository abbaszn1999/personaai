"use client";

import * as React from "react";

export type SheetSnap = "peek" | "half" | "tall" | "full";

/** `peek` is measured from the header row instead of a fraction, so the collapsed sheet is
 *  exactly as tall as its own content on any device rather than a magic 72px.
 *
 *  `tall` is where the sheet grows to when there is something to look at (a product or bundle
 *  card): high enough for a whole card and the reply above it, low enough that the avatar is
 *  still visible. `full` is reserved for typing, where the keyboard needs the room. */
export const SNAP_FRACTION: Record<Exclude<SheetSnap, "peek">, number> = { half: 0.56, tall: 0.82, full: 0.92 };

export const ORDERED_SNAPS: readonly SheetSnap[] = ["peek", "half", "tall", "full"];

/** Below this, a viewport shrink is the browser's own collapsing toolbar, not a keyboard. */
const KEYBOARD_MIN_INSET = 120;

/** A pointer that moved less than this is a tap on the header, not a drag of the sheet. */
export const DRAG_SLOP = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The snap a sheet should be at to show `target`, never lower than where it already is and
 *  never opened from collapsed: a shopper who closed the sheet to look at the avatar keeps it
 *  closed, whatever arrives. */
export function raiseSnap(current: SheetSnap, target: SheetSnap): SheetSnap {
  if (current === "peek") return current;
  return ORDERED_SNAPS.indexOf(current) >= ORDERED_SNAPS.indexOf(target) ? current : target;
}

/** The snap a drag released at `released` px settles on. */
export function nearestSnap(released: number, heightFor: (snap: SheetSnap) => number): SheetSnap {
  return ORDERED_SNAPS.reduce((best, candidate) =>
    Math.abs(heightFor(candidate) - released) < Math.abs(heightFor(best) - released) ? candidate : best
  );
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
 *
 * A press is not a drag until the pointer has moved past `DRAG_SLOP`. Starting the drag (and
 * the pointer capture and re-render that come with it) on pointer down used to swap the
 * collapsed launcher out from under the finger, so the tap that was meant to open the chat
 * never reached its button and only a swipe could open it.
 */
export function useBottomSheet(peekFallback = 72, initialSnap: SheetSnap = "peek") {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);

  const [snap, setSnap] = React.useState<SheetSnap>(initialSnap);
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
  const drag = React.useRef({ startY: 0, startHeight: 0, moved: false, active: false });

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Mouse: primary button only. Touch and pen always report button 0.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { startY: e.clientY, startHeight: heightFor(snap), moved: false, active: true };
    },
    [heightFor, snap]
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = drag.current;
      if (!state.active) return;
      const delta = state.startY - e.clientY;
      if (!state.moved) {
        if (Math.abs(delta) <= DRAG_SLOP) return;
        state.moved = true;
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the release below still settles the sheet.
        }
      }
      publish(clamp(state.startHeight + delta, peekHeight, heightFor("full")));
    },
    [publish, peekHeight, heightFor]
  );

  const onPointerUp = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = drag.current;
      if (!state.active) return;
      state.active = false;
      // A press that never moved is a tap: the button under it handles it through `onClick`.
      if (!state.moved) return;
      setIsDragging(false);
      const released = clamp(state.startHeight + (state.startY - e.clientY), peekHeight, heightFor("full"));
      const nearest = nearestSnap(released, heightFor);
      setSnap(nearest);
      // `setSnap` is a no-op when the sheet snapped back to where it started, and the sync
      // effect would then never run to undo the in-progress drag height.
      publish(heightFor(nearest));
    },
    [peekHeight, heightFor, publish]
  );

  /** True when the gesture that just ended was a real drag, so the header's tap-to-toggle
   *  doesn't also fire and immediately undo the snap the shopper chose. */
  const consumedDrag = React.useCallback(() => drag.current.moved, []);

  const toggle = React.useCallback(() => {
    setSnap((current) => (current === "peek" ? "half" : "peek"));
  }, []);

  /** Grows the sheet to show new content, but only when it is already open. */
  const raiseTo = React.useCallback((target: SheetSnap) => {
    setSnap((current) => raiseSnap(current, target));
  }, []);

  return {
    rootRef,
    headerRef,
    snap,
    setSnap,
    raiseTo,
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
