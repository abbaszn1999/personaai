/**
 * One-time (idempotent) setup for a fresh ACS catalog: registers the custom attributes this app's
 * isolation and scope filters depend on. Run after pointing `ACS_*` env vars at a new catalog, and
 * before the first product import — an unregistered catalog rejects every scoped query.
 *
 *   npm run acs:bootstrap
 */
import { ensureAcsCatalogAttributes } from "@/lib/catalog/acs/attributes-config";
import { getAcsConfig } from "@/lib/catalog/acs/config";

async function main() {
  const config = getAcsConfig();
  console.log(`Registering catalog attributes on ${config.projectId}/${config.catalogId}...`);

  const labels = {
    created: "registered",
    "configuration-refreshed": "configuration refreshed",
    "retrievable-enabled": "made retrievable",
  };
  for (const result of await ensureAcsCatalogAttributes()) {
    console.log(`  ${labels[result.status]}: ${result.key}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
