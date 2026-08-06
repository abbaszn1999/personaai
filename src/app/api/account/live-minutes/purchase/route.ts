import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { resolveBillingWorkspaceMode } from "@/lib/billing/workspace-context";
import { createStripeCheckout } from "@/lib/stripe/checkout";

const MAX_MINUTES_PER_PURCHASE = 10_000;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const mode = await resolveBillingWorkspaceMode(user.id, workspaceId);
    if (!mode) return Response.json({ error: "Workspace not found" }, { status: 404 });
    if (mode !== "wearable") {
      return Response.json({ error: "Live try-on minutes are only available for wearable workspaces" }, { status: 400 });
    }

    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES_PER_PURCHASE) {
      return Response.json(
        { error: `Minutes must be a whole number between 1 and ${MAX_MINUTES_PER_PURCHASE}` },
        { status: 400 }
      );
    }

    const checkout = await createStripeCheckout({
      user,
      workspaceMode: mode,
      purchaseKey: "live_minutes",
      quantity: minutes,
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
