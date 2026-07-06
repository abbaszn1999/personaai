import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { updateProfile } from "@/lib/db/users";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ user });
  } catch (err) {
    console.error("[account/profile GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { firstName, lastName, profileImageUrl } = await req.json();

    const updated = await updateProfile(user.id, { firstName, lastName, profileImageUrl });

    if (!updated) {
      return Response.json({ error: "Update failed" }, { status: 500 });
    }

    // Patch session profile cache so the layout stays in sync without a DB call
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    if (session.profile) {
      session.profile.firstName = firstName ?? null;
      session.profile.lastName = lastName ?? null;
      if (profileImageUrl !== undefined) {
        session.profile.profileImageUrl = profileImageUrl || null;
      }
      await session.save();
    }

    return Response.json({ user: updated });
  } catch (err) {
    console.error("[account/profile PUT]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
