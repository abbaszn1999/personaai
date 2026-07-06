import { NextRequest } from "next/server";
import { hashPassword } from "@/modules/auth/lib/helpers";
import { getUserByEmail, resetPassword } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return Response.json({ error: "Email, code, and new password are required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return Response.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (user.password_reset_token !== code) {
      return Response.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (
      !user.password_reset_expiry ||
      new Date(user.password_reset_expiry) < new Date()
    ) {
      return Response.json({ error: "Reset code has expired" }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await resetPassword(user.id, passwordHash);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
