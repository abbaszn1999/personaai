/**
 * The browser already hands a wheel or swipe gesture to the merchant page when nothing inside the
 * widget can scroll: the Shadow-DOM host is `overflow: hidden` (or `overflow: visible` while the
 * widget is compact), and neither is a scroll target, so the gesture chains straight through.
 * That native path is what gives a swipe its momentum, its address-bar handling and its
 * compositor-thread smoothness.
 *
 * The one case where the gesture does NOT reach the page is a scroller inside the widget that
 * sets `overscroll-behavior: contain | none` (chat messages, side panels): once it is the gesture's
 * target the browser keeps the gesture there even when it has nothing left to scroll, so a
 * shopper whose finger or cursor rests on it can no longer move the store. Only for that case is
 * the gesture taken over and applied to the page by hand.
 *
 * It used to take over EVERY gesture that started inside the widget. On a phone that replaced
 * the browser's own scrolling with `scrollTop += dy` from a touchmove handler: no fling, and on
 * every store theme that sets `scroll-behavior: smooth` each tiny step was animated, so the page
 * lagged far behind the finger ("too hard to scroll"). A swipe that started on the sign-in or
 * measurements form moved the page about a third as far as the same swipe on the store itself.
 */

function isYScrollable(el: HTMLElement): boolean {
  const { overflowY } = window.getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** A scroll container that keeps a gesture to itself, even when it cannot scroll. */
function isScrollTrap(el: HTMLElement): boolean {
  const { overflowY, overscrollBehaviorY } = window.getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return overscrollBehaviorY === "contain" || overscrollBehaviorY === "none";
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

/** `behavior: "instant"` because a store theme with `scroll-behavior: smooth` would otherwise
 *  animate every small step and trail behind the finger. */
function scrollPageBy(dy: number) {
  window.scrollBy({ top: dy, left: 0, behavior: "instant" });
}

function pathHasTrap(path: EventTarget[], root: EventTarget): boolean {
  for (const node of path) {
    if (node === root) break;
    if (node instanceof HTMLElement && isScrollTrap(node)) return true;
  }
  return false;
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
    const path = e.composedPath();
    if (!pathHasTrap(path, root)) return;
    if (innerScrollerAlong(path, root, dy)) return;
    e.preventDefault();
    scrollPageBy(dy);
  };

  let touchStartY = 0;
  let touchMode: "native" | "trap" | "page" = "native";

  const onTouchStart = (e: TouchEvent) => {
    touchStartY = e.touches[0]?.clientY ?? 0;
    // Decided once, when the finger lands: only a gesture that starts on a scroll trap needs help.
    touchMode = pathHasTrap(e.composedPath(), root) ? "trap" : "native";
  };

  const onTouchMove = (e: TouchEvent) => {
    if (touchMode === "native") return;
    if (root.getBoundingClientRect().height < 8) return;
    const y = e.touches[0]?.clientY ?? touchStartY;
    const dy = touchStartY - y;
    if (dy === 0) return;

    if (touchMode === "page") {
      e.preventDefault();
      scrollPageBy(dy);
      touchStartY = y;
      return;
    }

    // Started on a scroll trap: let it scroll if it can, otherwise move the page.
    if (innerScrollerAlong(e.composedPath(), root, dy)) {
      touchMode = "native";
      return;
    }

    touchMode = "page";
    e.preventDefault();
    scrollPageBy(dy);
    touchStartY = y;
  };

  const onTouchEnd = () => {
    touchMode = "native";
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
