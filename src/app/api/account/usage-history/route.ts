import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getImageGenerationsSince } from "@/lib/db/image-generations";
import { getRealtimeTryOnEventsForOwnerInRange } from "@/lib/db/realtime-tryon-events";

type UsageMetric = "images" | "live_tryon";

function dayKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const metric = req.nextUrl.searchParams.get("metric") as UsageMetric | null;
    if (metric !== "images" && metric !== "live_tryon") {
      return Response.json({ error: "metric must be images or live_tryon" }, { status: 400 });
    }

    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const day = new Date(since);
      day.setUTCDate(day.getUTCDate() + i);
      buckets.set(dayKey(day), 0);
    }

    if (metric === "images") {
      const rows = await getImageGenerationsSince(user.id, since.toISOString(), now.toISOString());
      for (const row of rows) {
        const key = dayKey(row.createdAt);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    } else {
      const rows = await getRealtimeTryOnEventsForOwnerInRange(user.id, since.toISOString(), now.toISOString());
      for (const row of rows) {
        const key = dayKey(row.createdAt);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + row.durationSeconds);
      }
    }

    return Response.json(
      {
        metric,
        points: Array.from(buckets, ([date, value]) => ({ date, value })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/account/usage-history GET]", error);
    return Response.json({ error: "Unable to load usage history" }, { status: 500 });
  }
}
