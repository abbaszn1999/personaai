import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { buildLookFitAnalysis, type FitAnalysisRequest } from "@/lib/recommendations/fit-analysis";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body: FitAnalysisRequest = await req.json().catch(() => ({}));
    const fit = await buildLookFitAnalysis(user.id, body);
    if (!fit) {
      return Response.json({ error: "Products, sizes and shopper measurements are required" }, { status: 400 });
    }
    return Response.json({ fit });
  } catch (error) {
    console.error("[agents/persona/fit-analysis POST]", error);
    return Response.json({ error: "Fit analysis is temporarily unavailable" }, { status: 500 });
  }
}
