import { NextRequest } from "next/server";
import { fetchReferenceImageAsBase64, DecartApiError } from "@/lib/ai/decart";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";

interface RequestBody {
  embedToken?: string;
  imageUrl?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const resolution = await resolveEmbedRequest(body.embedToken, "wearable");
    if ("error" in resolution) return resolution.error;

    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!imageUrl) {
      return embedJson({ error: "Missing imageUrl" }, { status: 400 });
    }

    const image = await fetchReferenceImageAsBase64(imageUrl);
    return embedJson(image);
  } catch (error) {
    console.error("[api/embed/persona/reference-image POST]", error);
    if (error instanceof DecartApiError) {
      return embedJson({ error: error.message }, { status: error.status ?? 502 });
    }
    return embedJson({ error: "Unable to fetch the reference image" }, { status: 500 });
  }
}
