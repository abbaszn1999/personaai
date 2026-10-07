import { describe, expect, it } from "vitest";
import type { SizingChartRow } from "@/lib/db/sizing-charts";
import { personaSizingGroup } from "@/modules/store/mapping/persona-taxonomy";
import { CHART_SEEDS } from "./index";
import { UNSUPPORTED_SOURCES } from "./unsupported-sources";
import {
  resolveProductChart,
  type ProductChartStatus,
  type SizingResolutionContext,
} from "../product-chart";
import { audienceHintFor } from "../keys";

/**
 * The demand-based completeness check that replaced the parent-level seed-coverage test.
 *
 * Every row is a stock format observed in a real connected catalog (leaf + the exact "available
 * sizes" string). A global chart set is complete for a brand only if each of these resolves to ONE
 * chart, or is explicitly recorded as `unsupported-source` with a reason. `no-chart`, `ambiguous`
 * and `sizes-unresolved` are never acceptable outcomes for observed demand.
 *
 * When a store brings new stock formats, add them here first, then fix the seeds.
 */
const context: SizingResolutionContext = {
  brandTypes: new Map(
    ["tom_tailor", "penti", "tommy_hilfiger", "xint"].map((key) => [key, "global" as const]),
  ),
  brandMapping: { version: 1, confirmedAt: "2026-10-05T00:00:00.000Z", sourceFingerprint: "x", observed: {}, aliases: {}, privateAliases: {} },
  brandMappingCurrent: true,
  sizeSettings: { default: "Alpha", overrides: {} },
  sharedCharts: Object.values(CHART_SEEDS)
    .flat()
    .map((seed) => ({ ...seed, version: 1 }) as unknown as SizingChartRow),
  privateCharts: [],
  unsupportedSources: UNSUPPORTED_SOURCES,
};

type Demand = [brand: string, leaf: string, sizes: string, title?: string, expected?: ProductChartStatus];

const DEMAND: Demand[] = [
  // Tom Tailor: women
  ["tom_tailor", "women:top:t-shirt", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:top:t-shirt", "XS,S,M,L,XL,XXL,3XL"],
  ["tom_tailor", "women:top:t-shirt", "34,36,38,40,42,44,46"],
  ["tom_tailor", "women:top:blouse", "34,36,38,40,42,44,46"],
  ["tom_tailor", "women:top:blouse", "XS,S,M,L,XL,XXL,3XL"],
  ["tom_tailor", "women:top:sweater", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:outerwear:blazer", "S,M,L,XL,XXL,3XL"],
  ["tom_tailor", "women:outerwear:blazer", "32,34,36,38,40,42,44,46"],
  ["tom_tailor", "women:outerwear:jacket", "XS,S,M,L,XL,XXL,3XL"],
  ["tom_tailor", "women:outerwear:jacket", "34,36,38,40,42,44"],
  ["tom_tailor", "women:outerwear:vest", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:full-body:dress", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:full-body:jumpsuit", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:bottom:trouser", "34,36,38,40,42,44"],
  ["tom_tailor", "women:bottom:skirt", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:bottom:jean", "25,26,27,28,29,30,31,32,33,34,36"],
  ["tom_tailor", "women:bottom:jean", "25,26,27,28,29,30,31,32,33"],
  ["tom_tailor", "women:bottom:jean", "XS,S,M,L,XL,XXL"],
  ["tom_tailor", "women:bottom:jean", "32,34,36,38,40,42,44,46"],
  ["tom_tailor", "women:bottom:short", "34,36,38,40,42,44,46"],
  ["tom_tailor", "women:bottom:short", "25,26,27,28,31,32,33,34,36,29,30"],
  ["tom_tailor", "women:bottom:short", "34/28,36/28,38/28,40/28,42/28,44/28,46/28", undefined, "unsupported-source"],
  // Tom Tailor: men
  ["tom_tailor", "men:top:t-shirt", "S,M,L,XL,XXL"],
  ["tom_tailor", "men:bottom:jean", "29,30,31,32,33,34,36,38,40"],
  ["tom_tailor", "men:bottom:chino", "31,32,33,34,36,38,40,29,30"],
  ["tom_tailor", "men:bottom:chino", "XS,S,M,L,XL,XXL,3XL"],
  ["tom_tailor", "men:bottom:short", "31,32,33,34,36,38,40,29,30"],
  ["tom_tailor", "men:bottom:short", "XS,S,M,L,XL,XXL,3XL"],
  ["tom_tailor", "men:bottom:short", "XS,S,M,L,XL,XXL,3XL,4XL", undefined, "unsupported-source"],
  ["tom_tailor", "men:bottom:trouser", "32/34,33/34,34/34,36/34,38/34,29/34,30/34,31/34,40/34"],
  ["tom_tailor", "men:bottom:trouser", "S,M,L,XL,XXL"],
  ["tom_tailor", "men:bottom:swim-short", "S,M,L,XL", undefined, "unsupported-source"],
  // Penti
  ["penti", "women:top:t-shirt", "XS,S,M,L,XL"],
  ["penti", "women:bottom:legging", "XS,S,M,L,XL"],
  ["penti", "women:bottom:legging", "1,2,3,4", undefined, "unsupported-source"],
  ["penti", "women:bottom:legging", "1\\\\2,3\\\\4,5\\\\6", undefined, "unsupported-source"],
  ["penti", "women:top:bra", "75A,75B,80A,80B"],
  ["penti", "women:top:bra", "80C,85C,80D,90D,95C,85D,90C,90E,95D"],
  ["penti", "women:top:bra", "S\\\\M,M\\\\L,L\\\\XL", undefined, "unsupported-source"],
  ["penti", "women:top:tank-top", "S\\\\M,M\\\\L,L\\\\XL", undefined, "unsupported-source"],
  ["penti", "women:top:swim-top", "34,36,38,40,42", undefined, "unsupported-source"],
  ["penti", "women:bottom:swim-bottom", "34,36,38,40,42,44", undefined, "unsupported-source"],
  ["penti", "women:full-body:swimsuit", "34,36,38,40,42,44", undefined, "unsupported-source"],
  ["penti", "women:full-body:kaftan", "STD", undefined, "unsupported-source"],
  ["penti", "women:footwear:sock", "S/M", undefined, "unsupported-source"],
  ["penti", "kids-boys:top:t-shirt", "3\\\\4,4\\\\5,5\\\\6,6\\\\7,7\\\\8,9\\\\10,11\\\\12"],
  ["penti", "kids-girls:top:t-shirt", "3\\\\4,4\\\\5,5\\\\6,6\\\\7,7\\\\8,9\\\\10,11\\\\12,13\\\\14"],
  ["penti", "kids-boys:top:t-shirt", "3\\\\4,8\\\\9,12\\\\13", undefined, "unsupported-source"],
  ["penti", "kids-boys:full-body:sleepsuit", "3\\\\4,4\\\\5,5\\\\6,6\\\\7,7\\\\8,9\\\\10,11\\\\12"],
  // Tommy Hilfiger
  ["tommy_hilfiger", "men:bottom:trouser", "3430,3432,3434,3438"],
  ["tommy_hilfiger", "men:bottom:trouser", "3436,3430,3431,3432,3433,3434,3438"],
  ["tommy_hilfiger", "men:bottom:jean", "3431,3433,3436"],
  ["tommy_hilfiger", "women:bottom:jean", "3225,3226"],
  ["tommy_hilfiger", "women:bottom:jean", "3227,3229,3230"],
  ["tommy_hilfiger", "men:top:polo-shirt", "SMALL,MEDIUM,XXLARGE"],
  ["tommy_hilfiger", "kids-unisex:top:t-shirt", "3,4,5,7,12,8,10,14,16,6", "Kids Boys Essential Polo"],
  ["tommy_hilfiger", "kids-unisex:bottom:trouser", "3,4,5,7,12", "Kids Boys Cotton Sweatpants"],
  ["tommy_hilfiger", "kids-unisex:bottom:trouser", "3,92", "Kids Boys Sweatpants", "unsupported-source"],
];

describe("real catalog demand", () => {
  it.each(DEMAND)("%s %s [%s]", (brand, leaf, sizes, title, expected = "matched") => {
    const resolution = resolveProductChart(
      {
        brandKey: brand,
        sizingCategory: personaSizingGroup(leaf.split(":")[1] ?? "") ?? "",
        primaryPersonaLeafKey: leaf,
        rawSizeFormat: sizes,
        audienceHint: audienceHintFor({ title }),
      },
      context,
    );
    expect(resolution.status, `${brand} ${leaf} ${sizes}`).toBe(expected);
    if (expected === "unsupported-source") {
      expect(resolution.unsupportedSource?.reason).toBeTruthy();
    }
  });
});
