import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { verifyPassword } from "@/modules/auth/lib/helpers";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { getPasswordHash, deleteUser } from "@/lib/db/users";
import { deleteAllSessionsForUser } from "@/lib/db/sessions";

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Re-auth for password accounts
    if (user.provider === "credentials") {
      const { password } = await req.json().catch(() => ({}));
      if (!password) {
        return Response.json({ error: "Password required to delete account" }, { status: 400 });
      }

      const passwordHash = await getPasswordHash(user.id);
      if (!passwordHash) {
        return Response.json({ error: "Account not found" }, { status: 404 });
      }

      const valid = await verifyPassword(password, passwordHash);
      if (!valid) {
        return Response.json({ error: "Incorrect password" }, { status: 401 });
      }
    }

    // Delete sessions + user (cascade)
    await deleteAllSessionsForUser(user.id);
    await deleteUser(user.id);

    // Clear iron-session cookie
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    session.destroy();

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
