import { NextRequest } from "next/server";
import { checkCode } from "@/modules/auth/lib/one-time-code";
import { AUTH_LIMITS, allowAuthAttempt, clientIp, tooManyAttempts } from "@/modules/auth/lib/rate-limit";
import { getUserByEmail, spendOneTimeCode } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return Response.json({ error: "Email and code are required" }, { status: 400 });
    }
    if (!allowAuthAttempt([`reset-check:${clientIp(req)}`, AUTH_LIMITS.codeCheckPerIp])) {
      return tooManyAttempts();
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return Response.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (
      !user.password_reset_expiry ||
      new Date(user.password_reset_expiry) < new Date()
    ) {
      return Response.json({ error: "Reset code has expired" }, { status: 400 });
    }

    const result = await checkCode(user.password_reset_token, code, (expected, next) =>
      spendOneTimeCode(user.id, "password_reset_token", expected, next)
    );
    if (result === "exhausted") {
      return Response.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 400 });
    }
    if (result !== "valid") {
      return Response.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[verify-reset-code]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
