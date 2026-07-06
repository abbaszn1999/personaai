import { NextRequest } from "next/server";
import { getUserByEmail } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return Response.json({ error: "Email and code are required" }, { status: 400 });
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

    return Response.json({ success: true });
  } catch (err) {
    console.error("[verify-reset-code]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
