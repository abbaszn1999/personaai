import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { upsertShopperAccount } from "@/lib/db/shopper-accounts";
import { GUEST_EMAIL, GUEST_SESSION_TTL_MS } from "@/lib/shopper-auth/guest";
import { issueShopperSession } from "@/lib/shopper-auth/session";

interface RequestBody {
  embedToken?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/** "Continue as guest": a session with no email, no saved profiles and a day's lifetime. The widget
 *  keeps the token in the tab's own storage, so closing the tab ends the visit. The session is not
 *  linked to the shared guest account, so each guest is their own anonymous line in the usage page. */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken, { req, kind: "auth" });
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const account = await upsertShopperAccount(workspace.workspaceId, GUEST_EMAIL, false);
    if (!account) {
      return embedJson({ error: "Couldn't start a guest session — please try again." }, { status: 500 });
    }

    const token = await issueShopperSession(account.id, req.headers.get("user-agent"), GUEST_SESSION_TTL_MS);
    return embedJson({
      token,
      account: { id: account.id, email: "", createdAt: account.createdAt, isGuest: true },
      profiles: [],
    });
  } catch (err) {
    console.error("[api/embed/shopper/guest POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
