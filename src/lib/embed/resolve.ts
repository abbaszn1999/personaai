import { createHash } from "node:crypto";
import { getWorkspaceByEmbedToken, type EmbedWorkspaceResolution } from "@/lib/db/workspaces";
import { allowEmbedRequest, type EmbedRequestKind } from "@/lib/embed/rate-limiter";
import { embedJson } from "@/lib/embed/cors";
import { extractBearerToken, resolveShopperSession, type ResolvedShopperSession } from "@/lib/shopper-auth/session";

function clientKeyFor(req: Request | undefined): string {
  if (!req) return "anonymous";
  const bearer = extractBearerToken(req);
  if (bearer) return `s:${createHash("sha256").update(bearer).digest("hex").slice(0, 32)}`;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwarded || req.headers.get("x-real-ip")?.trim() || "unknown"}`;
}

/**
 * Shared resolution used by every `/api/embed/*` POST route: validates the token, checks it's
 * enabled, and applies the rate limit for the request's kind — all before any AI or store work.
 *
 * `paid` requests (chat turns, image generation, live try-on) also need the signed-in shopper's
 * session for this store. The embed token is public — it sits in the merchant's page source — so on
 * its own it must not be able to spend the merchant's wallet; the widget only reaches these calls
 * after the shopper has signed in with an emailed code.
 *
 * Returns either the resolved workspace or a ready-to-return error `Response`.
 */
export async function resolveEmbedRequest(
  embedToken: unknown,
  options: { req?: Request; kind?: EmbedRequestKind } = {},
): Promise<{ workspace: EmbedWorkspaceResolution; shopper: ResolvedShopperSession | null } | { error: Response }> {
  if (typeof embedToken !== "string" || !embedToken) {
    return { error: embedJson({ error: "Missing embed token" }, { status: 400 }) };
  }

  const kind = options.kind ?? "standard";
  if (!allowEmbedRequest(embedToken, { kind, clientKey: clientKeyFor(options.req) })) {
    return { error: embedJson({ error: "Too many requests — please slow down." }, { status: 429 }) };
  }

  const workspace = await getWorkspaceByEmbedToken(embedToken);
  if (!workspace) {
    return { error: embedJson({ error: "Invalid embed token" }, { status: 404 }) };
  }
  if (!workspace.embedEnabled) {
    return { error: embedJson({ error: "Embedding is disabled for this workspace" }, { status: 403 }) };
  }

  if (kind !== "paid") return { workspace, shopper: null };

  const shopper = options.req ? await resolveShopperSession(extractBearerToken(options.req)) : null;
  if (!shopper || shopper.account.workspaceId !== workspace.workspaceId) {
    return {
      error: embedJson(
        { error: "Please sign in again to continue.", code: "shopper_signed_out" },
        { status: 401 },
      ),
    };
  }
  return { workspace, shopper };
}
