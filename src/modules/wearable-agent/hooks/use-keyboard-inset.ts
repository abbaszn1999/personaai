"use client";

import * as React from "react";

/** Below this, a viewport shrink is the browser's own collapsing toolbar, not a keyboard. */
export const KEYBOARD_MIN_INSET = 120;

/** How much of the bottom of the screen the on-screen keyboard is covering, in px (0 when it is
 *  closed). The chat panel pads its composer by this so the text field stays above the keyboard. */
export function useKeyboardInset(): number {
  const [inset, setInset] = React.useState(0);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setInset(hidden > KEYBOARD_MIN_INSET ? Math.round(hidden) : 0);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  return inset;
}
