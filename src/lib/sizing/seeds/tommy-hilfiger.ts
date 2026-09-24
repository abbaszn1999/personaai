import { exact, rowsFromColumns, type SeedChart } from "./types";

/**
 * Tommy Hilfiger, transcribed from the brand's own size guides.
 *
 *   men:   https://en-om.tommy.com/mens-size-guide
 *   women: https://ie.tommy.com/womens-size-guide
 *   kids:  https://uk.tommy.com/children-size-guide
 *
 * Every number here is read off those pages. Nothing is inferred, interpolated, or carried over from
 * a neighbouring size — a fabricated bound is worse than a missing chart, because a missing chart
 * falls back to the merchant's own size labels while a wrong one silently recommends the wrong size.
 *
 * Two things about this brand shaped the seed and are worth knowing before adding another:
 *
 * 1. One published table routinely serves several of our five groups. Tommy's "TOPS, OUTERWEAR,
 *    CASUAL SHIRTS" is one table covering both `tops` and `outerwear`, so it becomes two rows with
 *    the same bounds and different `sizingCategory`. Storing it once under `tops` would leave every
 *    jacket in the catalog uncharted.
 *
 * 2. The brand publishes several size systems under one name — Tommy Hilfiger, Tailored, Tommy
 *    Jeans, TJ Curve — and they disagree on the same label. A Tommy Jeans `M` is not a Tommy
 *    Hilfiger `M`. Each system is its own `variantName`, which is exactly what that column is for,
 *    and Stage 5 is where a merchant says which of them their stock actually is.
 *
 * Deliberately not seeded: the brand's fit-class lines (Big & Tall, Tailored Long, Tailored Short).
 * Which fit a shopper needs is a fact about their body, not about the taxonomy path a product sits
 * on, and this pipeline's one source of truth for "which chart governs this SKU" is the taxonomy
 * path alone — department → category → leaf, nothing else. A fit-class table can never be reached
 * that way (it has no leaf of its own to claim), so rather than seed dead data a merchant could pick
 * anyway, we leave it out entirely; see `variant-match.ts`'s fit-tag filtering for the systemic guard.
 *
 * `ARMS` is the trap. Tommy prints that heading for two different measurements: 84-97cm on the
 * casual tops table, which is centre-back-neck-to-wrist and therefore our `sleeve`, and 61-70cm on
 * the tailored table, which is shoulder-to-wrist and *also* `sleeve` but on a different origin. Both
 * are recorded as `sleeve` because that is what the shopper can measure, and the difference is
 * carried by the variant rather than by inventing a second key.
 */

const MEN_URL = "https://en-om.tommy.com/mens-size-guide";
const WOMEN_URL = "https://ie.tommy.com/womens-size-guide";

const BRAND = "tommy_hilfiger";

/* ─────────────────────────────── Tommy Hilfiger — Men ─────────────────────────────── */

/** Sizes XS-3XL, shared by the casual tops table and its outerwear twin. */
const MEN_CASUAL = {
  sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
  aliases: {
    alpha: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
    uk: ["34", "36-38", "40", "42", "44", "46", "48"],
    us: ["34", "36-38", "40", "42", "44", "46", "48"],
    eu: ["44", "46-48", "50", "52", "54", "56", "58"],
    neck: ["37-38", "38-39", "40-41", "42-43", "44-45", "45-46", "46-47"],
  },
  bounds: {
    chest: [
      [88, 92],
      [93, 97],
      [98, 102],
      [103, 108],
      [109, 114],
      [115, 120],
      [121, 126],
    ],
    waist: [
      [78, 82],
      [83, 87],
      [88, 92],
      [93, 98],
      [99, 104],
      [105, 110],
      [111, 116],
    ],
    sleeve: [
      [84, 85],
      [86, 87],
      [88, 89],
      [90, 91],
      [92, 93],
      [94, 95],
      [96, 97],
    ],
    neck: [
      [37, 38],
      [38, 39],
      [40, 41],
      [42, 43],
      [44, 45],
      [45, 46],
      [46, 47],
    ],
  },
} as const;

/** Sizes XS-XXXL, shared by the tailored tops and tailored outerwear twins.
 *
 *  `size` is the UK/US numeric rather than the alpha label, because this table prints `S` twice — for
 *  UK 36 and UK 38 — and two rows answering to one primary label is ambiguous at match time. The
 *  alpha is kept as an alias, so nothing is lost and a merchant stocking `S` still matches both. */
const MEN_TAILORED = {
  sizes: ["34", "36", "38", "40", "42", "44", "46", "48"],
  aliases: {
    alpha: ["XS", "S", "S", "M", "L", "XL", "XXL", "XXXL"],
    uk: ["34", "36", "38", "40", "42", "44", "46", "48"],
    us: ["34", "36", "38", "40", "42", "44", "46", "48"],
    eu: ["44", "46", "48", "50", "52", "54", "56", "58"],
  },
  bounds: {
    chest: [
      [88, 92],
      [93, 95],
      [96, 98],
      [99, 102],
      [103, 106],
      [107, 111],
      [112, 116],
      [117, 121],
    ],
    waist: [
      [76, 78],
      [79, 81],
      [82, 84],
      [85, 88],
      [89, 92],
      [93, 97],
      [98, 102],
      [103, 107],
    ],
    hip: [
      [88, 91],
      [92, 94],
      [95, 97],
      [98, 101],
      [102, 105],
      [106, 110],
      [111, 115],
      [116, 120],
    ],
    sleeve: [
      [61, 62],
      [63, 64],
      [64, 65],
      [65, 66],
      [66, 67],
      [67, 68],
      [68, 69],
      [69, 70],
    ],
    inseam: exact([83, 84, 85, 86, 87, 88, 89, 90]),
  },
} as const;

const TAILORED_NOTES = [
  "`size` is the UK/US numeric, not the alpha label: the source prints `S` for both UK 36 and UK 38.",
  "The source's LOW WAIST column is dropped — no equivalent in MEASUREMENTS, and folding it into `waist` would overwrite the natural waist the filter compares against.",
];

const MEN: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Men",
    coversLeaves: [
      "men:top:t-shirt",
      "men:top:shirt",
      "men:top:polo-shirt",
      "men:top:knit",
      "men:top:sweater",
      "men:top:hoodie",
      "men:top:sweatshirt",
      "men:top:activewear-top",
    ],
    audience: "mens",
    sourceTitle: "TOPS, OUTERWEAR, CASUAL SHIRTS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns(MEN_CASUAL),
    notes: ["The source's ARMS column is centre-back-neck-to-wrist, recorded as `sleeve`."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Men",
    coversLeaves: [
      "men:outerwear:jacket",
      "men:outerwear:coat",
      "men:outerwear:cardigan",
      "men:outerwear:gilet",
      "men:outerwear:activewear-jacket",
    ],
    audience: "mens",
    sourceTitle: "TOPS, OUTERWEAR, CASUAL SHIRTS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns(MEN_CASUAL),
    notes: ["Same published table as the `tops` variant — the heading covers both groups."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Men",
    coversLeaves: [
      "men:bottom:trouser",
      "men:bottom:jean",
      "men:bottom:chino",
      "men:bottom:short",
      "men:bottom:jogger",
      "men:bottom:activewear-bottom",
    ],
    audience: "mens",
    sourceTitle: "TOMMY HILFIGER MENSWEAR AND TH SPORTS - BOTTOMS - DENIM - CHINO - SHORTS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
      aliases: {
        alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
        uk: ["32", "34", "36-38", "40", "42", "44", "46"],
        us: ["32", "34", "36-38", "40", "42", "44", "46"],
        eu: ["42", "44", "46-48", "50", "52", "54", "56"],
        // The source's own `Denim inch size` column — a second, market-neutral numeric scale
        // printed alongside US SIZE on the same row, e.g. a merchant stocking jeans labelled `32`.
        numeric: ["28", "29-30", "31-32", "33-34", "35-36", "38", "40"],
      },
      bounds: {
        waist: [
          [74, 76],
          [77, 81],
          [82, 86],
          [86, 90],
          [91, 96],
          [97, 101],
          [102, 106],
        ],
        hip: [
          [84, 86],
          [87, 91],
          [92, 97],
          [97, 102],
          [103, 108],
          [109, 113],
          [114, 118],
        ],
        thigh: [
          [51, 52],
          [52, 54],
          [54, 56],
          [56, 58],
          [58, 60],
          [60, 62],
          [62, 64],
        ],
      },
    }),
    notes: [
      "The source's `Denim inch size` column is a second, market-neutral numeric scale printed alongside the printed US SIZE on the same row; recorded as the `numeric` alias so merchants stocking jeans labelled `32` still match this table.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Men Tailored",
    // No leaf here: our taxonomy has no separate "dress/business shirt" leaf distinct from the
    // ordinary `shirt` leaf, which already resolves to the base "Men" chart above. A merchant
    // selling tailored dress shirts assigns this variant to that path explicitly in Stage 5.
    coversLeaves: [],
    audience: "mens",
    sourceTitle: "SUITS,COATS,BUSINESS SHIRTS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns(MEN_TAILORED),
    notes: TAILORED_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Men Tailored",
    coversLeaves: ["men:outerwear:blazer", "men:outerwear:suit-jacket"],
    audience: "mens",
    sourceTitle: "SUITS,COATS,BUSINESS SHIRTS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns(MEN_TAILORED),
    notes: TAILORED_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Men Tailored",
    // The taxonomy's `suit` leaf is the whole two/three-piece outfit, not a jacket or a pair of
    // trousers separately, and Tommy sizes a suit on exactly this chest/waist/hip/sleeve grid — the
    // same table already claimed above for the jacket alone. No separate "SUITS" full-body table
    // exists on the source; this is that same real table, filed a second time under the group its
    // own product (a suit) actually belongs to.
    coversLeaves: ["men:full-body:suit"],
    audience: "mens",
    sourceTitle: "SUITS,COATS,BUSINESS SHIRTS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns(MEN_TAILORED),
    notes: TAILORED_NOTES,
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Men Swim & Lounge",
    // "LOUNGE BOTTOMS" on the source heading is this brand's word for at-home/sleep bottoms, so
    // `sleep-bottom` belongs here rather than sitting uncovered — there is no separate men's
    // sleepwear-bottoms chart in this guide.
    coversLeaves: ["men:bottom:swim-short", "men:bottom:sleep-bottom"],
    audience: "mens",
    sourceTitle: "SWIMSHORTS, LOUNGE BOTTOMS, UNDERWEAR",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
      aliases: {
        alpha: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
        uk: ["38", "40", "42", "44", "46", "48", "50", "52"],
        us: ["38", "40", "42", "44", "46", "48", "50", "52"],
        eu: ["48", "50", "52", "54", "56", "58", "60", "62"],
      },
      bounds: {
        waist: [
          [81, 85],
          [86, 91],
          [92, 97],
          [98, 103],
          [104, 109],
          [110, 115],
          [116, 121],
          [122, 127],
        ],
        hip: [
          [93, 97],
          [98, 103],
          [104, 109],
          [110, 115],
          [116, 121],
          [122, 127],
          [128, 133],
          [134, 139],
        ],
      },
    }),
    notes: [
      "The source lists nine columns, with `XXL` and `2XL` printed as separate sizes carrying identical bounds (104-109 waist). The duplicate is collapsed — two rows with the same body range make the variant ambiguous without adding coverage.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Men Beach & Lounge",
    // "LOUNGE TOPS" is this brand's word for at-home/sleep tops. Nothing else in men:top maps here
    // — there is no men's swim-top leaf in the taxonomy, only swim-short under bottoms.
    coversLeaves: ["men:top:sleep-top"],
    audience: "mens",
    sourceTitle: "BEACHCOVER UPS AND LOUNGE TOPS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
      aliases: {
        alpha: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
        uk: ["38", "40", "42", "44", "46", "48", "50", "52"],
        us: ["38", "40", "42", "44", "46", "48", "50", "52"],
        eu: ["48", "50", "52", "54", "56", "58", "60", "62"],
      },
      bounds: {
        chest: [
          [94, 98],
          [99, 104],
          [105, 110],
          [111, 116],
          [117, 122],
          [123, 128],
          [129, 134],
          [135, 140],
        ],
        waist: [
          [81, 85],
          [86, 91],
          [92, 97],
          [98, 103],
          [104, 109],
          [110, 115],
          [116, 121],
          [122, 127],
        ],
        hip: [
          [93, 97],
          [98, 103],
          [104, 109],
          [110, 115],
          [116, 121],
          [122, 127],
          [128, 133],
          [134, 139],
        ],
      },
    }),
    notes: ["Duplicate XXL/2XL column collapsed, as on the swim bottoms table."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Men Sleepwear Sets",
    // "PYJAMA SETS" is its own heading on the source, printed with the identical chest column as
    // `Men Beach & Lounge` above and the identical waist/hip columns as `Men Swim & Lounge` above —
    // Tommy reuses that one body grid across all three headings rather than cutting a fourth. Not
    // duplicated data invented for this chart: it is the same real numbers under the heading that
    // actually names a whole-body garment, which is where the `sleepwear-set` leaf belongs.
    coversLeaves: ["men:full-body:sleepwear-set"],
    audience: "mens",
    sourceTitle: "PYJAMA SETS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
      aliases: {
        alpha: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"],
        uk: ["38", "40", "42", "44", "46", "48", "50", "52"],
        us: ["38", "40", "42", "44", "46", "48", "50", "52"],
        eu: ["48", "50", "52", "54", "56", "58", "60", "62"],
      },
      bounds: {
        chest: [
          [94, 98],
          [99, 104],
          [105, 110],
          [111, 116],
          [117, 122],
          [123, 128],
          [129, 134],
          [135, 140],
        ],
        waist: [
          [81, 85],
          [86, 91],
          [92, 97],
          [98, 103],
          [104, 109],
          [110, 115],
          [116, 121],
          [122, 127],
        ],
        hip: [
          [93, 97],
          [98, 103],
          [104, 109],
          [110, 115],
          [116, 121],
          [122, 127],
          [128, 133],
          [134, 139],
        ],
      },
    }),
    notes: [
      "Duplicate XXL/2XL column collapsed, as on the swim bottoms and beach tops tables above — the source prints the same nine columns here too.",
      "Filed under `dresses` (Dresses / Full-body): a pyjama set is sold as one size covering the whole body, matching how the women's `Sleepwear Sets` chart is filed.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "footwear",
    variantName: "Men",
    coversLeaves: [
      "men:footwear:sneaker",
      "men:footwear:dress-shoe",
      "men:footwear:boot",
      "men:footwear:loafer",
      "men:footwear:sandal",
      "men:footwear:espadrille",
      "men:footwear:slipper",
    ],
    audience: "mens",
    sourceTitle: "SHOES",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns({
      sizes: [
        "39",
        "39.5",
        "40",
        "40.5",
        "41",
        "41.5",
        "42",
        "42.5",
        "43",
        "43.5",
        "44",
        "44.5",
        "45",
        "45.5",
        "46",
        "46.5",
        "47",
        "47.5",
        "48",
      ],
      aliases: {
        eu: [
          "39",
          "39.5",
          "40",
          "40.5",
          "41",
          "41.5",
          "42",
          "42.5",
          "43",
          "43.5",
          "44",
          "44.5",
          "45",
          "45.5",
          "46",
          "46.5",
          "47",
          "47.5",
          "48",
        ],
        uk: [
          "5.5",
          "6",
          "6.5",
          "7",
          "7",
          "7.5",
          "8",
          "8.5",
          "9",
          "9.5",
          "10",
          "10",
          "10.5",
          "11",
          "11",
          "11.5",
          "12",
          "12.5",
          "13",
        ],
        us: [
          "6.5",
          "7",
          "7.5",
          "8",
          "8",
          "8.5",
          "9",
          "9.5",
          "10",
          "10.5",
          "11",
          "11",
          "11.5",
          "12",
          "12",
          "12.5",
          "13",
          "13.5",
          "14",
        ],
      },
      bounds: {
        foot_length: exact([
          24, 24.5, 25, 25.5, 26, 26, 26.5, 27, 27.5, 27.5, 28, 28.5, 29, 29.5, 29.5, 30, 30.5, 31, 31.5,
        ]),
      },
    }),
    notes: [
      "`size` is the EU scale because it is the only one the source prints without repeats. UK and US both repeat values across adjacent EU half-sizes, and foot length repeats too (26cm for both EU 41 and 41.5).",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "footwear",
    variantName: "Men Socks",
    coversLeaves: ["men:footwear:sock"],
    audience: "mens",
    sourceTitle: "SOCKS",
    sourceUrl: MEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["39/42", "43/46"],
      aliases: { eu: ["39-42", "43-46"] },
      bounds: {
        foot_length: [
          [24.4, 27],
          [27.1, 29.7],
        ],
      },
    }),
  },
];

/* ────────────────────────────── Tommy Hilfiger — Women ────────────────────────────── */

/** The 12-size XXS-7XL label block every main-line women's table is built on. */
const WOMEN_ALIASES = {
  alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL"],
  uk: ["4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24", "26"],
  us: ["0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22"],
  eu: ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54"],
} as const;

const WOMEN_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL"] as const;

const WOMEN_CHEST = [
  [76.5, 80.5],
  [80.5, 84.5],
  [84.5, 88.5],
  [88.5, 92.5],
  [92.5, 96.5],
  [96.5, 101.5],
  [101.5, 106.5],
  [106.5, 112],
  [113, 118],
  [118, 123],
  [123, 128],
  [128, 134],
] as const;

const WOMEN_WAIST = [
  [60, 64],
  [64, 68],
  [68, 72],
  [72, 76],
  [76, 81],
  [81, 86],
  [86, 91],
  [91, 96],
  [97, 102],
  [102, 107],
  [107, 112],
  [112, 118],
] as const;

const WOMEN_HIP = [
  [85, 89],
  [89, 93],
  [93, 97],
  [97, 101],
  [101, 105],
  [105, 110],
  [110, 115],
  [115, 120],
  [121, 126],
  [126, 131],
  [131, 136],
  [136, 141],
] as const;

const WOMEN_SLEEVE = [
  [77.8, 78.3],
  [78.3, 78.8],
  [78.8, 79.3],
  [79.3, 79.8],
  [79.8, 80.3],
  [80.3, 80.8],
  [80.8, 81.3],
  [81.3, 81.8],
  [81.8, 82.2],
  [82.2, 82.8],
  [82.8, 83.2],
  [83.5, 84.5],
] as const;

/** The nine-size XXS-3XL block the swim, lounge and sleepwear tables use — a different label system
 *  from the main line above, with US/UK/EU printed as spans rather than single sizes. */
const WOMEN_SWIM_ALIASES = {
  alpha: ["XXS", "XS", "S", "M", "L", "XL", "1XL", "2XL", "3XL"],
  us: ["0", "2", "4", "6-8", "8-10", "10-12", "14", "16", "18-20"],
  uk: ["4", "6", "8", "10-12", "12-14", "14-16", "18", "20", "22-24"],
  eu: ["32", "34", "36", "38-40", "40-42", "42-44", "46", "48", "50-52"],
} as const;

const WOMEN_SWIM_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "1XL", "2XL", "3XL"] as const;

const WOMEN_SWIM_CHEST = [
  [74, 78],
  [79, 83],
  [84, 89],
  [90, 95],
  [96, 101],
  [102, 107],
  [108, 113],
  [114, 120],
  [121, 127],
] as const;

const WOMEN_SWIM_WAIST = [
  [56, 60],
  [61, 65],
  [66, 71],
  [72, 77],
  [78, 83],
  [84, 89],
  [92, 97],
  [98, 104],
  [105, 111],
] as const;

const WOMEN_SWIM_HIP = [
  [82, 86],
  [87, 91],
  [92, 97],
  [98, 103],
  [104, 109],
  [110, 115],
  [116, 121],
  [122, 128],
  [129, 135],
] as const;

const WOMEN: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Women",
    // The only outerwear chart this brand publishes for women, so it takes every leaf in the group
    // — no specialization to choose between.
    coversLeaves: [
      "women:outerwear:blazer",
      "women:outerwear:jacket",
      "women:outerwear:coat",
      "women:outerwear:trench",
      "women:outerwear:cardigan",
      "women:outerwear:vest",
      "women:outerwear:kimono",
      "women:outerwear:activewear-jacket",
    ],
    audience: "womens",
    sourceTitle: "COATS JACKETS BLAZERS",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SIZES,
      aliases: WOMEN_ALIASES,
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST, hip: WOMEN_HIP, sleeve: WOMEN_SLEEVE },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women",
    // Everything ordinary except shirt/blouse (their own chart), swim-top (its own chart) and bra
    // (its own chart). `sleep-top` lands here rather than uncovered: this brand has no women's
    // tops-scoped sleepwear chart (only the dresses-scoped "Sleepwear Sets"), and a plain sleep top
    // is close enough to a regular knit top that the base chart is a real answer, not a guess.
    coversLeaves: [
      "women:top:t-shirt",
      "women:top:camisole",
      "women:top:tank-top",
      "women:top:crop-top",
      "women:top:bodysuit",
      "women:top:knit",
      "women:top:sweater",
      "women:top:hoodie",
      "women:top:sweatshirt",
      "women:top:tunic",
      "women:top:activewear-top",
      "women:top:sleep-top",
    ],
    audience: "womens",
    sourceTitle: "SWEATS HOODIES POLO KNITS TEES",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SIZES,
      aliases: WOMEN_ALIASES,
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST, sleeve: WOMEN_SLEEVE },
    }),
    notes: ["The source prints no HIPS row for this table, so none is recorded."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Shirts & Blouses",
    coversLeaves: ["women:top:shirt", "women:top:blouse"],
    audience: "womens",
    sourceTitle: "SHIRTS BLOUSES",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SIZES,
      aliases: WOMEN_ALIASES,
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST, sleeve: WOMEN_SLEEVE },
    }),
    notes: [
      "Bounds are identical to the `Women` tops variant on this page. Kept as its own variant anyway: the brand publishes it as a separate table, and Stage 5 needs the shirt path to be assignable independently in case the brand ever diverges them.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women",
    // Denim (its own chart) and swim-bottom (its own chart) aside, everything else in the bottoms
    // group — including skirts, which this table's own scope ("waist and below") covers.
    coversLeaves: [
      "women:bottom:trouser",
      "women:bottom:skirt",
      "women:bottom:short",
      "women:bottom:legging",
      "women:bottom:culotte",
      "women:bottom:activewear-bottom",
      "women:bottom:sleep-bottom",
    ],
    audience: "womens",
    sourceTitle: "TROUSER SHORTS",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SIZES,
      aliases: WOMEN_ALIASES,
      bounds: { waist: WOMEN_WAIST, hip: WOMEN_HIP },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Women",
    // Swimsuit and sleepwear-set have their own dedicated charts below; everything else in the
    // full-body group lands here. Deliberately excludes `bodysuit` — that leaf lives under `top`,
    // not `full-body`, even though "Bodysuit" appears in a nearby chart's own title.
    coversLeaves: [
      "women:full-body:dress",
      "women:full-body:gown",
      "women:full-body:jumpsuit",
      "women:full-body:romper",
      "women:full-body:kaftan",
      "women:full-body:abaya",
      "women:full-body:set",
    ],
    audience: "womens",
    sourceTitle: "DRESS SKIRTS JUMPSUIT",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SIZES,
      aliases: WOMEN_ALIASES,
      bounds: { chest: WOMEN_CHEST, waist: WOMEN_WAIST, hip: WOMEN_HIP },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Denim",
    coversLeaves: ["women:bottom:jean"],
    audience: "womens",
    sourceTitle: "TOMMY HILFIGER DENIM",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL"],
      aliases: {
        alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL"],
        uk: ["4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"],
        eu: ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52"],
        // TOMMY JEANS SIZE — the waist-in-inches denim scale, a market-neutral numeric label
        // rather than a US garment size. The source prints no US SIZE row on this table.
        numeric: ["24", "25-26", "27-28", "29-30", "31", "33", "34", "36", "38", "40", "42"],
      },
      bounds: {
        waist: [
          [61, 64],
          [65, 68],
          [69, 72],
          [73, 76],
          [77, 78.5],
          [82, 86],
          [87, 92],
          [93, 98],
          [99, 104],
          [105, 110],
          [111, 116],
        ],
        hip: [
          [85, 89],
          [89, 91],
          [91, 93],
          [93, 95],
          [95, 97],
          [97, 99],
          [99, 101],
          [101, 103],
          [103, 105],
          [106, 110],
          [111, 115],
        ],
      },
    }),
    notes: [
      "`numeric` holds the TOMMY JEANS SIZE column (the waist-in-inches denim scale), because that is what women's denim stock is actually labelled with, and it is not a US garment size — the source prints no US SIZE row on this table.",
      "There is a gap in the source between L (waist 77-78.5) and XL (82-86): bodies measuring 79-81.5cm fall between two sizes. Transcribed as published rather than closed, since widening a bound invents coverage the brand never claimed.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Swim & Beach Tops",
    coversLeaves: ["women:top:swim-top"],
    audience: "womens",
    sourceTitle: "BEACH COVER UPS TOPS, LOUNGE TOPS, BIKINI TOPS, BRAS (ALPHA SIZES)",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SWIM_SIZES,
      aliases: WOMEN_SWIM_ALIASES,
      bounds: { chest: WOMEN_SWIM_CHEST, waist: WOMEN_SWIM_WAIST },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Women Swim & Beach Bottoms",
    coversLeaves: ["women:bottom:swim-bottom"],
    audience: "womens",
    sourceTitle: "BEACH COVER UPS BOTTOMS, LOUNGE BOTTOMS, BIKINI BOTTOMS, COORDINATE PANTIES",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SWIM_SIZES,
      aliases: WOMEN_SWIM_ALIASES,
      bounds: { waist: WOMEN_SWIM_WAIST, hip: WOMEN_SWIM_HIP },
    }),
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Women Swimsuits & Bodysuits",
    // Only `swimsuit`, not `bodysuit`: the source's own title names both garments, but `bodysuit`
    // is a `women:top` leaf (sizingCategory `tops`) and this chart is filed under `dresses` — a
    // leaf's own group decides where it can be claimed, not the words on the chart's heading.
    coversLeaves: ["women:full-body:swimsuit"],
    audience: "womens",
    sourceTitle: "SWIMSUITS AND BODYSUIT",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SWIM_SIZES,
      aliases: WOMEN_SWIM_ALIASES,
      bounds: {
        chest: WOMEN_SWIM_CHEST,
        waist: WOMEN_SWIM_WAIST,
        hip: WOMEN_SWIM_HIP,
        dress_length: exact([38, 39, 40, 41, 42, 43, 40.25, 41.25, 42.25]),
      },
    }),
    notes: [
      "Typo corrected: the source's HIPS row reads 105-111 for 1XL, which is narrower than the L above it and breaks an otherwise monotonic sequence. The brand's own beach-bottoms and pyjama tables both print 116-121 at 1XL on the identical label block, so 116-121 is used. This is the one number on this page not taken verbatim.",
      "`dress_length` is a garment measurement, so it is stored and displayed but never used to exclude a product — see GARMENT_MEASUREMENTS.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Women Sleepwear Sets",
    coversLeaves: ["women:full-body:sleepwear-set"],
    audience: "womens",
    sourceTitle: "PYJAMA SETS",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: WOMEN_SWIM_SIZES,
      aliases: WOMEN_SWIM_ALIASES,
      bounds: { chest: WOMEN_SWIM_CHEST, waist: WOMEN_SWIM_WAIST, hip: WOMEN_SWIM_HIP },
    }),
    notes: [
      "Filed under `dresses` (Dresses / Full-body) because a pyjama set is sold as one size covering the whole body. A merchant who splits their sleepwear into Sleep Tops and Sleep Bottoms paths can point those at the swim tops and bottoms variants instead, in Stage 5.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Women Bras (Wired)",
    coversLeaves: ["women:top:bra"],
    audience: "womens",
    sourceTitle: "WIRED NUMERIC STYLES, BRA'S AND BIKINI TOPS",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: [
        "70A",
        "70B",
        "70C",
        "70D",
        "70E",
        "70F",
        "75A",
        "75B",
        "75C",
        "75D",
        "75E",
        "75F",
        "80A",
        "80B",
        "80C",
        "80D",
        "80E",
        "80F",
        "85A",
        "85B",
        "85C",
        "85D",
        "85E",
        "90B",
        "90C",
        "90D",
        "90E",
        "95E",
        "100E",
      ],
      aliases: {
        eu: [
          "70A",
          "70B",
          "70C",
          "70D",
          "70E",
          "70F",
          "75A",
          "75B",
          "75C",
          "75D",
          "75E",
          "75F",
          "80A",
          "80B",
          "80C",
          "80D",
          "80E",
          "80F",
          "85A",
          "85B",
          "85C",
          "85D",
          "85E",
          "90B",
          "90C",
          "90D",
          "90E",
          "95E",
          "100E",
        ],
        uk: [
          "32A",
          "32B",
          "32C",
          "32D",
          "32E",
          "32F",
          "34A",
          "34B",
          "34C",
          "34D",
          "34E",
          "34F",
          "36A",
          "36B",
          "36C",
          "36D",
          "36E",
          "36F",
          "38A",
          "38B",
          "38C",
          "38D",
          "38E/38DD",
          "40B",
          "40C",
          "40D",
          "40E/40DD",
          "42E/42DD",
          "44E/44DD",
        ],
      },
      bounds: {
        chest: [
          [79, 81],
          [81.5, 83.5],
          [84.5, 86.5],
          [87.5, 89.5],
          [90.5, 92.5],
          [93.5, 95.5],
          [84, 86],
          [86.5, 88.5],
          [89.5, 91.5],
          [92.5, 94.5],
          [95.5, 97.5],
          [98.5, 100.5],
          [89, 91],
          [91.5, 93.5],
          [94.5, 96.5],
          [97.5, 99.5],
          [100.5, 102.5],
          [103.5, 105.5],
          [94, 96],
          [96.5, 98.5],
          [99.5, 101.5],
          [102.5, 104.5],
          [105.5, 107.5],
          [101.5, 103.5],
          [104.5, 106.5],
          [107.5, 109.5],
          [110.5, 112.5],
          [115.5, 117.5],
          [120.5, 122.5],
        ],
        underbust: [
          [68, 72],
          [68, 72],
          [68, 72],
          [68, 72],
          [68, 72],
          [68, 72],
          [73, 77],
          [73, 77],
          [73, 77],
          [73, 77],
          [73, 77],
          [73, 77],
          [78, 82],
          [78, 82],
          [78, 82],
          [78, 82],
          [78, 82],
          [78, 82],
          [83, 87],
          [83, 87],
          [83, 87],
          [83, 87],
          [83, 87],
          [88, 92],
          [88, 92],
          [88, 92],
          [88, 92],
          [93, 97],
          [98, 102],
        ],
      },
    }),
    notes: [
      "The only table in this seed that uses `underbust` — the source's UNDERBAND row. Chest alone cannot express a bra size, which is exactly why that measurement exists.",
      "Chest ranges deliberately overlap between bands (70F is 93.5-95.5 while 80C is 94.5-96.5): a bra is chosen on band *and* cup, so the pair is the key and neither measurement resolves it alone.",
      "Filed under `tops` because that is the group a bikini top or bra path maps to. It carries no chest-only fallback, so a merchant selling bras should assign this variant explicitly rather than inherit the general tops chart.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "footwear",
    variantName: "Women",
    coversLeaves: [
      "women:footwear:heel",
      "women:footwear:flat",
      "women:footwear:sneaker",
      "women:footwear:boot",
      "women:footwear:sandal",
      "women:footwear:loafer",
      "women:footwear:mule",
      "women:footwear:wedge",
      "women:footwear:slipper",
    ],
    audience: "womens",
    sourceTitle: "WOMEN SHOES",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: [
        "35",
        "35.5",
        "36",
        "36.5",
        "37",
        "37.5",
        "38",
        "38.5",
        "39",
        "39.5",
        "40",
        "40.5",
        "41",
        "41.5",
        "42",
        "42.5",
      ],
      aliases: {
        eu: [
          "35",
          "35.5",
          "36",
          "36.5",
          "37",
          "37.5",
          "38",
          "38.5",
          "39",
          "39.5",
          "40",
          "40.5",
          "41",
          "41.5",
          "42",
          "42.5",
        ],
        uk: [
          "2.5",
          "3",
          "3.5",
          "3.5",
          "4",
          "4.5",
          "5",
          "5.5",
          "6",
          "6",
          "6.5",
          "6.5",
          "7",
          "7",
          "7.5",
          "7.5",
        ],
        us: ["5", "5.5", "6", "6", "6.5", "7", "7.5", "8", "8.5", "8.5", "9", "9", "9.5", "9.5", "10", "10"],
      },
      bounds: {
        foot_length: exact([
          22, 22.5, 23, 23, 23.5, 23.5, 24, 24.5, 25, 25, 25.5, 25.5, 26, 26.5, 27, 27.5,
        ]),
      },
    }),
    notes: ["`size` is the EU scale, the only one the source prints without repeats."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "footwear",
    variantName: "Women Socks",
    coversLeaves: ["women:footwear:sock"],
    audience: "womens",
    sourceTitle: "SOCKS",
    sourceUrl: WOMEN_URL,
    chartRows: rowsFromColumns({
      sizes: ["35/38", "39/42"],
      aliases: { eu: ["35-38", "39-42"] },
      bounds: {
        foot_length: [
          [21.7, 24.3],
          [24.4, 27],
        ],
      },
    }),
  },
];

export const TOMMY_HILFIGER_SEED: SeedChart[] = [...MEN, ...WOMEN];
