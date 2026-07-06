import { NextRequest } from "next/server";
import { generateCode, sendResetEmail } from "@/modules/auth/lib/helpers";
import { getUserByEmail, setPasswordResetCode } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      // Always 200 to prevent enumeration
      return Response.json({ success: true });
    }

    const user = await getUserByEmail(email);

    // Always 200 — prevents email enumeration
    if (!user || !user.password_hash) {
      return Response.json({ success: true });
    }

    const code = generateCode();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await setPasswordResetCode(user.id, code, expiry.toISOString());
    await sendResetEmail(user.email, code);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
