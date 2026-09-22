import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/db/notifications";
import { setOverageCapCents } from "@/lib/db/users";
import { getWorkspaceByIdForOwner, getWorkspacesByOwner } from "@/lib/db/workspaces";

const MAX_CAP_CENTS = 10_000_000;

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
    const workspace = workspaceId
      ? await getWorkspaceByIdForOwner(workspaceId, user.id)
      : (await getWorkspacesByOwner(user.id))[0] ?? null;
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

    const rawCap = body.capCents;
    const capCents = rawCap === null ? null : Number(rawCap);
    if (capCents !== null && (!Number.isInteger(capCents) || capCents < 0 || capCents > MAX_CAP_CENTS)) {
      return Response.json(
        { error: "Spend cap must be empty or a whole number of cents from 0 to 10000000" },
        { status: 400 }
      );
    }

    const saved = await setOverageCapCents(user.id, capCents);
    if (!saved) return Response.json({ error: "Unable to save spend cap" }, { status: 500 });

    if (typeof body.usageAlerts === "boolean") {
      const preferences = await getNotificationPreferences(user.id);
      const updated = await updateNotificationPreferences(user.id, {
        ...preferences,
        usageAlerts: body.usageAlerts,
      });
      if (!updated) return Response.json({ error: "Unable to save alert preference" }, { status: 500 });
    }

    return Response.json({ capCents, usageAlerts: body.usageAlerts });
  } catch (error) {
    console.error("[api/account/spend-cap PUT]", error);
    return Response.json({ error: "Unable to save spend cap" }, { status: 500 });
  }
}
