/**
 * Cloudflare Turnstile, browser side.
 *
 * The widget is "execute" mode and "interaction only": it stays invisible and runs a check each
 * time `getTurnstileToken()` is called, and only shows itself when Cloudflare wants the visitor
 * to do something. A token works once, so every request that needs one asks for a fresh token.
 *
 * The site key is public. The secret key never reaches the browser (see turnstile-verify.ts).
 */

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAFbkW7tjHLY4fcZm";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Long enough for a visitor to tick a box if Cloudflare asks them to. */
const CHALLENGE_TIMEOUT_MS = 120_000;

/** A token, `null` when the check failed or could not run, `undefined` when Turnstile is off. */
export type TokenResult = string | null | undefined;
export type TokenGetter = () => Promise<TokenResult>;

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  execute(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let container: HTMLElement | null = null;
let widgetId: string | null = null;
let scriptPromise: Promise<void> | null = null;
let settle: ((token: string | null) => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function turnstileEnabled(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}

/** The fields to send a token in. Both names are sent so the API can read whichever it uses. */
export function tokenFields(token: TokenResult): Record<string, string> {
  return token ? { turnstileToken: token, "cf-turnstile-response": token } : {};
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error("turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/** Where the widget may show itself. Pass `null` when the form unmounts. */
export function setTurnstileContainer(element: HTMLElement | null) {
  if (element === container) return;
  if (widgetId && typeof window !== "undefined") {
    try {
      window.turnstile?.remove(widgetId);
    } catch {
      /* the widget is already gone */
    }
  }
  settle?.(null);
  widgetId = null;
  container = element;
}

/** Starts loading the script early so the first check is quick. */
export function preloadTurnstile() {
  if (turnstileEnabled()) loadScript().catch(() => {});
}

async function runCheck(): Promise<string | null> {
  const target = container;
  if (!target) return null;
  try {
    await loadScript();
  } catch {
    return null;
  }
  const api = window.turnstile;
  if (!api) return null;

  return new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (token: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (settle === finish) settle = null;
      resolve(token);
    };
    const timer = setTimeout(() => finish(null), CHALLENGE_TIMEOUT_MS);
    settle = finish;

    try {
      if (widgetId) {
        api.reset(widgetId);
      } else {
        widgetId = api.render(target, {
          sitekey: TURNSTILE_SITE_KEY,
          execution: "execute",
          appearance: "interaction-only",
          theme: "auto",
          callback: (token: string) => settle?.(token),
          "error-callback": () => {
            settle?.(null);
            return true;
          },
          "timeout-callback": () => settle?.(null),
        });
      }
      api.execute(widgetId);
    } catch {
      finish(null);
    }
  });
}

/** Runs one check and resolves with a fresh single-use token. Checks are queued, never overlapped. */
export const getTurnstileToken: TokenGetter = () => {
  if (!turnstileEnabled()) return Promise.resolve(undefined);
  const next = queue.then(runCheck, runCheck);
  queue = next.catch(() => null);
  return next;
};
