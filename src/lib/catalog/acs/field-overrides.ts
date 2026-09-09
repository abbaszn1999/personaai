import { createHash } from "crypto";
import type { AcsFieldOverrides, VariantRole } from "@/lib/catalog/option-groups";
import { fieldOverridesAreEmpty } from "@/lib/catalog/option-groups";

/**
 * The approval half of field overrides: fingerprinting an override set and deciding whether the
 * merchant has approved exactly what indexing would use right now.
 *
 * The override types, parsing and name matching live in `@/lib/catalog/option-groups` instead of
 * here, because this module imports `crypto` and the mapping table that renders these overrides is
 * a client component.
 */

/**
 * Deterministic fingerprint of an override set, used only to detect "has this changed since the
 * merchant last approved it" — not a security boundary, so a plain sha256 of a stably-ordered JSON
 * string is enough. Two equal override sets built in different insertion order must hash
 * identically, which is why the keys are sorted first.
 */
export function hashFieldOverrides(overrides: AcsFieldOverrides): string {
  const sortedOptionRoles: Record<string, VariantRole> = {};
  for (const key of Object.keys(overrides.optionRoles).sort()) {
    sortedOptionRoles[key] = overrides.optionRoles[key];
  }

  return createHash("sha256").update(JSON.stringify({ optionRoles: sortedOptionRoles })).digest("hex");
}

/** The subset of `StoreConnectionRow` the approval check needs. Kept as a narrow inline shape
 *  (rather than importing `StoreConnectionRow`) so this module never depends on `lib/db`. */
export interface MappingApprovalState {
  acsMappingApprovedAt: string | null;
  acsMapperVersionApproved: number | null;
  acsFieldOverrides: AcsFieldOverrides;
  acsFieldOverridesApprovedHash: string | null;
}

/**
 * Whether the merchant has approved *exactly* what indexing would use right now: the current mapper
 * code version, and the current field overrides. Either one drifting from what was approved — a
 * `MAPPER_VERSION` bump on deploy, or the merchant saving a new override in Setup Stage 1 — reopens
 * the same gate, so indexing never silently runs on something nobody has seen.
 *
 * The only implementation of this check. Two more used to exist (a version-only copy in the
 * store-connection route and an inline one in the mapping-preview GET), which meant a merchant
 * could be blocked by one and waved through by another depending on which route they hit.
 *
 * `currentMapperVersion` is a parameter rather than an import to avoid a cycle: `map-product.ts`
 * (which defines `MAPPER_VERSION`) imports this module, so this module cannot import it back.
 */
export function hasApprovedCurrentMapping(connection: MappingApprovalState, currentMapperVersion: number): boolean {
  // Rows approved before field overrides existed have no hash. Treat that legacy null as approval
  // of the default override set only; any real manual change still closes the gate.
  const overridesMatch =
    connection.acsFieldOverridesApprovedHash === hashFieldOverrides(connection.acsFieldOverrides) ||
    (connection.acsFieldOverridesApprovedHash === null && fieldOverridesAreEmpty(connection.acsFieldOverrides));

  return (
    connection.acsMappingApprovedAt !== null &&
    connection.acsMapperVersionApproved === currentMapperVersion &&
    overridesMatch
  );
}
