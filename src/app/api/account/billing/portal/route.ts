import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getOrCreateBillingAccount } from "@/lib/db/billing";
import { getStripe } from "@/lib/stripe/client";
import { getStripeServerConfig } from "@/lib/stripe/config";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const account = await getOrCreateBillingAccount(user.id);
    if (!account?.stripeCustomerId) {
      return Response.json({ error: "No Stripe billing account exists yet" }, { status: 400 });
    }

    const config = getStripeServerConfig();
    const session = await getStripe().billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${config.appUrl}/settings?section=billing`,
      ...(config.portalConfigurationId
        ? { configuration: config.portalConfigurationId }
        : {}),
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[api/account/billing/portal POST]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to open billing portal" },
      { status: 500 }
    );
  }
}
