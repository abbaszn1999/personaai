import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { setProfileImageUrl } from "@/lib/db/users";
import { deleteMerchantAvatar, uploadMerchantAvatar } from "@/lib/account/avatar-storage";

async function saveSessionPhoto(profileImageUrl: string | null) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  if (!session.profile) return;
  session.profile.profileImageUrl = profileImageUrl;
  await session.save();
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Choose an image to upload." }, { status: 400 });
    }

    const stored = await uploadMerchantAvatar(user.email, Buffer.from(await file.arrayBuffer()), file.type);
    if ("error" in stored) return Response.json({ error: stored.error }, { status: 400 });

    const saved = await setProfileImageUrl(user.id, stored.url);
    if (saved === null && stored.url) {
      return Response.json({ error: "Could not save your photo." }, { status: 500 });
    }
    await saveSessionPhoto(stored.url);
    return Response.json({ profileImageUrl: stored.url });
  } catch (error) {
    console.error("[api/account/avatar POST]", error);
    return Response.json({ error: "Could not upload your photo." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await deleteMerchantAvatar(user.email);
    await setProfileImageUrl(user.id, null);
    await saveSessionPhoto(null);
    return Response.json({ profileImageUrl: null });
  } catch (error) {
    console.error("[api/account/avatar DELETE]", error);
    return Response.json({ error: "Could not remove your photo." }, { status: 500 });
  }
}
