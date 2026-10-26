/**
 * Guest shoppers: someone who uses the widget once, with no email and nothing saved.
 *
 * A guest still gets a real, short-lived session. The embed token is public (it sits in the
 * merchant's page source), and the chat, image and live try-on endpoints spend the merchant's wallet,
 * so they refuse any call without a session (see `resolveEmbedRequest`). The session is what keeps
 * those endpoints from being open to anyone.
 *
 * Every guest of a store shares one account row, marked by an email that can never be a real
 * address (`.invalid` is reserved by RFC 2606). That account can never hold profiles, and a guest's
 * spend is not linked to it, so each guest shows up as their own anonymous session in the usage page.
 */
export const GUEST_EMAIL = "guest@guest.invalid";

/** A guest session is a day at most; the widget also drops it as soon as the tab closes. */
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === GUEST_EMAIL;
}

export function isGuestAccount(account: { email: string }): boolean {
  return isGuestEmail(account.email);
}
