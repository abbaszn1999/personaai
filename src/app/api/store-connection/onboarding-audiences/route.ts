import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { onboardingAudiencesForScope } from "@/modules/wearable-agent/audiences";

/** The "Who's trying this on?" choices the merchant's own dashboard preview should offer —
 *  the same list the public embed config endpoint returns for shoppers. `audiences: null`
 *  means "no restriction" (no store connected, or the scope hasn't been saved yet). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    return Response.json({ audiences: onboardingAudiencesForScope(connection?.personaTaxonomyScope) });
  } catch (err) {
    console.error("[store-connection/onboarding-audiences GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
