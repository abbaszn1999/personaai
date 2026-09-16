import * as React from "react";

/**
 * Calls `onOutside` on a pointerdown outside `ref`'s element, while `active` is true.
 *
 * Reads `event.composedPath()` instead of `event.target`. The widget renders inside a Shadow
 * DOM, and for a composed event (pointerdown included) that crosses the shadow boundary, a
 * listener outside the tree — this hook attaches to `window` — sees `target` retargeted to the
 * shadow host, never the actual element the user pressed. `ref.current.contains(event.target)`
 * is therefore always false for anything inside the shadow root, which reads as "every press
 * was outside" and closes the popover before its own button's click ever fires — the exact bug
 * that made "Add profile" and the backdrop picker appear to do nothing. `composedPath()` is the
 * one API that returns the real, un-retargeted chain of nodes, so it works the same whether the
 * caller lives in a shadow tree (the widget) or plain document (the dashboard).
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean
): void {
  const onOutsideRef = React.useRef(onOutside);
  onOutsideRef.current = onOutside;

  React.useEffect(() => {
    if (!active) return;
    function onPointerDown(e: PointerEvent) {
      const path = e.composedPath();
      if (ref.current && !path.includes(ref.current)) {
        onOutsideRef.current();
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [active, ref]);
}
