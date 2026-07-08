import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getOpenaiApiKeyEncrypted, setOpenaiApiKey } from "@/lib/db/users";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/utils/crypto";

/** Never returns the raw key — only whether one is saved and a masked preview. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const encrypted = await getOpenaiApiKeyEncrypted(user.id);
    if (!encrypted) {
      return Response.json({ hasKey: false, maskedKey: null });
    }

    try {
      const decrypted = decryptSecret(encrypted);
      return Response.json({ hasKey: true, maskedKey: maskSecret(decrypted) });
    } catch {
      // Ciphertext exists but can't be decrypted (e.g. secret rotated) — still report as set.
      return Response.json({ hasKey: true, maskedKey: null });
    }
  } catch (err) {
    console.error("[account/api-key GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { apiKey } = await req.json();
    if (typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return Response.json({ error: "Please enter a valid OpenAI API key" }, { status: 400 });
    }

    const trimmed = apiKey.trim();
    const encrypted = encryptSecret(trimmed);
    const ok = await setOpenaiApiKey(user.id, encrypted);

    if (!ok) {
      return Response.json({ error: "Failed to save API key" }, { status: 500 });
    }

    return Response.json({ hasKey: true, maskedKey: maskSecret(trimmed) });
  } catch (err) {
    console.error("[account/api-key PUT]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await setOpenaiApiKey(user.id, null);
    if (!ok) {
      return Response.json({ error: "Failed to remove API key" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account/api-key DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
