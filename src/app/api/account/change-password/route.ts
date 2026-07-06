import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { verifyPassword, hashPassword } from "@/modules/auth/lib/helpers";
import { getPasswordHash, changePassword } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return Response.json({ error: "Current and new password are required" }, { status: 400 });
    }

    const passwordHash = await getPasswordHash(user.id);
    if (!passwordHash) {
      return Response.json({ error: "No password set for this account" }, { status: 400 });
    }

    const valid = await verifyPassword(currentPassword, passwordHash);
    if (!valid) {
      return Response.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const newHash = await hashPassword(newPassword);
    await changePassword(user.id, newHash);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account/change-password]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
