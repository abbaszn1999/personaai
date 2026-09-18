import * as React from "react";
import { createRoot } from "react-dom/client";
import { EmbedApp } from "./embed-app";
import { setWearableAssetOrigin } from "@/modules/wearable-agent/constants";
import { setWidgetOrigin } from "./widget-origin";
// Bundled at build time (see scripts/build-widget.mjs) as raw CSS text so the whole widget
// ships as one <script> file with zero extra network round-trips or FOUC while a separate
// stylesheet loads.
import compiledCss from "./widget.css";

// Captured synchronously at module-evaluation time — `document.currentScript` is only valid
// while this script is actively (synchronously) executing, which won't still be true once
// `boot()` runs after a deferred `DOMContentLoaded` wait (typical for an `async` widget tag).
const scriptElAtLoad = document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;

/** Floor for the dynamically-measured fullpage height (see `fullpageHeightPx` below) so a
 *  widget placed very low on a long page never collapses to something unusably short. */
const MIN_FULLPAGE_HEIGHT_PX = 480;

/** Reads `?w=<embedToken>` off the widget's own <script> tag src, exactly like any other
 *  self-configuring embeddable widget script (Intercom, Stripe, etc). Falls back to scanning
 *  the DOM for the last widget.js tag if `currentScript` wasn't available at load time. */
function resolveScriptTag(): HTMLScriptElement | null {
  if (scriptElAtLoad) return scriptElAtLoad;
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src*=\"widget.js\"]"));
  return scripts[scripts.length - 1] ?? null;
}

function boot() {
  const scriptEl = resolveScriptTag();
  if (!scriptEl) {
    console.error("[autoshopping widget] Couldn't locate its own <script> tag — cannot read the embed token.");
    return;
  }

  const scriptUrl = new URL(scriptEl.src, window.location.href);
  const embedToken = scriptUrl.searchParams.get("w");
  if (!embedToken) {
    console.error("[autoshopping widget] Missing ?w=<embedToken> on the widget.js <script> tag.");
    return;
  }

  const origin = scriptUrl.origin;
  setWearableAssetOrigin(origin);
  // Lets the on-demand chunks (currently widget-live.js) build an absolute URL back to us
  // rather than to the merchant's origin — see widget/src/decart-runtime-shim.ts.
  setWidgetOrigin(origin);
  const targetSelector = scriptEl.getAttribute("data-target");
  const targetEl = targetSelector ? document.querySelector(targetSelector) : null;

  // Same-page-context injection via Shadow DOM: the widget genuinely lives in the host page's
  // DOM (not an iframe), so it can be given deep access to the host page later (e.g. cart
  // integration) while its own styles stay fully encapsulated from the merchant's site CSS.
  //
  // Width is always 100% of whatever it's placed into — a viewport-breakout trick (negative
  // vw margins) was tried here to escape a theme's padded content column, but that kind of
  // hack is unreliable across arbitrary WordPress themes (nested `overflow` ancestors, existing
  // horizontal scrollbars, RTL layouts, etc. can all collapse it to a sliver). To get a true
  // full-width section, place the <script> tag inside a full-width row/section on the page
  // instead (e.g. a full-width Elementor section or Gutenberg full-width group).
  const host = document.createElement("div");
  host.setAttribute("data-autoshopping-widget", embedToken);
  // Placeholder height until it's actually in the DOM and we can measure where it landed (see
  // applyFullpageHeight) — avoids a flash of the wrong height before the real, offset-aware
  // height applies.
  host.style.cssText = "display:block;width:100%;height:0;box-sizing:border-box;overflow:hidden;";

  if (targetEl) {
    targetEl.appendChild(host);
  } else {
    scriptEl.insertAdjacentElement("afterend", host);
  }

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = compiledCss as string;
  shadow.appendChild(style);

  const mountEl = document.createElement("div");
  mountEl.style.cssText = "width:100%;height:100%;overflow:hidden;";
  shadow.appendChild(mountEl);

  /** A plain `height: 100vh` only fills the visible window when the widget starts right at the
   *  top of the page (true for the dedicated `/embed/[token]` preview). Real merchant pages
   *  almost always have a header/nav/topbar *above* the widget in normal page flow, so a full
   *  100vh box starting partway down pushes its own bottom past the fold of the initial browser
   *  window, leaving extra blank scroll space below one screenful. Instead, measure exactly how
   *  much viewport space remains below wherever the widget landed, so it fills the rest of the
   *  first screen without overflowing it. Re-measuring more than once matters here: page layout
   *  above the widget (banners, carousels, webfonts, lazy images) often keeps shifting for a bit
   *  after DOMContentLoaded, which changes this offset. This used to be risky when the bulk
   *  "Add All to Cart" CTA was pinned to the widget's bottom edge — an under-measurement could
   *  hide it — but that CTA now lives inline in the Solution Board's topic header instead, so a
   *  slightly-off measurement here is at worst cosmetic. A merchant-provided `data-target`
   *  container is assumed to already be sized deliberately, so that case just fills 100% of it. */
  function fullpageHeightPx(): number {
    const top = host.getBoundingClientRect().top;
    return Math.max(MIN_FULLPAGE_HEIGHT_PX, Math.round(window.innerHeight - top));
  }

  let currentMode: "fullpage" | "floating" = "fullpage";

  function applyFullpageHeight() {
    if (currentMode !== "fullpage") return;
    const heightCss = targetEl ? "100%" : `${fullpageHeightPx()}px`;
    host.style.cssText = `display:block;width:100%;height:${heightCss};box-sizing:border-box;overflow:hidden;`;
    mountEl.style.cssText = "width:100%;height:100%;overflow:hidden;";
  }

  /** Switches the host's own footprint on the host page once branding loads — a "floating"
   *  unwearable widget must NOT occupy page flow like the fullpage docked widget does; it
   *  needs a zero-footprint fixed overlay instead so the launcher/panel float above the page
   *  content rather than reserving a full-viewport block. `fullpage` restores the original
   *  block-in-flow sizing (wearable always uses this). */
  function applyDisplayMode(mode: "fullpage" | "floating") {
    currentMode = mode;
    if (mode === "floating") {
      host.style.cssText = "display:block;width:0;height:0;overflow:visible;position:static;";
      mountEl.style.cssText = "width:0;height:0;overflow:visible;";
    } else {
      applyFullpageHeight();
    }
  }

  // Mobile browsers fire `resize` continuously while the page is scrolled, purely because the
  // address bar/toolbar collapses or expands — `window.innerHeight` grows or shrinks with it,
  // with the *width* staying identical. Recomputing `fullpageHeightPx()` on every one of those
  // made the widget's own block (and the avatar image filling it) visibly grow/shrink while a
  // shopper was mid-scroll, which read as the image "zooming" on scroll. A real resize — window
  // resize, orientation change, devtools opening — always changes the width too, so gating on
  // that filters out the toolbar-only noise without missing a real layout change.
  let lastResizeWidth = window.innerWidth;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    const width = window.innerWidth;
    if (width === lastResizeWidth) return;
    lastResizeWidth = width;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyFullpageHeight, 150);
  });

  // Catches page layout that's still settling after DOMContentLoaded (see the comment above
  // fullpageHeightPx) — re-measure once more on `load` plus a couple of delayed follow-ups for
  // content that doesn't block `load` at all (lazy images, animated announcement bars, etc).
  window.addEventListener("load", applyFullpageHeight, { once: true });
  [500, 1500].forEach((delay) => setTimeout(applyFullpageHeight, delay));

  createRoot(mountEl).render(
    <EmbedApp origin={origin} embedToken={embedToken} onDisplayModeChange={applyDisplayMode} />
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
