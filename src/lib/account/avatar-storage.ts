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

/** What the file's own first bytes say it is. The browser-supplied type is only a claim, and this
 *  bucket is public, so anything that is not really an image never reaches it. */
function sniffImageExtension(bytes: Buffer): (typeof EXTENSIONS)[number] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export async function uploadMerchantAvatar(
  email: string,
  bytes: Buffer,
  mimeType: string
): Promise<{ url: string } | { error: string }> {
  if (!MIME_TO_EXT[mimeType]) return { error: "Use a JPG, PNG, or WebP image." };
  if (bytes.length === 0) return { error: "That file is empty." };
  if (bytes.length > MAX_BYTES) return { error: "Images must be 2 MB or smaller." };
  const extension = sniffImageExtension(bytes);
  if (!extension) return { error: "That file isn't a valid JPG, PNG, or WebP image." };
  mimeType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;

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
