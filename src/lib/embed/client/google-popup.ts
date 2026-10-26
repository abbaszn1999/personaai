/**
 * The widget's half of "Continue with Google": opens the popup, waits for the page inside it to post
 * back, and returns the one-time ticket. The widget lives on the merchant's own page, so Google can only
 * be reached through a popup on our domain; the ticket is redeemed through the normal verify-code route.
 */

/** Same string the popup page posts (see `lib/shopper-auth/google-popup.ts`). */
const MESSAGE_SOURCE = "autoshopping-shopper-google";

const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 680;
/** Long enough for a Google account picker and a 2-step prompt, short enough not to wait forever. */
const TIMEOUT_MS = 5 * 60 * 1000;

export type GoogleSignInResult =
  | { ok: true; email: string; ticket: string }
  | { ok: false; error?: string; cancelled?: boolean };

interface PopupMessage {
  source?: unknown;
  ok?: unknown;
  email?: unknown;
  ticket?: unknown;
  error?: unknown;
  cancelled?: unknown;
}

/** Reads what the popup posted, or null when the message is not one of ours. */
export function parsePopupMessage(data: unknown): GoogleSignInResult | null {
  if (!data || typeof data !== "object") return null;
  const message = data as PopupMessage;
  if (message.source !== MESSAGE_SOURCE) return null;
  if (message.ok === true && typeof message.email === "string" && typeof message.ticket === "string") {
    return { ok: true, email: message.email, ticket: message.ticket };
  }
  return {
    ok: false,
    error: typeof message.error === "string" ? message.error : undefined,
    cancelled: message.cancelled === true,
  };
}

/** `apiBase` is the embed API root (".../api/embed"): the popup page is served from the same origin. */
export function signInWithGooglePopup(apiBase: string, embedToken: string): Promise<GoogleSignInResult> {
  return new Promise((resolve) => {
    let startUrl: string;
    try {
      const api = new URL(apiBase, window.location.href);
      const query = new URLSearchParams({ embedToken, origin: window.location.origin });
      startUrl = `${api.origin}${api.pathname.replace(/\/$/, "")}/shopper/google/start?${query.toString()}`;
    } catch {
      resolve({ ok: false, error: "Google sign-in isn't available here." });
      return;
    }

    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2));
    const popup = window.open(
      startUrl,
      "autoshopping-google-signin",
      `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
    );
    if (!popup) {
      resolve({ ok: false, error: "Your browser blocked the Google window. Allow pop-ups for this site, or use email." });
      return;
    }

    let settled = false;
    const finish = (result: GoogleSignInResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(watcher);
      window.clearTimeout(timer);
      resolve(result);
    };

    function onMessage(event: MessageEvent) {
      // Only the popup window we opened can complete the sign-in. Its last page is served by the app's
      // own host, which can differ from the API host the popup started on, so the window is what is
      // trusted rather than the origin; the message is also posted only to this page's origin.
      if (event.source !== popup) return;
      const result = parsePopupMessage(event.data);
      if (!result) return;
      try {
        popup?.close();
      } catch {
        // Already closed.
      }
      finish(result);
    }
    window.addEventListener("message", onMessage);

    // A popup closed without a message was cancelled by the shopper.
    const watcher = window.setInterval(() => {
      if (popup.closed) finish({ ok: false, cancelled: true });
    }, 500);
    const timer = window.setTimeout(() => {
      try {
        popup.close();
      } catch {
        // Already closed.
      }
      finish({ ok: false, error: "Google sign-in took too long. Please try again." });
    }, TIMEOUT_MS);
  });
}
