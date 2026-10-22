import { collectCatalogProducts } from "@/lib/catalog/enqueue-sync";
import { createCatalogPager } from "@/lib/catalog/pager";
import { listHeldSyncProductIds, markSyncProductsRemoved } from "@/lib/db/sync-new-products";
import { detectNewProducts, syncHoldActive } from "@/lib/sync/detect";
import { syncConnection } from "@/lib/sync/route-context";

export const maxDuration = 300;

/**
 * "Check for new products": the hourly reconcile's detection, on demand. Walks the selected
 * categories, queues every product ACS has never held, and drops queued products the store no
 * longer sells. Writes nothing to ACS.
 */
export async function POST() {
  try {
    const { connection, response } = await syncConnection({ writing: true });
    if (response) return response;
    if (!(await syncHoldActive(connection.id))) {
      return Response.json(
        { error: "Publish your catalog from Setup first. New products are tracked from then on.", reason: "not_published" },
        { status: 409 },
      );
    }

    const pager = await createCatalogPager(connection);
    if (!pager) {
      return Response.json({ error: "No categories are selected for indexing yet." }, { status: 409 });
    }
    const { messages } = await collectCatalogProducts(connection.id, pager);
    const [detected, waiting] = await Promise.all([
      detectNewProducts(
        connection,
        messages.map((message) => ({ product: message.product, sourceCategoryIds: message.sourceCategoryIds })),
        "manual",
      ),
      listHeldSyncProductIds(connection.id),
    ]);
    if (!detected) return Response.json({ error: "Could not compare the store with the catalog." }, { status: 500 });

    let removed = 0;
    if (waiting) {
      const walked = new Set(messages.map((message) => message.product.externalId));
      const gone = [...waiting].filter((id) => !walked.has(id));
      removed = gone.length;
      if (gone.length > 0) await markSyncProductsRemoved(connection.id, gone);
    }
    return Response.json({ checked: messages.length, found: detected.recorded, removed });
  } catch (error) {
    console.error("[store-connection sync/check POST]", error);
    return Response.json({ error: "Could not check the store for new products." }, { status: 500 });
  }
}
