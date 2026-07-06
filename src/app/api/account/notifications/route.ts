import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/db/notifications";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getNotificationPreferences(user.id);
    return Response.json({ preferences });
  } catch (err) {
    console.error("[account/notifications GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { preferences } = await req.json();

    if (!preferences || typeof preferences !== "object") {
      return Response.json({ error: "Invalid preferences" }, { status: 400 });
    }

    const ok = await updateNotificationPreferences(user.id, preferences);

    if (!ok) {
      return Response.json({ error: "Failed to save preferences" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account/notifications POST]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
