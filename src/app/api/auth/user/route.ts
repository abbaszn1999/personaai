import { getCurrentUser } from "@/modules/auth/lib/get-user";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ user });
  } catch (err) {
    console.error("[auth/user]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
