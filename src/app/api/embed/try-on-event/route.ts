import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { recordTryOnEvents } from "@/lib/db/try-on-events";

interface RequestItem {
  productId?: string;
  productName?: string;
  recommendedSize?: string;
}

interface RequestBody {
  embedToken?: string;
  sessionId?: string;
  generationId?: string;
  items?: RequestItem[];
}

export async function OPTIONS() {
  return embedOptions();
}

/**
 * Public, unauthenticated log of the garments shown in one virtual try-on render (button or
 * chat-triggered) — fired from the shopper's own browser right after the render completes.
 * Powers the "Virtual Try-On Insights" card on the analytics page; never store-wide data.
 */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const generationId = typeof body.generationId === "string" ? body.generationId.trim() : "";
    const items = Array.isArray(body.items) ? body.items : [];

    if (!sessionId || !generationId || items.length === 0) {
      return embedJson({ error: "Missing required try-on event fields" }, { status: 400 });
    }

    const cleanItems = items
      .map((item) => ({
        productId: typeof item.productId === "string" ? item.productId.trim() : "",
        productName: typeof item.productName === "string" ? item.productName.trim() : "",
        recommendedSize: typeof item.recommendedSize === "string" && item.recommendedSize.trim() ? item.recommendedSize.trim() : "M",
      }))
      .filter((item) => item.productId && item.productName);

    if (cleanItems.length === 0) {
      return embedJson({ error: "Missing required try-on event fields" }, { status: 400 });
    }

    await recordTryOnEvents({
      workspaceId: workspace.workspaceId,
      sessionId,
      generationId,
      items: cleanItems,
    });

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/try-on-event POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
