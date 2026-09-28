import { TOMMY_HILFIGER_SEED } from "./global-brands/tommy-hilfiger";
import { TOMMY_HILFIGER_KIDS_SEED } from "./global-brands/tommy-hilfiger-kids";
import { PENTI_SEED } from "./global-brands/penti";
import { TOM_TAILOR_SEED } from "./global-brands/tom-tailor";
import { XINT_SEED } from "./global-brands/xint";
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
  penti: PENTI_SEED,
  tom_tailor: TOM_TAILOR_SEED,
  xint: XINT_SEED,
};

export function allSeedCharts(): SeedChart[] {
  return Object.values(CHART_SEEDS).flat();
}

export type { SeedChart } from "./types";
