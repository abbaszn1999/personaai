import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { fetchReferenceImageAsBase64, DecartApiError } from "@/lib/ai/decart";

interface RequestBody {
  imageUrl?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body: RequestBody = await req.json().catch(() => ({}));
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl) {
      return Response.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    const image = await fetchReferenceImageAsBase64(imageUrl);
    return Response.json(image);
  } catch (error) {
    console.error("[api/agents/persona/reference-image POST]", error);
    if (error instanceof DecartApiError) {
      return Response.json({ error: error.message }, { status: error.status ?? 502 });
    }
    return Response.json({ error: "Unable to fetch the reference image" }, { status: 500 });
  }
}
