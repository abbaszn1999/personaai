import { rowsFromColumns, type SeedChart } from "../types";

/**
 * Penti, transcribed only from the brand's official pages.
 *
 * Swim guide: https://www.penti.com/en/guide/bikini
 * Bra guide:  https://www.penti.com/en/rehber/sutyen
 *
 * The ordinary apparel grid is exposed by official Penti product pages. `APPAREL_URL` is a stable
 * representative PDP carrying that size-table UI. The source's scraped hip/bottom columns are
 * malformed, so only the coherent chest and waist columns are retained. No omitted value is
 * reconstructed.
 *
 * The bra grid and general children grid preserve only combinations and values printed by Penti.
 * Footwear, standard socks and slippers still have no supported body or foot-length measurements.
 *
 * `coversLeaves` is the sole assignment truth. The ordinary table is used only for adult women's
 * apparel sold on Penti's own site; specialized swim leaves use the separate swim table.
 */

const BRAND = "penti";
const APPAREL_URL =
  "https://www.penti.com/en/woman/athleisure/legging/recovery-leggings/black-high-waisted-soft-feel-leggings/p/PHU1OZ0R26SK-BK3";
const SWIM_URL = "https://www.penti.com/en/guide/bikini";
const BRA_URL =
  "https://www.penti.com/tr/kadin/ic-giyim/sutyen/basic-sutyenler/siyah-buyuk-beden-dantel-detayli-toparlayici-sutyen/p/PLIZZSHJ20SK-BK3";
const KIDS_URL =
  "https://www.penti.com/tr/kiz-cocuk/kiz-cocuk-pijama/kiz-cocuk-pijama-set/kiz-cocuk-colorful-bows-gomlek-kirik-beyaz-pijama-takimi/p/PNF9V3LQ25IY-B32";

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL"] as const;
const APPAREL_CHEST = [
  [76, 80],
  [84, 90],
  [92, 97],
  [99, 104],
  [106, 115],
] as const;
const APPAREL_WAIST = [
  [60, 64],
  [64, 68],
  [70, 74],
  [76, 80],
  [82, 88],
] as const;

const SWIM_SIZES = ["S", "M", "L", "XL"] as const;
const SWIM_CHEST = [
  [82, 86],
  [88, 92],
  [94, 98],
  [100, 104],
] as const;
const SWIM_WAIST = [
  [62, 66],
  [68, 72],
  [74, 78],
  [80, 84],
] as const;
const SWIM_HIP = [
  [88, 92],
  [94, 98],
  [100, 104],
  [106, 110],
] as const;

const APPAREL_NOTES = [
  "The official product-page table's malformed scraped hip/bottom columns are omitted; no bounds are inferred from them.",
  "Published gaps between adjacent chest and waist ranges are preserved exactly rather than widened.",
];

function braRows(): SeedChart["chartRows"] {
  const published: Array<[string, number, number]> = [
    ["70A", 82, 84], ["70B", 84, 86], ["70C", 86, 88], ["70D", 88, 90],
    ["75A", 87, 89], ["75B", 89, 91], ["75C", 91, 93], ["75D", 93, 95], ["75E", 95, 97],
    ["80A", 92, 94], ["80B", 94, 96], ["80C", 96, 98], ["80D", 98, 100], ["80E", 100, 102],
    ["85A", 97, 99], ["85B", 99, 101], ["85C", 101, 103], ["85D", 103, 105], ["85E", 105, 107],
    ["90B", 104, 106], ["90C", 106, 108], ["90D", 108, 110], ["90E", 110, 112],
    ["95B", 109, 111], ["95C", 111, 113], ["95D", 113, 115], ["95E", 115, 117],
  ];

  return published.map(([size, chestMin, chestMax]) => ({
    size,
    chest_min: chestMin,
    chest_max: chestMax,
  }));
}

const KIDS_ROWS = rowsFromColumns({
  sizes: ["3-4", "4-5", "5-6", "6-7", "7-8", "9-10", "11-12", "13-14", "14-15"],
  aliases: { age: ["3-4", "4-5", "5-6", "6-7", "7-8", "9-10", "11-12", "13-14", "14-15"] },
  bounds: {
    height: [[104, 104], [110, 110], [116, 116], [122, 122], [128, 128], [140, 140], [152, 152], [160, 160], [170, 170]],
    chest: [[56, 56], [58, 58], [60, 60], [62, 62], [65, 65], [71, 71], [77, 77], [82, 82], [86, 86]],
    waist: [[54, 54], [55, 55], [56, 56], [57, 57], [58, 58], [61, 61], [65, 65], [67, 67], [71, 71]],
    hip: [[60, 60], [62, 62], [64, 64], [66, 66], [70, 70], [76, 76], [84, 84], [88, 88], [91, 91]],
  },
}).map((row) => ({ ...row, source_point_values: true as const }));

const KIDS_TOP_ROWS = KIDS_ROWS.map((row) => ({
  size: row.size,
  aliases: row.aliases,
  source_point_values: row.source_point_values,
  chest_min: row.chest_min,
  chest_max: row.chest_max,
  waist_min: row.waist_min,
  waist_max: row.waist_max,
  height_min: row.height_min,
  height_max: row.height_max,
}));

const KIDS_BOTTOM_ROWS = KIDS_ROWS.map((row) => ({
  size: row.size,
  aliases: row.aliases,
  source_point_values: row.source_point_values,
  waist_min: row.waist_min,
  waist_max: row.waist_max,
  hip_min: row.hip_min,
  hip_max: row.hip_max,
  height_min: row.height_min,
  height_max: row.height_max,
}));

export const PENTI_SEED: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Apparel",
    coversLeaves: [
      "women:top:t-shirt",
      "women:top:shirt",
      "women:top:camisole",
      "women:top:tank-top",
      "women:top:crop-top",
      "women:top:bodysuit",
      "women:top:activewear-top",
      "women:top:sleep-top",
    ],
    audience: "womens",
    sourceTitle: "Women's Apparel Size Table",
    sourceUrl: APPAREL_URL,
    chartRows: rowsFromColumns({
      sizes: APPAREL_SIZES,
      aliases: { alpha: APPAREL_SIZES },
      bounds: { chest: APPAREL_CHEST, waist: APPAREL_WAIST },
    }),
    notes: APPAREL_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Bras",
    coversLeaves: ["women:top:bra"],
    audience: "womens",
    sourceTitle: "Penti Bra Size Calculator",
    sourceUrl: BRA_URL,
    chartRows: braRows(),
    notes: [
      "Only band/cup combinations populated in Penti's published bra grid are included; blank combinations are not synthesized.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Apparel",
    coversLeaves: [
      "women:bottom:trouser",
      "women:bottom:skirt",
      "women:bottom:short",
      "women:bottom:legging",
      "women:bottom:activewear-bottom",
      "women:bottom:sleep-bottom",
    ],
    audience: "womens",
    sourceTitle: "Women's Apparel Size Table",
    sourceUrl: APPAREL_URL,
    chartRows: rowsFromColumns({
      sizes: APPAREL_SIZES,
      aliases: { alpha: APPAREL_SIZES },
      bounds: { waist: APPAREL_WAIST },
    }),
    notes: APPAREL_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Women Apparel",
    coversLeaves: [
      "women:full-body:dress",
      "women:full-body:kaftan",
      "women:full-body:set",
      "women:full-body:sleepwear-set",
    ],
    audience: "womens",
    sourceTitle: "Women's Apparel Size Table",
    sourceUrl: APPAREL_URL,
    chartRows: rowsFromColumns({
      sizes: APPAREL_SIZES,
      aliases: { alpha: APPAREL_SIZES },
      bounds: { chest: APPAREL_CHEST, waist: APPAREL_WAIST },
    }),
    notes: APPAREL_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Women Apparel",
    coversLeaves: ["women:outerwear:kimono"],
    audience: "womens",
    sourceTitle: "Women's Apparel Size Table",
    sourceUrl: APPAREL_URL,
    chartRows: rowsFromColumns({
      sizes: APPAREL_SIZES,
      aliases: { alpha: APPAREL_SIZES },
      bounds: { chest: APPAREL_CHEST, waist: APPAREL_WAIST },
    }),
    notes: APPAREL_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Swim Tops",
    coversLeaves: ["women:top:swim-top"],
    audience: "womens",
    sourceTitle: "Bikini Guide",
    sourceUrl: SWIM_URL,
    chartRows: rowsFromColumns({
      sizes: SWIM_SIZES,
      aliases: { alpha: SWIM_SIZES },
      bounds: { chest: SWIM_CHEST, waist: SWIM_WAIST },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Swim Bottoms",
    coversLeaves: ["women:bottom:swim-bottom"],
    audience: "womens",
    sourceTitle: "Bikini Guide",
    sourceUrl: SWIM_URL,
    chartRows: rowsFromColumns({
      sizes: SWIM_SIZES,
      aliases: { alpha: SWIM_SIZES },
      bounds: { waist: SWIM_WAIST, hip: SWIM_HIP },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Women Swimsuits",
    coversLeaves: ["women:full-body:swimsuit"],
    audience: "womens",
    sourceTitle: "Bikini Guide",
    sourceUrl: SWIM_URL,
    chartRows: rowsFromColumns({
      sizes: SWIM_SIZES,
      aliases: { alpha: SWIM_SIZES },
      bounds: { chest: SWIM_CHEST, waist: SWIM_WAIST, hip: SWIM_HIP },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Boys General",
    coversLeaves: [
      "kids-boys:top:t-shirt",
      "kids-boys:top:shirt",
      "kids-boys:top:knit",
      "kids-boys:top:hoodie",
      "kids-boys:top:sweatshirt",
      "kids-boys:top:activewear-top",
      "kids-boys:top:sleep-top",
    ],
    audience: "boys",
    sourceTitle: "Kids Group Size Measurements",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: KIDS_TOP_ROWS,
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Boys General",
    coversLeaves: [
      "kids-boys:bottom:trouser",
      "kids-boys:bottom:jean",
      "kids-boys:bottom:short",
      "kids-boys:bottom:legging",
      "kids-boys:bottom:jogger",
      "kids-boys:bottom:sleep-bottom",
    ],
    audience: "boys",
    sourceTitle: "Kids Group Size Measurements",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: KIDS_BOTTOM_ROWS,
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Boys General",
    coversLeaves: ["kids-boys:full-body:set", "kids-boys:full-body:sleepsuit", "kids-boys:full-body:bathrobe"],
    audience: "boys",
    sourceTitle: "Kids Group Size Measurements",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: KIDS_ROWS,
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Girls General",
    coversLeaves: [
      "kids-girls:top:t-shirt",
      "kids-girls:top:shirt",
      "kids-girls:top:blouse",
      "kids-girls:top:knit",
      "kids-girls:top:hoodie",
      "kids-girls:top:sweatshirt",
      "kids-girls:top:activewear-top",
      "kids-girls:top:sleep-top",
    ],
    audience: "girls",
    sourceTitle: "Kids Group Size Measurements",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: KIDS_TOP_ROWS,
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Girls General",
    coversLeaves: [
      "kids-girls:bottom:trouser",
      "kids-girls:bottom:jean",
      "kids-girls:bottom:skirt",
      "kids-girls:bottom:short",
      "kids-girls:bottom:legging",
      "kids-girls:bottom:jogger",
      "kids-girls:bottom:sleep-bottom",
    ],
    audience: "girls",
    sourceTitle: "Kids Group Size Measurements",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: KIDS_BOTTOM_ROWS,
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Girls General",
    coversLeaves: [
      "kids-girls:full-body:dress",
      "kids-girls:full-body:set",
      "kids-girls:full-body:sleepsuit",
      "kids-girls:full-body:bathrobe",
    ],
    audience: "girls",
    sourceTitle: "Kids Group Size Measurements",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: KIDS_ROWS,
  },
];
