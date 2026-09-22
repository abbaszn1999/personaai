import { Resend } from "resend";
import { db } from "@/lib/supabase/server";
import { getUserById } from "@/lib/db/users";

const resend = process.env.APP_RESEND_API_KEY ? new Resend(process.env.APP_RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@autommerce.com";

export type UsageWallet = "sessions" | "live" | "garments";

const WALLET_LABEL: Record<UsageWallet, string> = {
  sessions: "session units",
  live: "live try-on minutes",
  garments: "garment units",
};

/**
 * Sends the 80% and 100% notes once per wallet per cycle. The unique row is inserted
 * before the email, so a retry cannot send twice. A failed send is logged and swallowed
 * so a shopper turn is never failed by an alert.
 */
export async function maybeAlertWalletUsage(input: {
  userId: string;
  wallet: UsageWallet;
  used: number;
  allowance: number;
  cycleStartIso: string;
}): Promise<void> {
  try {
    if (input.allowance <= 0 || input.used <= 0) return;
    const ratio = input.used / input.allowance;
    const thresholds = [80, 100].filter((threshold) => ratio >= threshold / 100);
    if (thresholds.length === 0) return;

    const user = await getUserById(input.userId);
    if (!user?.email) return;
    if (user.notification_preferences?.usageAlerts === false) return;

    for (const threshold of thresholds) {
      const { error } = await db.from("billing_usage_alerts").insert({
        user_id: input.userId,
        wallet: input.wallet,
        cycle_start: input.cycleStartIso,
        threshold,
      });
      if (error) continue;
      await sendUsageAlert(user.email, input.wallet, threshold);
    }
  } catch (error) {
    console.error("[billing/usage-alerts]", error);
  }
}

async function sendUsageAlert(email: string, wallet: UsageWallet, threshold: number): Promise<void> {
  if (!resend) {
    console.warn("[billing/usage-alerts] RESEND not configured — skipping usage alert");
    return;
  }
  const label = WALLET_LABEL[wallet];
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `You've used ${threshold}% of your included ${label}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>${threshold}% of your ${label} is used</h2>
        <p>This billing cycle has used ${threshold}% of the ${label} included on your plan.</p>
        <p style="color:#71717a;font-size:14px">You can add more from billing settings, or turn these notes off there.</p>
      </div>
    `,
  });
  if (error) console.error("[billing/usage-alerts] Resend error", error);
}
