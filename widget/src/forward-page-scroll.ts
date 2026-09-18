/**
 * Wheel / touch over the widget used to die at the Shadow-DOM host: that node is
 * `overflow: hidden` with a fixed leftover-viewport height, so it is a CSS scroll
 * container that cannot actually scroll — and therefore never chains the gesture
 * to the merchant page. Shoppers with the cursor (or finger) inside the fitting
 * room could not scroll the store.
 *
 * Native-like rule: if some element *inside* the widget can consume this delta,
 * leave it alone (chat messages, a long measurements form). Otherwise apply the
 * same delta to the page's scrolling element so the host page moves.
 */

function isYScrollable(el: HTMLElement): boolean {
  const { overflowY } = window.getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

function canScrollY(el: HTMLElement, deltaY: number): boolean {
  if (deltaY < 0) return el.scrollTop > 1;
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}

function pixelDeltaY(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
  return e.deltaY;
}

function scrollPageBy(dy: number) {
  const se = document.scrollingElement ?? document.documentElement;
  se.scrollTop += dy;
}

function innerScrollerAlong(path: EventTarget[], root: EventTarget, deltaY: number): HTMLElement | null {
  for (const node of path) {
    if (node === root) break;
    if (!(node instanceof HTMLElement)) continue;
    if (isYScrollable(node) && canScrollY(node, deltaY)) return node;
  }
  return null;
}

export function attachPageScrollForwarding(root: HTMLElement): () => void {
  const onWheel = (e: WheelEvent) => {
    if (root.getBoundingClientRect().height < 8) return;
    if (e.ctrlKey) return;
    const dy = pixelDeltaY(e);
    if (dy === 0 && e.deltaX === 0) return;
    if (Math.abs(e.deltaX) > Math.abs(dy)) return;
    if (innerScrollerAlong(e.composedPath(), root, dy)) return;
    e.preventDefault();
    scrollPageBy(dy);
  };

  let touchStartY = 0;
  let touchLocked: "inner" | "page" | null = null;

  const onTouchStart = (e: TouchEvent) => {
    touchStartY = e.touches[0]?.clientY ?? 0;
    touchLocked = null;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (root.getBoundingClientRect().height < 8) return;
    const y = e.touches[0]?.clientY ?? touchStartY;
    const dy = touchStartY - y;
    if (dy === 0) return;

    if (touchLocked === "inner") return;

    if (touchLocked === "page") {
      e.preventDefault();
      scrollPageBy(dy);
      touchStartY = y;
      return;
    }

    if (innerScrollerAlong(e.composedPath(), root, dy)) {
      touchLocked = "inner";
      return;
    }

    touchLocked = "page";
    e.preventDefault();
    scrollPageBy(dy);
    touchStartY = y;
  };

  const onTouchEnd = () => {
    touchLocked = null;
  };

  root.addEventListener("wheel", onWheel, { passive: false, capture: true });
  root.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  root.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  root.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
  root.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

  return () => {
    root.removeEventListener("wheel", onWheel, true);
    root.removeEventListener("touchstart", onTouchStart, true);
    root.removeEventListener("touchmove", onTouchMove, true);
    root.removeEventListener("touchend", onTouchEnd, true);
    root.removeEventListener("touchcancel", onTouchEnd, true);
  };
}
