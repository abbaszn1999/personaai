import { Resend } from "resend";

// Same env vars and fallback-from-address as the merchant-side auth emails in
// src/modules/auth/lib/helpers.ts — one Resend account for the whole product.
const resend = process.env.APP_RESEND_API_KEY ? new Resend(process.env.APP_RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@autommerce.com";

/** Sent from us (Autommerce), not the merchant's own domain — `storeName` in the subject/body
 *  is what makes it read as "this store's fitting room" rather than a random third party, without
 *  requiring every merchant to configure their own sending domain's DNS just to turn this on.
 *
 *  Returns whether the code actually went out: unlike the merchant-side emails, this one *is*
 *  the credential, so a silent skip would leave the shopper staring at a code entry screen for
 *  a mail that never arrives. */
export async function sendShopperLoginCode(email: string, code: string, storeName: string): Promise<boolean> {
  if (!resend) {
    // No mail provider locally — print the code so the sign-in flow stays testable in dev.
    // In production a missing key is a real outage and has to surface as a failed send.
    if (process.env.NODE_ENV === "production") {
      console.error("[shopper-auth] RESEND not configured — cannot send login code");
      return false;
    }
    console.warn(`[shopper-auth] RESEND not configured — login code for ${email} is ${code}`);
    return true;
  }
  try {
    // The Resend SDK does NOT throw for API-level failures (unverified sending domain,
    // rejected recipient, rate limit, etc.) — it resolves normally with `{ data, error }`.
    // Only a transport/network failure ever reaches the catch block below, so `error` here
    // has to be checked explicitly or a silently-rejected send looks identical to success.
    const { error } = await resend.emails.send({
      from: `${storeName} via Autommerce <${FROM}>`,
      to: email,
      // The raw digits used to sit in the subject line — a strong, well-known spam/phishing
      // signal on its own (Gmail et al. specifically pattern-match "code: 123456" subjects).
      // Keeping the subject code-free and only ever showing it in the signed HTML/text body
      // is one of the few purely content-side levers here; the domain reputation build-up
      // deficit (see sendShopperLoginCode's own history) is the bigger factor and isn't fixed
      // by wording alone.
      subject: `Your ${storeName} sign-in code`,
      // A text/plain alternative alongside the HTML part — HTML-only mail from a low-volume
      // sending domain is itself a spam-filter signal, and a plain-text part is close to free.
      text: `Sign in to ${storeName}\n\nYour sign-in code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore it.\n\nSent by Autommerce on behalf of ${storeName}.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b">
          <h2 style="margin-bottom:4px">Sign in to ${storeName}</h2>
          <p>Use the following code to access your saved profiles and fit history:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;padding:16px;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#71717a;font-size:14px">This code expires in 10 minutes. If you didn't request this, you can safely ignore it.</p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0" />
          <p style="color:#a1a1aa;font-size:12px">Sent by Autommerce (autommerce.com) on behalf of ${storeName}'s fitting room. This is a transactional message triggered by your own sign-in request.</p>
        </div>
      `,
    });
    if (error) {
      console.error("[shopper-auth] Resend rejected the login code email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[shopper-auth] Failed to send login code email:", err);
    return false;
  }
}
