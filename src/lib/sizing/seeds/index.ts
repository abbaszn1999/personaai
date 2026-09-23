import { TOMMY_HILFIGER_SEED } from "./tommy-hilfiger";
import { TOMMY_HILFIGER_KIDS_SEED } from "./tommy-hilfiger-kids";
import type { SeedChart } from "./types";

/**
 * Every hand-verified global chart, keyed by brand.
 *
 * Keyed rather than a flat list so the loader can seed one brand at a time: these are written into a
 * registry every merchant reads, and a bad transcription should be fixable without republishing the
 * others.
 */
export const CHART_SEEDS: Record<string, SeedChart[]> = {
  tommy_hilfiger: [...TOMMY_HILFIGER_SEED, ...TOMMY_HILFIGER_KIDS_SEED],
};

export const SEEDED_BRAND_KEYS = Object.keys(CHART_SEEDS);

export function allSeedCharts(): SeedChart[] {
  return Object.values(CHART_SEEDS).flat();
}

export type { SeedChart } from "./types";
