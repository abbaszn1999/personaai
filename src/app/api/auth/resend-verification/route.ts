import { NextRequest } from "next/server";
import { generateCode, sendVerificationEmail } from "@/modules/auth/lib/helpers";
import { getUserByEmail, setEmailVerificationCode } from "@/lib/db/users";

const COOLDOWN_MS = 60 * 1000; // 60 seconds

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      // Prevent enumeration — always 200
      return Response.json({ success: true });
    }

    if (user.email_verified) {
      return Response.json({ error: "Email already verified" }, { status: 400 });
    }

    // Enforce 60s cooldown via expiry field
    if (user.email_verification_expiry) {
      const expiry = new Date(user.email_verification_expiry).getTime();
      const originalSentAt = expiry - 60 * 60 * 1000; // expiry = sent_at + 1h
      if (Date.now() - originalSentAt < COOLDOWN_MS) {
        return Response.json({ error: "Please wait before requesting another code" }, { status: 429 });
      }
    }

    const code = generateCode();
    const newExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await setEmailVerificationCode(user.id, code, newExpiry.toISOString());
    await sendVerificationEmail(user.email, code);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[resend-verification]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
