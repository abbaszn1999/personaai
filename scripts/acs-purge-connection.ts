/**
 * Deletes every ACS product belonging to one connection id.
 *
 * The disconnect route already does this, but only for a connection it can still read from the
 * database. Products stranded by a failed or partial sweep outlive their `store_connections` row,
 * and nothing in the app can reach them afterwards: the id they are tagged with no longer exists
 * anywhere, and reconnecting the same store mints a new one. This is the only way to clean them
 * out of the shared catalog.
 *
 * Destructive and unguarded by design — pass the id explicitly:
 *
 *   npm run acs:purge -- <connectionId>
 */
import { deleteAllAcsProductsForConnection } from "@/lib/catalog/acs/catalog-reads";
import { getAcsConfig } from "@/lib/catalog/acs/config";

async function main() {
  const connectionId = process.argv[2];
  if (!connectionId) {
    throw new Error("Usage: npm run acs:purge -- <connectionId>");
  }

  const config = getAcsConfig();
  console.log(`Purging products for ${connectionId} from ${config.projectId}/${config.catalogId}...`);

  const deleted = await deleteAllAcsProductsForConnection(connectionId);
  console.log(`Deleted ${deleted} product(s).`);

  // A sweep that deletes nothing is ambiguous: either the catalog is already clean, or the search
  // index is still serving products this script deleted on a previous run and every id came back
  // 404. Saying so beats reporting "0" as if it settled the question.
  if (deleted === 0) {
    console.log("Nothing was removed. Either this connection is already clean, or a previous run");
    console.log("just cleared it and ACS's search index has not caught up yet — re-run in a minute.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
