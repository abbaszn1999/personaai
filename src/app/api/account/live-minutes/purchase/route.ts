import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
import { quoteLiveMinutes } from "@/lib/billing/wallets";
import { LIVE_MAX_MINUTES, LIVE_MIN_MINUTES } from "@/lib/billing/pricing";
import { createStripeCheckout } from "@/lib/stripe/checkout";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const workspace = workspaceId
      ? await getWorkspaceByIdForOwner(workspaceId, user.id)
      : (await getWorkspacesByOwner(user.id))[0] ?? null;
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const minutes = Number(body.minutes);
    const quote = quoteLiveMinutes(minutes);
    if (!quote) {
      return Response.json(
        { error: `Minutes must be a whole number between ${LIVE_MIN_MINUTES} and ${LIVE_MAX_MINUTES}` },
        { status: 400 }
      );
    }

    const checkout = await createStripeCheckout({
      user,
      purchaseKey: "live_minutes",
      quantity: quote.stripeQuantity,
    });
    return Response.json({ ...checkout, checkoutMode: "stripe" });
  } catch (error) {
    console.error("[api/account/live-minutes/purchase POST]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to purchase live try-on minutes" },
      { status: 500 }
    );
  }
}
