import { getWorkspaceByEmbedToken } from "@/lib/db/workspaces";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { canUsePaidPlatform, getAccountBillingContext } from "@/lib/billing/account";

interface RouteParams { params: Promise<{ token: string }> }

export async function OPTIONS() {
  return embedOptions();
}

/** Public, unauthenticated config lookup used by both the widget bootstrap and the
 *  standalone `/embed/[token]` page — returns only branding/display fields, never the
 *  workspace id or owner id. */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    const workspace = await getWorkspaceByEmbedToken(token);

    if (!workspace || !workspace.embedEnabled) {
      return embedJson({ error: "Invalid or disabled embed token" }, { status: 404 });
    }
    const billing = await getAccountBillingContext(workspace.ownerId);
    if (!billing || !canUsePaidPlatform(billing)) {
      return embedJson({ error: "This assistant subscription is inactive" }, { status: 402 });
    }

    return embedJson({
      mode: workspace.mode,
      branding: workspace.branding,
    });
  } catch (err) {
    console.error("[api/embed/workspace GET]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
