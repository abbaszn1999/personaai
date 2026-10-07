/**
 * Restart onboarding at Mapping for every store still on an older Persona taxonomy.
 *
 *   npx tsx --env-file=.env.local scripts/reset-persona-mappings.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/reset-persona-mappings.ts
 *
 * Leaf ids are a stored contract, and a merged taxonomy leaves old mappings pointing at leaves
 * that no longer exist. Each store is reset exactly like the Mapping tab's "Clear mapping" action,
 * and stamped with the current taxonomy version, so a second run finds nothing to do.
 */
import { listConnectionsBelowTaxonomyVersion } from "@/lib/db/store-connections";
import { resetPersonaMapping } from "@/lib/catalog/persona-mapping-reset";
import { PERSONA_TAXONOMY_VERSION } from "@/modules/store/mapping/persona-taxonomy";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const connections = await listConnectionsBelowTaxonomyVersion(PERSONA_TAXONOMY_VERSION);

  if (connections.length === 0) {
    console.log(`No store is below taxonomy v${PERSONA_TAXONOMY_VERSION}. Nothing to do.`);
    return;
  }

  let failed = 0;
  for (const connection of connections) {
    const mapped = Object.keys(connection.personaCategoryMap).length;
    const label = `${connection.storeUrl} (${connection.id}) v${connection.personaTaxonomyVersion}, ${mapped} mapped categories`;
    if (dryRun) {
      console.log(`[dry run] would reset ${label}`);
      continue;
    }
    const updated = await resetPersonaMapping(connection);
    if (updated) console.log(`reset ${label}`);
    else {
      failed += 1;
      console.error(`FAILED ${label}`);
    }
  }

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
