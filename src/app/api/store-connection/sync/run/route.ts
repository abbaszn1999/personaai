import { listRunSyncProducts } from "@/lib/db/sync-new-products";
import { currentSyncRun, syncConnection } from "@/lib/sync/route-context";

/**
 * The sync the board is on, polled while it works: the run row and what its products are doing.
 * `run` is null on a store that has never synced.
 */
export async function GET() {
  try {
    const { connection, response } = await syncConnection();
    if (response) return response;
    const run = await currentSyncRun(connection.id);
    if (!run) return Response.json({ run: null, products: null });

    const products = await listRunSyncProducts(run.id);
    const kept = products.filter((product) => product.status !== "removed");
    const newBrands = new Map<string, string>();
    for (const product of kept) {
      if (product.brandWasNew && product.brandKey !== "" && !newBrands.has(product.brandKey)) {
        newBrands.set(product.brandKey, product.brandLabel ?? product.brandKey);
      }
    }
    return Response.json({
      run,
      products: {
        total: kept.length,
        removed: products.length - kept.length,
        published: kept.filter((product) => product.status === "published").length,
        newBrands: [...newBrands.entries()].map(([key, name]) => ({ key, name })),
      },
    });
  } catch (error) {
    console.error("[store-connection sync/run GET]", error);
    return Response.json({ error: "Could not load the sync." }, { status: 500 });
  }
}
