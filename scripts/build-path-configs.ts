/**
 * Builds (or rebuilds) the Persona path config for one or more store connections.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/build-path-configs.ts <connectionId> [...]
 */
import { rebuildPersonaPathConfig } from "@/lib/catalog/path-config/rebuild";

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("usage: build-path-configs.ts <connectionId> [...]");
    process.exit(1);
  }
  for (const id of ids) {
    const started = Date.now();
    const result = await rebuildPersonaPathConfig(id);
    console.log(id, result ? JSON.stringify(result) : "no result (no connection or no ACS catalog)", `${Date.now() - started}ms`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
