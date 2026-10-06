import { NextRequest } from "next/server";
import { hashPassword } from "@/modules/auth/lib/helpers";
import { checkCode } from "@/modules/auth/lib/one-time-code";
import {
  AUTH_LIMITS,
  allowAuthAttempt,
  clientIp,
  passwordProblem,
  tooManyAttempts,
} from "@/modules/auth/lib/rate-limit";
import { getUserByEmail, resetPassword, spendOneTimeCode } from "@/lib/db/users";
import { deleteAllSessionsForUser } from "@/lib/db/sessions";

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return Response.json({ error: "Email, code, and new password are required" }, { status: 400 });
    }
    const problem = passwordProblem(newPassword);
    if (problem) return Response.json({ error: problem }, { status: 400 });
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

    const passwordHash = await hashPassword(newPassword);
    await resetPassword(user.id, passwordHash);
    // Whoever forced the reset may still hold a signed-in device; a reset ends every session.
    await deleteAllSessionsForUser(user.id);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
