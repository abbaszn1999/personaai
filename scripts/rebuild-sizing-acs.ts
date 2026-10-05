/**
 * Re-enqueues complete catalogs after shared sizing charts change so ACS receives the newly
 * resolved sizing payloads. Pass one or more connection ids; unrelated stores are never touched.
 */
import { startCatalogBackfill } from "@/lib/catalog/enqueue-sync";
import { getStoreConnectionById } from "@/lib/db/store-connections";

async function main() {
  const connectionIds = process.argv.slice(2).filter(Boolean);
  if (connectionIds.length === 0) {
    throw new Error("Pass at least one store connection id.");
  }

  for (const connectionId of connectionIds) {
    const connection = await getStoreConnectionById(connectionId);
    if (!connection) throw new Error(`Store connection not found: ${connectionId}`);
    const result = await startCatalogBackfill(connection);
    console.log(
      `${connectionId}: enqueued ${result.enqueued}, pages ${result.pages}, duplicates ${result.duplicates}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
