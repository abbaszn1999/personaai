/** A store's sticky or fixed header stays at the top of the window while the page scrolls under
 *  it. The widget scrolls with the page, and whether the header then paints over it depends on
 *  the theme's z-index (an unset one loses to the widget, which comes later in the page). Rather
 *  than depend on that, the widget clips its own top edge at the header's bottom edge, so it
 *  always passes underneath, whatever the theme's CSS. */

/** Only bars pinned to the top count; anything taller than this share of the window is a
 *  drawer, a modal or a cookie wall, not a header. */
const MAX_HEADER_SHARE = 0.4;
/** Hide-on-scroll headers come back on the way up, and a theme can swap its header element;
 *  look again this often while the page is scrolling. */
const REDETECT_MS = 600;

function pinnedAncestor(el: Element, host: HTMLElement): HTMLElement | null {
  for (let node: Element | null = el; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (node === host) return null;
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return node as HTMLElement;
  }
  return null;
}

/** The page's elements pinned along the top edge of the window, above the widget. */
function findPinnedHeaders(host: HTMLElement): HTMLElement[] {
  const rect = host.getBoundingClientRect();
  const left = Math.max(1, rect.left + 4);
  const right = Math.min(window.innerWidth - 1, rect.right - 4);
  const found = new Set<HTMLElement>();
  for (const x of [left, (left + right) / 2, right]) {
    for (const el of document.elementsFromPoint(x, 1)) {
      const pinned = pinnedAncestor(el, host);
      if (!pinned || pinned.contains(host)) continue;
      const box = pinned.getBoundingClientRect();
      if (box.top <= 1 && box.height > 0 && box.bottom < window.innerHeight * MAX_HEADER_SHARE) found.add(pinned);
    }
  }
  return [...found];
}

export interface PageHeaderClip {
  /** Re-measures and reapplies the clip: call it after rewriting the host's inline style. */
  refresh: () => void;
  /** Scrolls the page just enough to bring the whole widget into view below the header (its
   *  top edge first, when it is taller than the space). */
  alignBelowHeader: () => void;
}

export function attachClipUnderPageHeader(host: HTMLElement, isEnabled: () => boolean): PageHeaderClip {
  let headers: HTMLElement[] = [];
  let lastDetect = 0;
  let frame = 0;
  let applied = 0;

  const headerBottom = () => {
    const now = performance.now();
    if (now - lastDetect > REDETECT_MS) {
      headers = findPinnedHeaders(host);
      lastDetect = now;
    }
    let bottom = 0;
    for (const header of headers) {
      if (!header.isConnected) continue;
      const box = header.getBoundingClientRect();
      if (box.top <= 1 && box.bottom > bottom) bottom = box.bottom;
    }
    return bottom;
  };

  const update = () => {
    frame = 0;
    if (!isEnabled()) {
      if (applied) host.style.removeProperty("clip-path");
      applied = 0;
      return;
    }
    const inset = Math.max(0, Math.round(headerBottom() - host.getBoundingClientRect().top));
    if (inset === applied) return;
    applied = inset;
    if (inset > 0) host.style.setProperty("clip-path", `inset(${inset}px 0 0 0)`);
    else host.style.removeProperty("clip-path");
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const refresh = () => {
    applied = -1;
    lastDetect = 0;
    schedule();
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", refresh, { passive: true });
  refresh();

  const alignBelowHeader = () => {
    if (!isEnabled()) return;
    lastDetect = 0;
    const rect = host.getBoundingClientRect();
    const toTop = rect.top - headerBottom();
    const delta = toTop < 0 ? toTop : Math.min(toTop, Math.max(0, rect.bottom - window.innerHeight));
    if (Math.abs(delta) > 2) window.scrollBy({ top: Math.round(delta), behavior: "smooth" });
  };

  return { refresh, alignBelowHeader };
}
