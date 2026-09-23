import { NextRequest } from "next/server";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { touchShopperAccountLastSeen } from "@/lib/db/shopper-accounts";
import { listShopperProfiles } from "@/lib/db/shopper-profiles";
import { linkShopperSession, parseEmbedSessionId } from "@/lib/db/shopper-session-links";
import { requireShopperEmbed } from "@/lib/shopper-auth/require";
import { serializeShopperProfile } from "@/lib/shopper-auth/serialize-profile";

export async function OPTIONS() {
  return embedOptions();
}

/** Called on widget load to silently resume a session from a bearer token already saved in
 *  localStorage. Returns the account plus its profiles so the widget can restore avatars and
 *  measurements in one round trip. */
export async function GET(req: NextRequest) {
  try {
    const embedToken = req.nextUrl.searchParams.get("embedToken");
    const auth = await requireShopperEmbed(req, embedToken);
    if ("error" in auth) return auth.error;

    void touchShopperAccountLastSeen(auth.session.account.id);
    const sessionId = parseEmbedSessionId(req.nextUrl.searchParams.get("sessionId"));
    if (sessionId) {
      await linkShopperSession({
        ownerId: auth.workspace.ownerId,
        sessionId,
        shopperAccountId: auth.session.account.id,
      });
    }
    const profiles = (await listShopperProfiles(auth.session.account.id)).map(serializeShopperProfile);

    return embedJson({
      account: {
        id: auth.session.account.id,
        email: auth.session.account.email,
        createdAt: auth.session.account.createdAt,
      },
      profiles,
    });
  } catch (err) {
    console.error("[api/embed/shopper/me GET]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
