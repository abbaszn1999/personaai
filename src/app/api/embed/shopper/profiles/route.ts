import { NextRequest } from "next/server";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { createShopperProfile, parseShopperProfileDraft } from "@/lib/db/shopper-profiles";
import { requireShopperEmbed } from "@/lib/shopper-auth/require";
import { serializeShopperProfile } from "@/lib/shopper-auth/serialize-profile";

interface RequestBody {
  embedToken?: string;
  [key: string]: unknown;
}

export async function OPTIONS() {
  return embedOptions();
}

/** Creates one of the account's (at most 3) profiles. The ceiling is enforced here, not in
 *  the widget — a client that skipped its own check still can't store a fourth. */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const auth = await requireShopperEmbed(req, body.embedToken);
    if ("error" in auth) return auth.error;

    const draft = parseShopperProfileDraft(body);
    if ("error" in draft) return embedJson({ error: draft.error }, { status: 400 });

    const created = await createShopperProfile(auth.session.account.id, draft);
    if (!created) {
      return embedJson({ error: "You already have 3 profiles on this store." }, { status: 409 });
    }

    return embedJson({ profile: serializeShopperProfile(created) });
  } catch (err) {
    console.error("[api/embed/shopper/profiles POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
