import { getWorkspaceByEmbedToken, type EmbedWorkspaceResolution } from "@/lib/db/workspaces";
import { allowEmbedRequest } from "@/lib/embed/rate-limiter";
import { embedJson } from "@/lib/embed/cors";

/**
 * Shared resolution used by every `/api/embed/*` POST route: validates the token, checks it's
 * enabled, and applies the per-token rate limit — all before any OpenAI/store work happens.
 * Returns either the resolved workspace or a ready-to-return error `Response`.
 */
export async function resolveEmbedRequest(
  embedToken: unknown
): Promise<{ workspace: EmbedWorkspaceResolution } | { error: Response }> {
  if (typeof embedToken !== "string" || !embedToken) {
    return { error: embedJson({ error: "Missing embed token" }, { status: 400 }) };
  }

  if (!allowEmbedRequest(embedToken)) {
    return { error: embedJson({ error: "Too many requests — please slow down." }, { status: 429 }) };
  }

  const workspace = await getWorkspaceByEmbedToken(embedToken);
  if (!workspace) {
    return { error: embedJson({ error: "Invalid embed token" }, { status: 404 }) };
  }
  if (!workspace.embedEnabled) {
    return { error: embedJson({ error: "Embedding is disabled for this workspace" }, { status: 403 }) };
  }

  return { workspace };
}
