import { NextRequest } from "next/server";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { buildLookFitAnalysis, type FitAnalysisRequest } from "@/lib/recommendations/fit-analysis";

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  try {
    const body: FitAnalysisRequest & { embedToken?: unknown } = await req.json().catch(() => ({}));
    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;

    const fit = await buildLookFitAnalysis(resolution.workspace.ownerId, body);
    if (!fit) {
      return embedJson(
        { error: "Products, sizes and shopper measurements are required" },
        { status: 400 }
      );
    }
    return embedJson({ fit });
  } catch (error) {
    console.error("[embed/persona/fit-analysis POST]", error);
    return embedJson({ error: "Fit analysis is temporarily unavailable" }, { status: 500 });
  }
}
