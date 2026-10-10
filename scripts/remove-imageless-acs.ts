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
import { deleteProduct } from "@/lib/catalog/acs/client";
import { listImagelessMirrorIds } from "@/lib/catalog/acs/mirror";
import { listConnectedStores } from "@/lib/db/store-connections";

const DELETE_CONCURRENCY = 20;

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
    let removed = 0;
    for (let i = 0; i < ids.length; i += DELETE_CONCURRENCY) {
      const results = await Promise.all(ids.slice(i, i + DELETE_CONCURRENCY).map((id) => deleteProduct(id)));
      removed += results.filter(Boolean).length;
    }
    console.log(`  deleted ${removed}, already gone ${ids.length - removed}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
