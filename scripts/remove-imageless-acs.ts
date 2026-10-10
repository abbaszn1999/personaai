/**
 * One-time cleanup: deletes from ACS every product of every connected store that has no image on any
 * of its records. Products without an image are never written any more (see `writeProducts` in
 * `src/lib/catalog/acs/sync.ts`); this removes the ones written before that rule.
 *
 *   pnpm dlx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/remove-imageless-acs.ts [--dry-run]
 *
 * Reads each store's mirror of what it holds in ACS; a store whose mirror is not trusted is skipped
 * and reported, and the next full walk reconciles it before this is run again.
 */
import { listImagelessMirrorIds } from "@/lib/catalog/acs/mirror";
import { deleteAcsDocuments } from "@/lib/catalog/acs/sync";
import { listConnectedStores } from "@/lib/db/store-connections";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const stores = await listConnectedStores();
  for (const store of stores) {
    const ids = await listImagelessMirrorIds(store.id);
    if (ids === null) {
      console.log(`${store.id} ${store.storeUrl}: mirror not trusted, skipped`);
      continue;
    }
    console.log(`${store.id} ${store.storeUrl}: ${ids.length} imageless document(s)${dryRun ? " (dry run)" : ""}`);
    if (dryRun) continue;
    const removed = await deleteAcsDocuments(store.id, ids);
    console.log(`  removed ${removed}, left ${ids.length - removed} (logged above)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
