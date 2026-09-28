import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminSessionData } from "@/modules/auth/lib/admin-session";

function sameSecret(input: string, expected: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const expectedPassword = process.env.ADMIN_PASSWORD ?? "";

    if (!expectedEmail || !expectedPassword) {
      return Response.json({ error: "Admin login is not configured" }, { status: 503 });
    }
    if (!email || !password) {
      return Response.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (email.trim().toLowerCase() !== expectedEmail || !sameSecret(password, expectedPassword)) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const session = await getIronSession<AdminSessionData>(cookieStore, adminSessionOptions);
    session.email = expectedEmail;
    session.loggedInAt = Date.now();
    await session.save();

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/login]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
