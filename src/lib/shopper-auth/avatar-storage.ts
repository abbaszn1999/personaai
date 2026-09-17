import { db } from "@/lib/supabase/server";

const BUCKET = "shopper-avatars";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/** Turns a generated avatar (almost always a multi-MB `data:` URL) into a stable public URL
 *  we can store on `shopper_profiles.avatar_url`. Putting the bytes in Postgres would balloon
 *  every list/me response; putting them in Storage keeps the profile row small and lets the
 *  same avatar load on a second device without re-generating it. Studio backdrop paths
 *  (`/avatars/backgrounds/...`) and already-hosted URLs pass through unchanged. */
export async function persistShopperAvatar(
  accountId: string,
  profileId: string,
  avatarUrl: string | null
): Promise<string | null> {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("blob:")) return null;
  if (!avatarUrl.startsWith("data:")) return avatarUrl;

  const match = /^data:([^;]+);base64,(.+)$/.exec(avatarUrl);
  if (!match) return null;

  const mimeType = match[1];
  if (!ALLOWED_TYPES.has(mimeType)) return null;

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

  const path = `${accountId}/${profileId}.${extensionFor(mimeType)}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[shopper-auth persistShopperAvatar]", error);
    return null;
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so a regenerated avatar isn't stuck behind the previous object's CDN cache.
  return `${data.publicUrl}?v=${Date.now()}`;
}
