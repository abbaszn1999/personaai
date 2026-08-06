import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getBillingOrderForUser } from "@/lib/db/billing";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const orderId = req.nextUrl.searchParams.get("orderId")?.trim();
  if (!orderId) return Response.json({ error: "Missing orderId" }, { status: 400 });

  const order = await getBillingOrderForUser(orderId, user.id);
  if (!order) return Response.json({ error: "Billing order not found" }, { status: 404 });

  return Response.json(
    {
      orderId: order.id,
      kind: order.kind,
      status: order.status,
      fulfilled: order.status === "fulfilled",
      reviewRequired: order.refundReviewRequired,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
