import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { BackdropUploadError, storeCustomBackdrop } from "@/lib/uploads/backdrop-cache";

interface UploadBackdropBody {
  imageBase64?: string;
  mimeType?: string;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: UploadBackdropBody = await req.json().catch(() => ({}));
  if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
    return Response.json({ error: "An image is required" }, { status: 400 });
  }
  if (typeof body.mimeType !== "string" || !body.mimeType) {
    return Response.json({ error: "Missing image mime type" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(body.imageBase64, "base64");
    const id = storeCustomBackdrop(buffer, body.mimeType);
    return Response.json({ url: `/api/uploads/backdrop/${id}` });
  } catch (err) {
    if (err instanceof BackdropUploadError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[api/uploads/backdrop POST]", err);
    return Response.json({ error: "Failed to upload background" }, { status: 500 });
  }
}
