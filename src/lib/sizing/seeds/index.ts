import { TOMMY_HILFIGER_SEED } from "./global-brands/tommy-hilfiger";
import { TOMMY_HILFIGER_KIDS_SEED } from "./global-brands/tommy-hilfiger-kids";
import { PENTI_SEED } from "./global-brands/penti";
import { TOM_TAILOR_SEED } from "./global-brands/tom-tailor";
import { XINT_SEED } from "./global-brands/xint";
import type { SeedChart } from "./types";
import {
  manifestFromSeed,
  sourceTableIdFor,
  sourceVerificationFor,
  type BrandSourceManifest,
} from "./manifest";
import { variantTags } from "@/lib/sizing/variant-match";

function enriched(charts: SeedChart[]): SeedChart[] {
  return charts.map((chart) => {
    const inferredFit = variantTags(chart.variantName).fit[0];
    const inferredAgeBand =
      /\binfant\b/i.test(chart.variantName)
        ? { minMonths: 0, maxMonths: 24, label: "Infant" }
        : /\b(?:boys|girls|kids|children)\b/i.test(chart.variantName)
          ? { minMonths: 24, maxMonths: 216, label: "Children" }
          : undefined;
    return {
      ...chart,
      sourceTableId: sourceTableIdFor(chart),
      applicability: {
        ...(chart.applicability ?? {}),
        ...(inferredFit && !chart.applicability?.fitClass ? { fitClass: inferredFit } : {}),
        ...(inferredAgeBand && !chart.applicability?.ageBand ? { ageBand: inferredAgeBand } : {}),
      },
      sourceVerification: sourceVerificationFor(chart),
    };
  });
}

/**
 * Every hand-verified global chart, keyed by brand.
 *
 * Keyed rather than a flat list so the loader can seed one brand at a time: these are written into a
 * registry every merchant reads, and a bad transcription should be fixable without republishing the
 * others.
 */
export const CHART_SEEDS: Record<string, SeedChart[]> = {
  tommy_hilfiger: enriched([...TOMMY_HILFIGER_SEED, ...TOMMY_HILFIGER_KIDS_SEED]),
  penti: enriched(PENTI_SEED),
  tom_tailor: enriched(TOM_TAILOR_SEED),
  xint: enriched(XINT_SEED),
};

/**
 * Official tables that exist on a brand's source but cannot be stored as charts. Listed so the
 * inventory is the whole source, not just what happened to be transcribed.
 */
const UNMODELLED_SOURCE_TABLES: Record<string, BrandSourceManifest["tables"]> = {
  tom_tailor: [
    {
      sourceTableId: "belts",
      sourceTitle: "Belts",
      sourceUrl: "https://www.tom-tailor.eu/en/size-guides",
      audience: "unisex",
      sizingCategory: "bottoms",
      applicability: {},
      decidingMeasurements: [],
      coversLeaves: [],
      expectedLabels: { primary: ["80", "85", "90", "95", "100", "105", "110", "115", "120", "125", "130", "135", "140", "145", "150"] },
      verification: { verifiedAt: "2026-10-05", status: "verified", locale: "en-EU" },
      state: "unsupported",
      reason:
        "Belt sizes are 80-150 by waist (76-154 cm) and total length (95-165 cm). Belts are an accessory: Persona has no belt leaf and the sizing model has no accessory group, so there is nothing a chart could be attached to.",
    },
  ],
};

/** Executable source inventories. Kept brand-scoped so one brand can be verified and released. */
export const GLOBAL_BRAND_MANIFESTS: Record<string, BrandSourceManifest> = Object.fromEntries(
  Object.entries(CHART_SEEDS).map(([brandKey, charts]) => {
    const manifest = manifestFromSeed(brandKey, charts);
    manifest.tables.push(...(UNMODELLED_SOURCE_TABLES[brandKey] ?? []));
    return [brandKey, manifest];
  }),
);

export function allSeedCharts(): SeedChart[] {
  return Object.values(CHART_SEEDS).flat();
}

export type { SeedChart } from "./types";
export type { BrandSourceManifest, SourceManifestTable } from "./manifest";
