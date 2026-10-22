import { buildSyncSummary } from "@/lib/sync/summary";
import { syncConnection } from "@/lib/sync/route-context";

const PAGE_SIZE = 20;

function pageParam(params: URLSearchParams, name: string): number {
  const value = Number(params.get(name));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * The Sync dashboard: the products waiting for a sync, each placed against the store's current
 * brands and charts, and Sync History. Read on every visit and after every sync action; nothing in
 * it is cached, because the queue is what webhooks change while the merchant watches.
 */
export async function GET(request: Request) {
  try {
    const { connection, response } = await syncConnection();
    if (response) return response;
    const params = new URL(request.url).searchParams;
    return Response.json(
      await buildSyncSummary(connection, {
        offset: pageParam(params, "offset"),
        limit: PAGE_SIZE,
        historyOffset: pageParam(params, "historyOffset"),
        historyLimit: PAGE_SIZE,
      }),
    );
  } catch (error) {
    console.error("[store-connection sync/summary GET]", error);
    return Response.json({ error: "Could not load the sync queue." }, { status: 500 });
  }
}
