import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { quoteSessionUnits } from "@/lib/billing/wallets";
import { SESSION_MAX_PACKS, SESSION_MIN_PACKS, SESSION_PACK_UNITS } from "@/lib/billing/pricing";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";
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

    const units = Number(body.units);
    const quote = quoteSessionUnits(units);
    if (!quote) {
      const min = SESSION_MIN_PACKS * SESSION_PACK_UNITS;
      const max = SESSION_MAX_PACKS * SESSION_PACK_UNITS;
      return Response.json(
        { error: `Session units must be a multiple of ${SESSION_PACK_UNITS} between ${min} and ${max}` },
        { status: 400 }
      );
    }

    const checkout = await createStripeCheckout({
      user,
      purchaseKey: "session_units",
      quantity: quote.stripeQuantity,
    });
    return Response.json({ ...checkout, checkoutMode: "stripe" });
  } catch (error) {
    console.error("[api/account/session-units/purchase POST]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to purchase session units" },
      { status: 500 }
    );
  }
}
