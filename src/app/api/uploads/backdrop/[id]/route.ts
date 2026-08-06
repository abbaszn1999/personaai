import { NextRequest } from "next/server";
import { getCustomBackdrop } from "@/lib/uploads/backdrop-cache";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getCustomBackdrop(id);
  if (!entry) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(entry.data), {
    headers: {
      "Content-Type": entry.mimeType,
      // Ephemeral by design — never cache a URL that can silently start 404ing after a restart.
      "Cache-Control": "no-store",
    },
  });
}
