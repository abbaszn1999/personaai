import { createHash } from "node:crypto";
import type { RawCatalogProduct } from "./sync-types";

/** Key order must not matter: a product that went through the queue's JSON column comes back with
 *  its keys in whatever order the database stores them, and must still hash as it did going in. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

/** The connection settings that decide what a product is written to ACS as, besides the product. */
export interface SourceHashConfig {
  personaTaxonomyScope?: unknown;
  personaCategoryMap?: unknown;
  acsFieldMapping?: unknown;
  sizingBrandMapping?: unknown;
  storeSizeSettings?: unknown;
}

/**
 * Bump whenever the mapper starts writing something new onto every record (2: the
 * `persona_has_image` flag). Every stored hash then stops matching, so the next reconcile writes
 * each product again and the new field reaches the whole catalog without a publish.
 */
const ACS_RECORD_REVISION = 2;

/**
 * Fingerprints everything besides the product itself that changes what gets written: the publish
 * run (it is stamped on every document and moves whenever charts or sizing are rebuilt) and the
 * mapping and sizing settings. A product whose own data is untouched must still be written again
 * once any of these moves, so it is part of every product's hash.
 */
export function sourceConfigKey(connection: SourceHashConfig, publishId: string | null): string {
  return sha256({
    revision: ACS_RECORD_REVISION,
    publishId,
    scope: connection.personaTaxonomyScope ?? null,
    map: connection.personaCategoryMap ?? null,
    fields: connection.acsFieldMapping ?? null,
    brands: connection.sizingBrandMapping ?? null,
    sizes: connection.storeSizeSettings ?? null,
  });
}

/**
 * Fingerprints one product as the sync walk saw it, together with the categories it was found
 * under and the settings it is written with. Equal hashes mean ACS already holds exactly what a
 * new import would write, which is what lets the hourly reconcile skip it.
 */
export function computeSourceHash(
  product: RawCatalogProduct,
  sourceCategoryIds: readonly string[],
  configKey: string,
): string {
  return sha256({ configKey, product, categories: [...sourceCategoryIds].sort() });
}
