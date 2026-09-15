"use client";

import * as React from "react";

/** Tracks `window.visualViewport`'s height so callers can react when the on-screen keyboard
 *  opens/closes. The widget never controls the host page's own `<meta viewport>` tag (the
 *  merchant's page does) — so `interactive-widget=resizes-content` isn't available, and `dvh`
 *  does not shrink when the keyboard opens. `visualViewport` is the one signal that works
 *  cross-browser regardless of the host page's own viewport meta tag; it's the same mechanism
 *  chat apps like Slack/WhatsApp Web use to keep an input bar above the keyboard. Returns
 *  `null` before mount or where `visualViewport` is unsupported. */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return height;
}

/** Keeps whichever input/textarea is currently focused inside `containerRef` scrolled into view
 *  when the on-screen keyboard opens (i.e. the visual viewport shrinks noticeably) — otherwise a
 *  focused field near the bottom of a centered onboarding card can end up hidden behind the
 *  keyboard on mobile, since this widget can't lean on `dvh`/`interactive-widget` (see above). */
export function useKeepFocusedFieldVisible(containerRef: React.RefObject<HTMLElement | null>) {
  const viewportHeight = useVisualViewportHeight();
  const lastHeightRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (viewportHeight === null) return;
    const previous = lastHeightRef.current;
    lastHeightRef.current = viewportHeight;
    // A shrink of >80px reliably distinguishes "keyboard opened" from address-bar
    // show/hide or minor rotation jitter, without needing a device-specific threshold.
    const keyboardLikelyOpened = previous !== null && viewportHeight < previous - 80;
    if (!keyboardLikelyOpened) return;

    const active = document.activeElement;
    if (active instanceof HTMLElement && containerRef.current?.contains(active)) {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [viewportHeight, containerRef]);
}
