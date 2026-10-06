import type { Audience } from "./keys";
import {
  isBodyMeasurement,
  measurementsFor,
  requiredMeasurementsFor,
  type Measurement,
  type SizingGroup,
} from "./measurements";

/** Who the Sizing Tester sizes for. */
export type SizingTarget = "men" | "women" | "kid";

export const SIZING_TARGETS: readonly SizingTarget[] = ["men", "women", "kid"];

/** The Persona departments each target shops in: its own and their gender-neutral counterpart. */
export const TARGET_DEPARTMENTS: Record<SizingTarget, readonly string[]> = {
  men: ["men", "unisex"],
  women: ["women", "unisex"],
  kid: ["kids-boys", "kids-girls", "kids-unisex"],
};

/** Every adult audience shares one measurement set and every kids audience another, so one audience
 *  per target is enough to ask `measurementsFor` / `requiredMeasurementsFor`. */
const TARGET_AUDIENCE: Record<SizingTarget, Audience> = { men: "mens", women: "womens", kid: "kids" };

export function isSizingTarget(value: unknown): value is SizingTarget {
  return value === "men" || value === "women" || value === "kid";
}

export function targetAudience(target: SizingTarget): Audience {
  return TARGET_AUDIENCE[target];
}

export function targetIsChild(target: SizingTarget): boolean {
  return target === "kid";
}

/** The body measurements a chart of this category can carry for this target. */
export function targetMeasurements(group: SizingGroup, target: SizingTarget): Measurement[] {
  return measurementsFor(group, targetAudience(target)).filter(isBodyMeasurement);
}

/** The measurements ACS filters this category on for this target (chest for adult tops, height for kids…). */
export function targetRequiredMeasurements(group: SizingGroup, target: SizingTarget): readonly Measurement[] {
  return requiredMeasurementsFor(group, targetAudience(target));
}
