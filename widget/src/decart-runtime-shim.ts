import type { DecartRuntime } from "@/modules/wearable-agent/hooks/decart-runtime";
import { getWidgetOrigin } from "./widget-origin";

/**
 * widget.js's stand-in for hooks/decart-runtime.ts (aliased in scripts/build-widget.mjs).
 *
 * The dashboard's version just `await import(...)`s the SDK, which its bundler turns into a real
 * lazy chunk. esbuild can't do that for an IIFE bundle — it inlines dynamic imports back into the
 * single output file — so the SDK is built as a separate IIFE (`public/widget-live.js`, see
 * widget/src/live-entry.ts) and injected as a classic <script> the first time a shopper starts a
 * live session. A classic script tag is deliberate: a cross-origin `import()` would additionally
 * require CORS headers on the bundle, whereas a script tag needs none.
 */
declare global {
  interface Window {
    __autoshoppingDecartRuntime?: DecartRuntime;
  }
}

const SCRIPT_MARKER = "data-autoshopping-live";

let pending: Promise<DecartRuntime> | null = null;

function injectLiveBundle(): Promise<DecartRuntime> {
  return new Promise<DecartRuntime>((resolve, reject) => {
    const src = `${getWidgetOrigin()}/widget-live.js`;

    const settle = () => {
      const runtime = window.__autoshoppingDecartRuntime;
      if (runtime) resolve(runtime);
      else reject(new Error("The live try-on bundle loaded but did not register itself."));
    };

    // A previous mount (or a second widget on the same page) may already have injected it.
    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_MARKER}]`);
    if (existing) {
      if (window.__autoshoppingDecartRuntime) return settle();
      existing.addEventListener("load", settle, { once: true });
      existing.addEventListener("error", () => reject(new Error("Couldn't load live try-on.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute(SCRIPT_MARKER, "1");
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", () => reject(new Error("Couldn't load live try-on.")), { once: true });
    document.head.appendChild(script);
  });
}

export async function loadDecartRuntime(): Promise<DecartRuntime> {
  if (window.__autoshoppingDecartRuntime) return window.__autoshoppingDecartRuntime;

  if (!pending) {
    // A rejected load must not poison this cache — a shopper who lost connectivity mid-fetch
    // should be able to just tap the button again rather than being stuck until reload.
    pending = injectLiveBundle().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }

  return pending;
}
