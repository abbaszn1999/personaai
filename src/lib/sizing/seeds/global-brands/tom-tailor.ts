import { rowsFromColumns, type SeedChart } from "../types";
import { TOM_TAILOR_EXPANDED_SEED } from "./tom-tailor-expanded";

/**
 * Tom Tailor, transcribed from the brand's official global size guide.
 *
 * Source: https://www.tom-tailor.eu/en/size-guides
 *
 * `coversLeaves` is the assignment truth. Each chart claims only garment types named by its
 * published heading; nearby taxonomy leaves are deliberately not inferred. Denim Female, Plus,
 * long-size and children's tables are retained in `tom-tailor-expanded.ts` with explicit line,
 * fit and age applicability so they cannot be selected as an unqualified base chart.
 */

/** `32/34` = waist 32 with a 34 inside leg: the label stores print for a jeans size plus its length choice. */
function waistLengthLabels(waists: readonly string[], lengths: readonly number[]): string[][] {
  return waists.map((waist) => lengths.map((length) => `${waist}/${length}`));
}

const BRAND = "tom_tailor";
const SOURCE_URL = "https://www.tom-tailor.eu/en/size-guides";

const WOMEN_ALPHA_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
const WOMEN_NUMERIC_SIZES = ["32", "34", "36", "38", "40", "42", "44", "46"] as const;
const WOMEN_SCALE_NOTE =
  "Alpha (XXS-XXXL) and EU (32-46) are two labels for the same published body rows: the T-shirt/jacket (alpha) and blouse/trouser/skirt (numeric) tables print identical chest, waist and hip ranges, and the Denim Female tables print the pairs together (XXS/32 ... XXL/44).";

const WOMEN_CHEST = [
  [76, 79],
  [80, 83],
  [84, 87],
  [88, 91],
  [92, 95],
  [96, 100],
  [101, 105],
  [106, 111],
] as const;
const WOMEN_WAIST = [
  [58, 61],
  [62, 65],
  [66, 69],
  [70, 73],
  [74, 77],
  [78, 82],
  [83, 87],
  [88, 93],
] as const;
const WOMEN_HIP = [
  [84, 87],
  [88, 91],
  [92, 95],
  [96, 99],
  [100, 103],
  [104, 108],
  [109, 113],
  [114, 119],
] as const;

const WOMEN: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women",
    coversLeaves: [
      "women:top:t-shirt",
      "women:top:knit",
      "women:top:hoodie",
    ],
    audience: "womens",
    sourceTitle: "Women: T-Shirts, Polos, Knit & Sweats",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_ALPHA_SIZES,
      aliases: { alpha: WOMEN_ALPHA_SIZES, eu: WOMEN_NUMERIC_SIZES },
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST },
    }),
    notes: [
      "Only taxonomy leaves explicitly supported by the heading are claimed; Persona has no women's polo leaf.",
      WOMEN_SCALE_NOTE,
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Women Jackets",
    coversLeaves: ["women:outerwear:jacket"],
    audience: "womens",
    notes: [
      "The vest leaf is filed under the official Jackets table: it is the only outerwear table with chest, waist and hip, and the men's Jackets table already covers the gilet the same way.",
    ],
    sourceTitle: "Women: Jackets",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_ALPHA_SIZES,
      aliases: { alpha: WOMEN_ALPHA_SIZES, eu: WOMEN_NUMERIC_SIZES },
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Women Cardigans",
    coversLeaves: ["women:outerwear:cardigan"],
    audience: "womens",
    sourceTitle: "Women: T-Shirts, Polos, Knit & Sweats",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_ALPHA_SIZES,
      aliases: { alpha: WOMEN_ALPHA_SIZES, eu: WOMEN_NUMERIC_SIZES },
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST },
    }),
    notes: ["Cardigans use the official women's knit table; the Persona taxonomy files them under outerwear."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Blouses",
    coversLeaves: ["women:top:shirt"],
    audience: "womens",
    sourceTitle: "Women: Blouses, Blazers & Dresses",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_NUMERIC_SIZES,
      aliases: { eu: WOMEN_NUMERIC_SIZES, alpha: WOMEN_ALPHA_SIZES },
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST },
    }),
    notes: ["The source publishes one numeric table for blouses, blazers and dresses; this copy claims only the blouse leaf."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Women Blazers",
    coversLeaves: ["women:outerwear:blazer"],
    audience: "womens",
    sourceTitle: "Women: Blouses, Blazers & Dresses",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_NUMERIC_SIZES,
      aliases: { eu: WOMEN_NUMERIC_SIZES, alpha: WOMEN_ALPHA_SIZES },
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST },
    }),
    notes: ["The source publishes one numeric table for blouses, blazers and dresses; this copy claims only the blazer leaf."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Women Dresses",
    coversLeaves: ["women:full-body:dress", "women:full-body:jumpsuit"],
    audience: "womens",
    sourceTitle: "Women: Blouses, Blazers & Dresses",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_NUMERIC_SIZES,
      aliases: { eu: WOMEN_NUMERIC_SIZES, alpha: WOMEN_ALPHA_SIZES },
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST, hip: WOMEN_HIP },
    }),
    notes: ["The source publishes one numeric table for blouses, blazers and dresses; this copy claims only the dress leaf."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Trousers",
    coversLeaves: ["women:bottom:trouser", "women:bottom:short", "women:bottom:legging", "women:bottom:jean"],
    audience: "womens",
    sourceTitle: "Women: Trousers",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_NUMERIC_SIZES,
      aliases: { eu: WOMEN_NUMERIC_SIZES, alpha: WOMEN_ALPHA_SIZES },
      bounds: { waist: WOMEN_WAIST, hip: WOMEN_HIP },
    }),
    notes: [
      "The source offers inseam choices 30, 32 and 34 for every size. They are not collapsed into one bound because they are separate length selections.",
      "Some Tom Tailor jeans are stocked in trouser sizing (EU 32-46); those use this table. Jeans stocked in W25-W36 use the Women Jeans table, selected by the stocked labels.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Jeans",
    coversLeaves: ["women:bottom:jean", "women:bottom:short"],
    audience: "womens",
    sourceTitle: "Women: Jeans",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: ["25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36"],
      aliases: {
        numeric: ["25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36"],
        waist_inseam: waistLengthLabels(["25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36"], [30, 32, 34]),
      },
      bounds: {
        waist: [
          [59, 61],
          [62, 64],
          [65, 67],
          [68, 70],
          [71, 73],
          [74, 76],
          [77, 79],
          [80, 82],
          [83, 85],
          [86, 89],
          [90, 94],
        ],
        hip: [
          [85, 87],
          [88, 90],
          [91, 93],
          [94, 96],
          [97, 99],
          [100, 102],
          [103, 105],
          [106, 108],
          [109, 111],
          [112, 115],
          [116, 120],
        ],
      },
    }),
    notes: [
      "The source offers inseam choices 30, 32 and 34 for every waist size. They remain product length selections rather than a merged body bound.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Skirts",
    coversLeaves: ["women:bottom:skirt"],
    audience: "womens",
    sourceTitle: "Women: Skirts",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_NUMERIC_SIZES,
      aliases: { eu: WOMEN_NUMERIC_SIZES, alpha: WOMEN_ALPHA_SIZES },
      bounds: { waist: WOMEN_WAIST, hip: WOMEN_HIP },
    }),
  },
];

const MEN_ALPHA_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
const MEN_CHEST = [
  [80, 83],
  [84, 87],
  [88, 92],
  [93, 98],
  [99, 104],
  [105, 110],
  [111, 116],
  [117, 122],
] as const;
const MEN_WAIST = [
  [68, 71],
  [72, 75],
  [76, 80],
  [81, 86],
  [87, 92],
  [93, 98],
  [99, 104],
  [105, 110],
] as const;

const MEN: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Men",
    coversLeaves: [
      "men:top:t-shirt",
      "men:top:polo-shirt",
      "men:top:knit",
      "men:top:hoodie",
    ],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: T-Shirts, Polos, Knits & Sweats",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: MEN_ALPHA_SIZES,
      aliases: { alpha: MEN_ALPHA_SIZES },
      bounds: { chest: MEN_CHEST, waist: MEN_WAIST },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Men Shirts",
    coversLeaves: ["men:top:shirt"],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: Blazers, Jackets & Shirts",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: MEN_ALPHA_SIZES,
      aliases: { alpha: MEN_ALPHA_SIZES },
      bounds: { chest: MEN_CHEST, waist: MEN_WAIST },
    }),
    notes: ["The published shared table also names blazers and jackets; this tops copy claims only the shirt leaf."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Men Jackets",
    coversLeaves: ["men:outerwear:jacket"],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: Blazers, Jackets & Shirts",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: MEN_ALPHA_SIZES,
      aliases: { alpha: MEN_ALPHA_SIZES },
      bounds: { chest: MEN_CHEST, waist: MEN_WAIST },
    }),
    notes: [
      "The blazer leaf is assigned to the dedicated normal-size numeric blazer table, avoiding overlapping claims.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Men Cardigans",
    coversLeaves: ["men:outerwear:cardigan"],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: T-Shirts, Polos, Knits & Sweats",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: MEN_ALPHA_SIZES,
      aliases: { alpha: MEN_ALPHA_SIZES },
      bounds: { chest: MEN_CHEST, waist: MEN_WAIST },
    }),
    notes: ["Cardigans use the official men's knit table; the Persona taxonomy files them under outerwear."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Men Jeans",
    coversLeaves: ["men:bottom:jean", "men:bottom:trouser", "men:bottom:short"],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: Jeans",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"],
      aliases: {
        numeric: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"],
        waist_inseam: waistLengthLabels(["26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"], [30, 32, 34, 36]),
      },
      bounds: {
        waist: [
          [67, 69],
          [70, 71],
          [72, 74],
          [75, 76],
          [77, 79],
          [80, 81],
          [82, 84],
          [85, 86],
          [87, 89],
          [90, 94],
          [95, 99],
          [100, 104],
          [105, 109],
          [110, 114],
        ],
        hip: [
          [83, 85],
          [86, 87],
          [88, 90],
          [91, 92],
          [93, 95],
          [96, 97],
          [98, 100],
          [101, 102],
          [103, 105],
          [106, 110],
          [111, 115],
          [116, 120],
          [121, 125],
          [126, 130],
        ],
      },
    }),
    notes: [
      "Inseam rows are incomplete for the largest waist sizes and represent separate 30/32/34/36 length choices, so no inseam bound is claimed.",
      "Tom Tailor sells men's chinos, trousers and denim shorts in this waist scale (W29-W40, often with an L length such as 32/34); this is the only waist-size table the guide publishes, so those leaves are filed here. The EU 44-58 table remains the claimant for numeric EU sizes.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Men Blazers",
    coversLeaves: ["men:outerwear:blazer"],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: Blazers (normal size)",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: ["44", "46", "48", "50", "52", "54", "56", "58"],
      aliases: { eu: ["44", "46", "48", "50", "52", "54", "56", "58"] },
      bounds: {
        chest: [
          [86, 89],
          [90, 93],
          [94, 97],
          [98, 101],
          [102, 105],
          [106, 109],
          [110, 113],
          [114, 117],
        ],
        waist: [
          [74, 77],
          [78, 81],
          [82, 85],
          [86, 89],
          [90, 93],
          [94, 97],
          [98, 101],
          [102, 105],
        ],
      },
    }),
    notes: [
      "The separate long-size fit chart is published with explicit fit applicability in tom-tailor-expanded.ts.",
      "No suit or suit-jacket leaf is claimed because the official heading names blazers only.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Men Trousers",
    coversLeaves: ["men:bottom:trouser", "men:bottom:short"],
    audience: "mens",
    sourceTitle: "Man Casual and Denim Male: Trousers (normal size)",
    sourceUrl: SOURCE_URL,
    chartRows: rowsFromColumns({
      sizes: ["44", "46", "48", "50", "52", "54", "56", "58"],
      aliases: { eu: ["44", "46", "48", "50", "52", "54", "56", "58"] },
      bounds: {
        waist: [
          [74, 77],
          [78, 81],
          [82, 85],
          [86, 89],
          [90, 93],
          [94, 97],
          [98, 101],
          [102, 105],
        ],
        hip: [
          [90, 93],
          [94, 97],
          [98, 101],
          [102, 105],
          [106, 109],
          [110, 113],
          [114, 117],
          [118, 121],
        ],
        inseam: [
          [79.5, 80],
          [80.5, 81],
          [81.5, 82],
          [82.5, 83],
          [83.5, 84],
          [84.5, 85],
          [85.5, 86],
          [86.5, 87],
        ],
      },
    }),
    notes: [
      "Long-size and American-size variants are published with explicit applicability in tom-tailor-expanded.ts.",
    ],
  },
];

export const TOM_TAILOR_SEED: SeedChart[] = [...WOMEN, ...MEN, ...TOM_TAILOR_EXPANDED_SEED];
