import { NextRequest } from "next/server";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { revokeShopperSession } from "@/lib/shopper-auth/session";
import { requireShopperEmbed } from "@/lib/shopper-auth/require";

interface RequestBody {
  embedToken?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/** Revokes the current session server-side (not just clearing the token client-side) so a
 *  token that leaked before logout can't still be replayed afterwards. */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const auth = await requireShopperEmbed(req, body.embedToken);
    if ("error" in auth) {
      if (auth.error.status === 401) return embedJson({ ok: true });
      return auth.error;
    }

    await revokeShopperSession(auth.token);
    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/shopper/logout POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
