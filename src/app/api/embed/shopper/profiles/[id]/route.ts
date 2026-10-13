import { NextRequest } from "next/server";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { deleteShopperProfile, parseShopperProfileDraft, updateShopperProfile } from "@/lib/db/shopper-profiles";
import { requireShopperEmbed } from "@/lib/shopper-auth/require";
import { serializeShopperProfile } from "@/lib/shopper-auth/serialize-profile";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RequestBody {
  embedToken?: string;
  [key: string]: unknown;
}

export async function OPTIONS() {
  return embedOptions();
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: RequestBody = await req.json().catch(() => ({}));
    const auth = await requireShopperEmbed(req, body.embedToken);
    if ("error" in auth) return auth.error;

    const draft = parseShopperProfileDraft(body);
    if ("error" in draft) return embedJson({ error: draft.error }, { status: 400 });

    const updated = await updateShopperProfile(auth.session.account.id, id, draft);
    if (!updated) return embedJson({ error: "Profile not found" }, { status: 404 });

    return embedJson({ profile: serializeShopperProfile(updated) });
  } catch (err) {
    console.error("[api/embed/shopper/profiles PATCH]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: RequestBody = await req.json().catch(() => ({}));
    const auth = await requireShopperEmbed(req, body.embedToken);
    if ("error" in auth) return auth.error;

    const result = await deleteShopperProfile(auth.session.account.id, id);
    if (result === "not-found") return embedJson({ error: "Profile not found" }, { status: 404 });
    if (result === "last-profile") {
      return embedJson({ error: "You need to keep at least one profile." }, { status: 409 });
    }

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/shopper/profiles DELETE]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}