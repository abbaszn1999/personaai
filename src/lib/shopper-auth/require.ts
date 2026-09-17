import type { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson } from "@/lib/embed/cors";
import type { EmbedWorkspaceResolution } from "@/lib/db/workspaces";
import { extractBearerToken, resolveShopperSession, type ResolvedShopperSession } from "./session";

export type ShopperEmbedAuth =
  | { workspace: EmbedWorkspaceResolution; session: ResolvedShopperSession; token: string }
  | { error: Response };

/** Shared gate for every authenticated `/api/embed/shopper/*` route: valid embed token, then
 *  a live bearer session that actually belongs to that workspace. Distinguishing *why* a
 *  session is missing (expired vs revoked vs never issued) is never useful to the widget —
 *  every caller treats it as signed-out. */
export async function requireShopperEmbed(
  req: NextRequest,
  embedToken: unknown
): Promise<ShopperEmbedAuth> {
  const resolution = await resolveEmbedRequest(embedToken);
  if ("error" in resolution) return resolution;

  const token = extractBearerToken(req);
  const session = await resolveShopperSession(token);
  if (!token || !session || session.account.workspaceId !== resolution.workspace.workspaceId) {
    return { error: embedJson({ error: "Not signed in" }, { status: 401 }) };
  }

  return { workspace: resolution.workspace, session, token };
}
