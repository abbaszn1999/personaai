import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getLatestBillingSubscription, getOrCreateBillingAccount } from "@/lib/db/billing";
import { resolveEntitlement } from "@/lib/billing/entitlement";
import { getUserById } from "@/lib/db/users";

/**
 * The plan the account is actually being charged on, for the sidebar badge.
 *
 * `users.subscription_tier` defaults to "trial" for every new account and the session cookie
 * caches it, so it says nothing about what was paid for. Only an entitled account (a paid or
 * trialing Stripe subscription, or a legacy test account) has a plan; everyone else gets null
 * and the sidebar shows no badge.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [account, subscription] = await Promise.all([
      getOrCreateBillingAccount(user.id),
      getLatestBillingSubscription(user.id),
    ]);
    const { entitled } = resolveEntitlement(account?.accessMode ?? "stripe", subscription);
    if (!entitled) return Response.json({ tierId: null }, { headers: { "Cache-Control": "no-store" } });

    const tierId = subscription?.tierId ?? (await getUserById(user.id))?.subscription_tier ?? null;
    return Response.json({ tierId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/account/plan-badge GET]", error);
    return Response.json({ tierId: null }, { status: 500 });
  }
}
