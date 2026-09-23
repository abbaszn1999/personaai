import { db } from "@/lib/supabase/server";

const BUCKET = "merchant-avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSIONS = ["jpg", "png", "webp"] as const;

const MIME_TO_EXT: Record<string, (typeof EXTENSIONS)[number]> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Folder name for an email: `hassanmlh7885_at_gmail.com`. */
export function merchantAvatarFolder(email: string): string {
  return email.trim().toLowerCase().replaceAll("@", "_at_");
}

export function merchantAvatarObjectPath(email: string, extension: string): string {
  return `${merchantAvatarFolder(email)}/avatar.${extension}`;
}

export async function uploadMerchantAvatar(
  email: string,
  bytes: Buffer,
  mimeType: string
): Promise<{ url: string } | { error: string }> {
  const extension = MIME_TO_EXT[mimeType];
  if (!extension) return { error: "Use a JPG, PNG, or WebP image." };
  if (bytes.length === 0) return { error: "That file is empty." };
  if (bytes.length > MAX_BYTES) return { error: "Images must be 2 MB or smaller." };

  const folder = merchantAvatarFolder(email);
  if (!folder) return { error: "This account has no email to store a photo under." };

  const path = `${folder}/avatar.${extension}`;
  const contentType = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error("[account/avatar-storage upload]", error);
    return { error: "Could not store that photo." };
  }

  const leftovers = EXTENSIONS.filter((item) => item !== extension).map((item) => `${folder}/avatar.${item}`);
  if (leftovers.length > 0) {
    await db.storage.from(BUCKET).remove(leftovers);
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function deleteMerchantAvatar(email: string): Promise<void> {
  const folder = merchantAvatarFolder(email);
  if (!folder) return;
  const { error } = await db.storage.from(BUCKET).remove(EXTENSIONS.map((item) => `${folder}/avatar.${item}`));
  if (error) console.error("[account/avatar-storage delete]", error);
}
