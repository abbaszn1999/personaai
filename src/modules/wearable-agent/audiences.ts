import type { SerializedTaxonomyScope } from "@/modules/store/mapping/persona-taxonomy";
import type { TryOnAudience } from "./types";

/**
 * The shopper-facing "Who's trying this on?" choices, in display order, each tied to the Persona
 * department a merchant switches on in "Select What You Sell". Client-safe (no server imports):
 * the dashboard preview, the embed page and widget.js all use it.
 */
export const AUDIENCE_DEPARTMENTS: ReadonlyArray<{ audience: TryOnAudience; departmentId: string }> = [
  { audience: "woman", departmentId: "women" },
  { audience: "man", departmentId: "men" },
  { audience: "unisex", departmentId: "unisex" },
  { audience: "kids-boy", departmentId: "kids-boys" },
  { audience: "kids-girl", departmentId: "kids-girls" },
  { audience: "kids-unisex", departmentId: "kids-unisex" },
];

export const ALL_TRY_ON_AUDIENCES: TryOnAudience[] = AUDIENCE_DEPARTMENTS.map((entry) => entry.audience);

/** True for the three kids audiences (boy, girl, unisex). */
export function isKidsAudience(audience: TryOnAudience | string | null | undefined): boolean {
  return typeof audience === "string" && audience.startsWith("kids-");
}

/** Whole years a kids profile may be. */
export const KIDS_AGE_RANGE = { min: 0, max: 17 } as const;

/**
 * The audiences a shopper may pick for this store: exactly the departments the merchant enabled.
 *
 * Returns `null` ("no restriction, show everything") when the merchant has not saved a scope yet,
 * or saved one with no department enabled — an empty question would leave the shopper stuck, and
 * an unconfigured store has not said it sells anything less than everything.
 */
export function onboardingAudiencesForScope(
  scope: Pick<SerializedTaxonomyScope, "configured" | "enabledDeptIds"> | null | undefined,
): TryOnAudience[] | null {
  if (!scope?.configured) return null;
  const enabled = new Set(scope.enabledDeptIds);
  const audiences = AUDIENCE_DEPARTMENTS
    .filter((entry) => enabled.has(entry.departmentId))
    .map((entry) => entry.audience);
  return audiences.length > 0 ? audiences : null;
}

/** Defensive parse of the `audiences` field the public config endpoints return. */
export function parseOnboardingAudiences(value: unknown): TryOnAudience[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const audiences = ALL_TRY_ON_AUDIENCES.filter((audience) => value.includes(audience));
  return audiences.length > 0 ? audiences : undefined;
}
