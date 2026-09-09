import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { storeContextFor } from "@/lib/catalog/store-context";
import { groupCollections, type CollectionToGroup } from "@/lib/catalog/group-collections";

/**
 * Proposes a two-level hierarchy over a Shopify store's flat collections.
 *
 * Reads the collections off the saved connection rather than taking them from the request, because
 * unlike the parent-mapping classifier there is nothing here the client knows and the server does
 * not — the collection list came from Shopify and is already stored. The request only says which of
 * them still need placing.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const body: unknown = await req.json().catch(() => null);
    const wanted = parseIds(body);
    if (wanted.length === 0) {
      return Response.json({ error: "No collections to group" }, { status: 400 });
    }

    const byId = new Map(connection.categories.map((category) => [category.id, category]));
    const collections: CollectionToGroup[] = [];
    for (const id of wanted) {
      const category = byId.get(id);
      if (category) {
        collections.push({ id, name: category.name, productCount: category.productCount });
      }
    }

    if (collections.length === 0) {
      return Response.json({ error: "None of those collections are on this store" }, { status: 400 });
    }

    const placements = await groupCollections(collections, storeContextFor(connection));

    return Response.json({
      placements: [...placements].map(([id, placement]) => ({ id, ...placement })),
    });
  } catch (err) {
    console.error("[store-connection categories group POST]", err);
    return Response.json({ error: "Could not group these collections" }, { status: 500 });
  }
}

function parseIds(body: unknown): string[] {
  const raw = (body as { collectionIds?: unknown } | null)?.collectionIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}
