import { createHash } from "crypto";
import { acsMappingIsEmpty, columnKey, type AcsFieldMapping } from "@/lib/catalog/acs-mapping";

/**
 * The approval half of the Stage 1 mapping: fingerprinting a mapping and deciding whether the
 * merchant has approved exactly what indexing would use right now.
 *
 * The mapping types, parsing and name matching live in `@/lib/catalog/acs-mapping` and
 * `@/lib/catalog/option-groups` instead of here, because this module imports `crypto` and the table
 * that renders the mapping is a client component.
 */

/**
 * Deterministic fingerprint of a mapping, used only to detect "has this changed since the merchant
 * last approved it" — not a security boundary, so a plain sha256 of a stably-ordered JSON string is
 * enough. Two equal mappings built in different insertion order must hash identically, which is why
 * every key is sorted first.
 *
 * Covers all three parts of the document. An earlier version hashed `optionRoles` alone, which meant
 * a merchant could repoint `brands[0]` at another column and index it without the gate ever
 * reopening — the one thing this function exists to prevent.
 */
export function hashFieldOverrides(mapping: AcsFieldMapping): string {
  const sources: [string, string][] = Object.keys(mapping.sources)
    .sort()
    .map((acsKey) => [acsKey, columnKey(mapping.sources[acsKey])]);

  const optionRoles: [string, string][] = Object.keys(mapping.optionRoles)
    .sort()
    .map((group) => [group, mapping.optionRoles[group]]);

  const customAttributes = [...mapping.customAttributes]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((attribute) => [attribute.key, attribute.type, columnKey(attribute.source)]);

  return createHash("sha256").update(JSON.stringify({ sources, optionRoles, customAttributes })).digest("hex");
}

/** The subset of `StoreConnectionRow` the approval check needs. Kept as a narrow inline shape
 *  (rather than importing `StoreConnectionRow`) so this module never depends on `lib/db`. */
export interface MappingApprovalState {
  acsMappingApprovedAt: string | null;
  acsMapperVersionApproved: number | null;
  acsFieldMapping: AcsFieldMapping;
  acsFieldOverridesApprovedHash: string | null;
}

/**
 * Whether the merchant has approved *exactly* what indexing would use right now: the current mapper
 * code version, and the current mapping. Either one drifting from what was approved — a
 * `MAPPER_VERSION` bump on deploy, or the merchant saving a new binding in Setup Stage 1 — reopens
 * the same gate, so indexing never silently runs on something nobody has seen.
 *
 * The only implementation of this check. Two more used to exist (a version-only copy in the
 * store-connection route and an inline one in the mapping-preview GET), which meant a merchant could
 * be blocked by one and waved through by another depending on which route they hit.
 *
 * `currentMapperVersion` is a parameter rather than an import to avoid a cycle: `map-product.ts`
 * (which defines `MAPPER_VERSION`) imports this module, so this module cannot import it back.
 */
export function hasApprovedCurrentMapping(connection: MappingApprovalState, currentMapperVersion: number): boolean {
  // Rows approved before the mapping was fingerprinted have no hash. Treat that legacy null as
  // approval of the default mapping only; any real manual change still closes the gate.
  const mappingMatches =
    connection.acsFieldOverridesApprovedHash === hashFieldOverrides(connection.acsFieldMapping) ||
    (connection.acsFieldOverridesApprovedHash === null && acsMappingIsEmpty(connection.acsFieldMapping));

  return (
    connection.acsMappingApprovedAt !== null &&
    connection.acsMapperVersionApproved === currentMapperVersion &&
    mappingMatches
  );
}
