import { NextRequest } from "next/server";
import { hashPassword, generateCode, sendVerificationEmail } from "@/modules/auth/lib/helpers";
import { emailExists, createCredentialsUser } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (await emailExists(email)) {
      return Response.json({ error: "Email already registered" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const code = generateCode();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const user = await createCredentialsUser({
      email,
      passwordHash,
      firstName,
      lastName,
      verificationToken: code,
      verificationExpiry: expiry.toISOString(),
    });

    if (!user) {
      return Response.json({ error: "Registration failed" }, { status: 500 });
    }

    await sendVerificationEmail(email, code);

    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        },
        requiresVerification: true,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[register]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
