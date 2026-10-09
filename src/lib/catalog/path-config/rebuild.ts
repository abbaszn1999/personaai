import { readMirrorDocuments } from "@/lib/catalog/acs/mirror";
import { readConnectionCatalog } from "@/lib/catalog/acs/stage-five-listing";
import { isAcsConfigured } from "@/lib/catalog/acs/config";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import { getStoreConnectionById } from "@/lib/db/store-connections";
import { brandFamilyKey } from "@/lib/sizing/brand-mapping";
import {
  getPersonaPathConfig,
  listStalePersonaPathConfigIds,
  markPersonaPathConfigFresh,
  markPersonaPathConfigStale,
  savePersonaPathConfig,
  updatePersonaPathConfigData,
} from "@/lib/db/persona-path-configs";
import { PERSONA_TAXONOMY_VERSION } from "@/modules/store/mapping/persona-taxonomy";
import { buildPathConfig, pathConfigFingerprint } from "./build";
import { renderPathConfig } from "./render";

export interface RebuildResult {
  connectionId: string;
  changed: boolean;
  leafCount: number;
  inStock: number;
}

/** Rebuilds already in flight, so a settle, a reconcile tick and a chat turn cannot start three
 *  full catalog walks for the same store at once. */
const inFlight = new Map<string, Promise<RebuildResult | null>>();

/** The store's ACS documents: from its mirror when that is trusted, otherwise a walk of the shared
 *  catalog, which also reconciles the mirror for the next rebuild. */
async function readCatalog(connectionId: string) {
  const mirrored = await readMirrorDocuments(connectionId);
  if (mirrored) return mirrored;
  const run = await getLatestSizingRun(connectionId);
  return readConnectionCatalog(connectionId, { publishedAt: run?.publishedAt ?? null });
}

/**
 * Rebuilds one store's path config from its ACS documents, with its brands grouped the way the
 * store's brand mapping groups them.
 *
 * An unchanged fingerprint leaves the row alone. A change only validation can see (sizes) rewrites
 * the config but keeps the Gemini cache, since the cached prefix is the unchanged text; only a
 * change in the text itself drops the cache.
 */
export function rebuildPersonaPathConfig(connectionId: string): Promise<RebuildResult | null> {
  const existing = inFlight.get(connectionId);
  if (existing) return existing;

  const run = (async (): Promise<RebuildResult | null> => {
    if (!isAcsConfigured()) return null;
    const [products, connection] = await Promise.all([readCatalog(connectionId), getStoreConnectionById(connectionId)]);
    const mapping = connection?.sizingBrandMapping;
    const config = buildPathConfig(products, mapping ? { brandFamily: (brand) => brandFamilyKey(brand, mapping) } : {});
    const renderedText = renderPathConfig(config);
    const fingerprint = pathConfigFingerprint(renderedText, PERSONA_TAXONOMY_VERSION, config);
    const leafCount = config.nodes.filter((node) => node.level === "leaf").length;

    const stored = await getPersonaPathConfig(connectionId);
    if (stored && stored.fingerprint === fingerprint) {
      if (stored.staleAt) await markPersonaPathConfigFresh(connectionId);
      return { connectionId, changed: false, leafCount, inStock: config.inStock };
    }

    const input = { connectionId, config, renderedText, fingerprint, taxonomyVersion: PERSONA_TAXONOMY_VERSION };
    if (stored && stored.renderedText === renderedText) await updatePersonaPathConfigData(input);
    else await savePersonaPathConfig(input);
    console.log(`[path-config] rebuilt ${connectionId}: ${leafCount} leaves, ${config.inStock} in stock`);
    return { connectionId, changed: true, leafCount, inStock: config.inStock };
  })()
    .catch((error) => {
      console.error("[path-config rebuild]", connectionId, error);
      return null;
    })
    .finally(() => inFlight.delete(connectionId));

  inFlight.set(connectionId, run);
  return run;
}

/** Fire-and-forget variant for request paths that must not wait on a catalog walk. */
export function scheduleRebuildPersonaPathConfig(connectionId: string): void {
  void rebuildPersonaPathConfig(connectionId);
}

const SOON_MS = 30_000;
const soon = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Flags the store's config stale and rebuilds it shortly after, once a burst of changes (a bulk
 * edit firing one webhook per product) has gone quiet. The flag stays the guarantee: if this
 * process stops before the timer fires, the next chat turn or the hourly reconcile rebuilds it.
 */
export async function markPathConfigStale(connectionId: string): Promise<void> {
  await markPersonaPathConfigStale(connectionId);
  clearTimeout(soon.get(connectionId));
  const timer = setTimeout(() => {
    soon.delete(connectionId);
    scheduleRebuildPersonaPathConfig(connectionId);
  }, SOON_MS);
  timer.unref?.();
  soon.set(connectionId, timer);
}

const STALE_REBUILD_BATCH = 10;
const STALE_REBUILD_BUDGET_MS = 120_000;

/**
 * Drains stale rows, oldest first, until none are left or the time budget runs out — invoked from
 * the hourly reconcile cron. Each row is tried once per call, so one that keeps failing cannot
 * spin the loop.
 */
export async function rebuildStalePathConfigs(budgetMs = STALE_REBUILD_BUDGET_MS): Promise<RebuildResult[]> {
  const deadline = Date.now() + budgetMs;
  const attempted = new Set<string>();
  const results: RebuildResult[] = [];
  while (Date.now() < deadline) {
    const ids = (await listStalePersonaPathConfigIds(attempted.size + STALE_REBUILD_BATCH)).filter(
      (id) => !attempted.has(id)
    );
    if (ids.length === 0) break;
    for (const id of ids) {
      if (Date.now() >= deadline) break;
      attempted.add(id);
      const result = await rebuildPersonaPathConfig(id);
      if (result) results.push(result);
    }
  }
  return results;
}
