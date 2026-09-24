import { exact, rowsFromColumns, type SeedChart } from "./types";

/**
 * Tommy Hilfiger childrenswear, from https://uk.tommy.com/children-size-guide.
 *
 * Kept in its own file because kidswear breaks two assumptions the adult tables hold, and the reasons
 * are worth having in one place rather than repeated per chart:
 *
 * 1. **The guide publishes one number per size, not a range.** An infant chest is `38.5`, not
 *    `37-40`. For a girth that is a defect — see `sourcePublishesPointValues` — and it is recorded as
 *    published rather than widened, because a width this file invented would be indistinguishable
 *    downstream from one Tommy printed.
 *
 * 2. **The size label *is* a body measurement.** European kids sizing is height in cm: size 92 means a
 *    92cm child. So `height` is the one measurement here that can honestly carry a range, because the
 *    scale itself defines the bands — a child between 86 and 92cm takes the 92. The lowest size in
 *    each table is left open at the bottom for the same reason the top row of an adult chart is open
 *    at the top: a smaller child still needs the smallest size rather than no size.
 *
 * The audiences split three ways, matching AUDIENCES: `kids` for the infant and unisex tables, `boys`
 * and `girls` for the tables Tommy publishes separately by gender. They diverge genuinely — a girls 16
 * is a 166cm child and a boys 16 is 176cm — so folding them together would size both wrong.
 */

const KIDS_URL = "https://uk.tommy.com/children-size-guide";
const BRAND = "tommy_hilfiger";

/* ───────────────────────────────── Infant (0-24 months) ───────────────────────────────── */

const INFANT_SIZES = ["PRE44", "PRE50", "NB", "3M", "6M", "9M", "12M", "18M", "24M"] as const;

// `age`, not `alpha`: PRE44/NB/3M... is a month-of-life band, not an S/M/L label, and an
// Alpha-declared store's raw "M" must never resolve against a row here on that account.
const INFANT_ALIASES = {
  age: ["PRE44", "PRE50", "NB", "3M", "6M", "9M", "12M", "18M", "24M"],
  eu: ["44", "50", "56", "62", "68", "74", "80", "86", "92"],
} as const;

/** The EU cm scale read as the bands it is: each size covers up to its own number, from the previous
 *  size's. Open below 44cm — a preterm infant still needs the smallest garment. */
const INFANT_HEIGHT = [
  [null, 44],
  [44, 50],
  [50, 56],
  [56, 62],
  [62, 68],
  [68, 74.25],
  [74.25, 80.25],
  [80.25, 86],
  [86, 92],
] as const;

const INFANT: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Infant",
    // `kids-unisex` is this taxonomy's baby/toddler department, and "Infant" is Tommy's own 0-24
    // month table — the two line up exactly, so every kids-unisex tops leaf claims this chart.
    coversLeaves: [
      "kids-unisex:top:t-shirt",
      "kids-unisex:top:shirt",
      "kids-unisex:top:knit",
      "kids-unisex:top:hoodie",
      "kids-unisex:top:sweatshirt",
      "kids-unisex:top:bodysuit",
      "kids-unisex:top:sleep-top",
    ],
    audience: "kids",
    sourceTitle: "INFANT - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: INFANT_SIZES,
      aliases: INFANT_ALIASES,
      bounds: {
        height: INFANT_HEIGHT,
        chest: exact([31.75, 36, 38.5, 43, 45.5, 47, 49.5, 50.75, 52.5]),
        shoulder: exact([13.75, 15.75, 17, 18.25, 19.25, 20.5, 21.5, 22.5, 23.75]),
        neck: exact([17.25, 19.5, 21.25, 22, 22.5, 23.5, 24, 24.5, 25]),
      },
    }),
    notes: [
      "One table in the source serves tops and bottoms; it is split here because our five groups need the chest columns on `tops` and the waist/inseam columns on `bottoms`.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Infant",
    coversLeaves: [
      "kids-unisex:outerwear:jacket",
      "kids-unisex:outerwear:coat",
      "kids-unisex:outerwear:cardigan",
      "kids-unisex:outerwear:snowsuit",
      "kids-unisex:outerwear:pramsuit",
    ],
    audience: "kids",
    sourceTitle: "INFANT - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: INFANT_SIZES,
      aliases: INFANT_ALIASES,
      bounds: {
        height: INFANT_HEIGHT,
        chest: exact([31.75, 36, 38.5, 43, 45.5, 47, 49.5, 50.75, 52.5]),
        shoulder: exact([13.75, 15.75, 17, 18.25, 19.25, 20.5, 21.5, 22.5, 23.75]),
        neck: exact([17.25, 19.5, 21.25, 22, 22.5, 23.5, 24, 24.5, 25]),
      },
    }),
    notes: ["Same table as the Infant `tops` variant — baby outerwear is sized on the same body."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Infant",
    coversLeaves: [
      "kids-unisex:bottom:trouser",
      "kids-unisex:bottom:jean",
      "kids-unisex:bottom:short",
      "kids-unisex:bottom:legging",
      "kids-unisex:bottom:jogger",
      "kids-unisex:bottom:sleep-bottom",
    ],
    audience: "kids",
    sourceTitle: "INFANT - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: INFANT_SIZES,
      aliases: INFANT_ALIASES,
      bounds: {
        height: INFANT_HEIGHT,
        waist: exact([31.75, 36, 38.75, 43, 45, 46.5, 48.75, 49.75, 50.5]),
        hip: exact([30, 34, 37, 42, 44.75, 47.5, 50, 51.5, 53]),
        inseam: exact([15, 15, 17, 19.25, 21.75, 24.25, 27, 31.25, 34.5]),
      },
    }),
    notes: [
      "The source's LOW HIP row is recorded as `hip`: it is the only hip measurement the table publishes, and dropping it would leave infant bottoms on waist alone.",
      "Inseam repeats 15cm for PRE44 and PRE50 — verbatim from the source, not a transcription slip.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Infant",
    // A romper, all-in-one and sleepsuit are baby garments cut across the whole body, and the one
    // INFANT table already gives chest, waist and hip for this exact age range — the same table
    // reused a fourth time, on the same reasoning as the tops/outerwear/bottoms variants above.
    // `swimsuit` stays unclaimed: no infant-specific swim table exists in this guide, and this
    // clothing table's own heading never mentions swimwear.
    coversLeaves: [
      "kids-unisex:full-body:romper",
      "kids-unisex:full-body:all-in-one",
      "kids-unisex:full-body:sleepsuit",
      "kids-unisex:full-body:set",
    ],
    audience: "kids",
    sourceTitle: "INFANT - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: INFANT_SIZES,
      aliases: INFANT_ALIASES,
      bounds: {
        height: INFANT_HEIGHT,
        chest: exact([31.75, 36, 38.5, 43, 45.5, 47, 49.5, 50.75, 52.5]),
        waist: exact([31.75, 36, 38.75, 43, 45, 46.5, 48.75, 49.75, 50.5]),
        hip: exact([30, 34, 37, 42, 44.75, 47.5, 50, 51.5, 53]),
      },
    }),
    notes: ["Same table as the Infant `tops`/`outerwear`/`bottoms` variants — a onesie is sized on the same body as any other baby garment on this page."],
  },
];

/* ──────────────────────────────────── Boys (3-16 years) ──────────────────────────────────── */

const BOYS_SIZES = ["98", "104", "110", "116", "122", "128", "140", "152", "164", "176"] as const;

// `age`, not `alpha`: "3y".."16y" is a year-of-life band, the same reason infant's month labels
// moved off `alpha` above.
const BOYS_ALIASES = {
  eu: ["98", "104", "110", "116", "122", "128", "140", "152", "164", "176"],
  age: ["3y", "4y", "5y", "6y", "7y", "8-9y", "10-11y", "12-13y", "14-15y", "16y"],
} as const;

const BOYS_HEIGHT = [
  [null, 98],
  [98, 104],
  [104, 110],
  [110, 116],
  [116, 122],
  [122, 128],
  [128, 140],
  [140, 152],
  [152, 164],
  [164, 176],
] as const;

const BOYS: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Boys",
    // The only boys tops chart, so it takes every leaf in the group.
    coversLeaves: [
      "kids-boys:top:t-shirt",
      "kids-boys:top:shirt",
      "kids-boys:top:knit",
      "kids-boys:top:hoodie",
      "kids-boys:top:sweatshirt",
      "kids-boys:top:bodysuit",
      "kids-boys:top:activewear-top",
      "kids-boys:top:sleep-top",
    ],
    audience: "boys",
    sourceTitle: "BOYS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: BOYS_SIZES,
      aliases: BOYS_ALIASES,
      bounds: {
        height: BOYS_HEIGHT,
        chest: exact([54.25, 56, 58, 60.5, 63, 64, 71, 78, 86, 91.5]),
        shoulder: exact([24.25, 25.5, 25.75, 27, 27.75, 29, 30.75, 33.5, 35.75, 37]),
        neck: exact([25.5, 26, 26.5, 27.5, 28.5, 29.75, 31, 33, 34.5, 37]),
      },
    }),
    notes: ["`size` is the EU height scale, which is what boys garments are labelled with; the year range is the alpha alias."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Boys",
    coversLeaves: [
      "kids-boys:outerwear:jacket",
      "kids-boys:outerwear:coat",
      "kids-boys:outerwear:cardigan",
      "kids-boys:outerwear:snowsuit",
      "kids-boys:outerwear:pramsuit",
    ],
    audience: "boys",
    sourceTitle: "BOYS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: BOYS_SIZES,
      aliases: BOYS_ALIASES,
      bounds: {
        height: BOYS_HEIGHT,
        chest: exact([54.25, 56, 58, 60.5, 63, 64, 71, 78, 86, 91.5]),
        shoulder: exact([24.25, 25.5, 25.75, 27, 27.75, 29, 30.75, 33.5, 35.75, 37]),
        neck: exact([25.5, 26, 26.5, 27.5, 28.5, 29.75, 31, 33, 34.5, 37]),
      },
    }),
    notes: ["Same table as the Boys `tops` variant."],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Boys",
    coversLeaves: [
      "kids-boys:bottom:trouser",
      "kids-boys:bottom:jean",
      "kids-boys:bottom:short",
      "kids-boys:bottom:legging",
      "kids-boys:bottom:jogger",
      "kids-boys:bottom:swim-short",
      "kids-boys:bottom:sleep-bottom",
    ],
    audience: "boys",
    sourceTitle: "BOYS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: BOYS_SIZES,
      aliases: BOYS_ALIASES,
      bounds: {
        height: BOYS_HEIGHT,
        waist: exact([52.5, 54.5, 55, 56, 57, 59, 63.5, 68, 73, 76.25]),
        hip: exact([56, 60, 62, 64, 66, 68, 74.25, 81, 89, 94]),
        inseam: exact([41, 45.5, 49.25, 52, 56, 59.25, 65, 70.05, 76.25, 82]),
      },
    }),
    notes: [
      "The source prints inseam 70.05 at size 152. Almost certainly 70.5 on the brand's side, but transcribed verbatim: unlike the women's swimsuit hip, no sibling table proves the intent, and inseam is a length the filter never excludes on.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Boys Sleepwear Sets",
    // "BOYS PYJAMA SETS" on its own heading, with the same age-to-height bands as the girls sibling
    // table but a different chest/waist/hip run — the two are genuinely separate tables, not one
    // relabelled. There is no boys swimsuit or bikini-set heading (boys' swimwear is the swim-short
    // already covered under `bottom`), so `set` is the only full-body leaf this chart claims.
    coversLeaves: ["kids-boys:full-body:set"],
    audience: "boys",
    sourceTitle: "BOYS PYJAMA SETS",
    sourceUrl: KIDS_URL,
    chartRows: rowsFromColumns({
      sizes: ["XS", "S", "M", "L", "XL", "XXL"],
      aliases: {
        alpha: ["XS", "S", "M", "L", "XL", "XXL"],
        age: ["4-5y", "6-7y", "8-10y", "10-12y", "12-14y", "14-16y"],
      },
      bounds: {
        height: [
          [104, 110],
          [116, 122],
          [128, 140],
          [140, 152],
          [152, 164],
          [164, 176],
        ],
        chest: [
          [56, 58],
          [60.5, 63],
          [64, 71],
          [71, 78],
          [78, 86],
          [86, 91.5],
        ],
        waist: [
          [54.5, 55],
          [56, 57],
          [59, 63.5],
          [63.5, 68],
          [68, 73],
          [73, 76.5],
        ],
        hip: [
          [60, 62],
          [64, 66],
          [68, 74.5],
          [74.5, 81],
          [81, 89],
          [89, 94],
        ],
      },
    }),
    notes: [
      "`age`, not `alpha`, matching every other kids chart in this file — the SIZE/AGE row is a year band, not an S/M/L label.",
    ],
  },
];

/* ─────────────────────────────────── Girls (3-16 years) ─────────────────────────────────── */

const GIRLS_SIZES = ["98", "104", "110", "116", "122", "128", "140", "152", "164", "166"] as const;

const GIRLS_ALIASES = {
  eu: ["98", "104", "110", "116", "122", "128", "140", "152", "164", "166"],
  age: ["3y", "4y", "5y", "6y", "7y", "8-9y", "10-11y", "12-13y", "14-15y", "16y"],
} as const;

const GIRLS_HEIGHT = [
  [null, 98],
  [98, 104],
  [104, 110],
  [110, 116],
  [116, 122],
  [122, 128],
  [128, 140],
  [140, 152],
  [152, 164],
  [164, 166],
] as const;

const GIRLS: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "tops",
    variantName: "Girls",
    // The only girls tops chart, so it takes every leaf in the group — the truncated size range
    // (see the note below) is a coverage gap within the chart, not a reason to leave a leaf
    // unclaimed.
    coversLeaves: [
      "kids-girls:top:t-shirt",
      "kids-girls:top:shirt",
      "kids-girls:top:blouse",
      "kids-girls:top:knit",
      "kids-girls:top:hoodie",
      "kids-girls:top:sweatshirt",
      "kids-girls:top:bodysuit",
      "kids-girls:top:activewear-top",
      "kids-girls:top:sleep-top",
    ],
    audience: "girls",
    sourceTitle: "GIRLS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    // Only the five sizes the source publishes a chest for. Tommy prints `n/a` from 8-9 years up, and
    // a tops chart whose upper half carries no chest would pass a whole-chart check and then quietly
    // exclude every older girl from results. Truncating is visible; a half-empty chart is not.
    chartRows: rowsFromColumns({
      sizes: ["98", "104", "110", "116", "122"],
      aliases: {
        eu: ["98", "104", "110", "116", "122"],
        age: ["3y", "4y", "5y", "6y", "7y"],
      },
      bounds: {
        height: [
          [null, 98],
          [98, 104],
          [104, 110],
          [110, 116],
          [116, 122],
        ],
        chest: exact([54.25, 56, 58, 60.5, 63]),
        shoulder: exact([24.25, 25.5, 25.75, 27, 27.75]),
        neck: exact([25.5, 26, 26.5, 27.5, 28.5]),
      },
    }),
    notes: [
      "Stops at size 122 (7 years) because the source's CHEST row reads `n/a` for 8-9 years and every size above it. A real hole in Tommy's own data, not an omission here — girls' tops from 8 years up are uncharted until the brand publishes a chest, and the bathrobe table below is the only chart covering that age with a chest range.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "outerwear",
    variantName: "Girls",
    coversLeaves: [
      "kids-girls:outerwear:jacket",
      "kids-girls:outerwear:coat",
      "kids-girls:outerwear:cardigan",
      "kids-girls:outerwear:snowsuit",
      "kids-girls:outerwear:pramsuit",
    ],
    audience: "girls",
    sourceTitle: "GIRLS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    // Same table and the same truncation as the Girls `tops` variant above — see that chart's note.
    // Boys got this split (one source table, two `sizingCategory` rows); girls never did, which is
    // exactly the gap this variant closes rather than a difference the brand actually publishes.
    chartRows: rowsFromColumns({
      sizes: ["98", "104", "110", "116", "122"],
      aliases: {
        eu: ["98", "104", "110", "116", "122"],
        age: ["3y", "4y", "5y", "6y", "7y"],
      },
      bounds: {
        height: [
          [null, 98],
          [98, 104],
          [104, 110],
          [110, 116],
          [116, 122],
        ],
        chest: exact([54.25, 56, 58, 60.5, 63]),
        shoulder: exact([24.25, 25.5, 25.75, 27, 27.75]),
        neck: exact([25.5, 26, 26.5, 27.5, 28.5]),
      },
    }),
    notes: [
      "Same table as the Girls `tops` variant, truncated at size 122 (7 years) for the same reason: the source's CHEST row is `n/a` from 8-9 years up.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Girls",
    // `dress` is the only full-body leaf a plain chest/waist/hip grid can honestly answer for — a
    // romper, all-in-one or sleepsuit is a garment name this brand never prints for girls this age,
    // so those stay unclaimed rather than borrowing this chart's numbers for a different product.
    coversLeaves: ["kids-girls:full-body:dress"],
    audience: "girls",
    sourceTitle: "GIRLS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    // Chest comes from the same truncated five sizes as the Girls tops/outerwear variants (the
    // source has no chest past 7 years); waist and hip are the first five rows of the Girls bottoms
    // table above, which does publish the full ten. A dress needs all three, so this combines two
    // real, already-transcribed ranges rather than inventing a fourth table.
    chartRows: rowsFromColumns({
      sizes: ["98", "104", "110", "116", "122"],
      aliases: {
        eu: ["98", "104", "110", "116", "122"],
        age: ["3y", "4y", "5y", "6y", "7y"],
      },
      bounds: {
        height: [
          [null, 98],
          [98, 104],
          [104, 110],
          [110, 116],
          [116, 122],
        ],
        chest: exact([54.25, 56, 58, 60.5, 63]),
        waist: exact([52.5, 54.5, 55, 56, 57]),
        hip: exact([56, 60, 62, 64, 66]),
      },
    }),
    notes: [
      "Chest is the Girls tops/outerwear chart's own truncated range; waist and hip are the first five rows of the Girls bottoms chart. Not a new source table — both halves are already published for these same five sizes, just never combined into one full-body row before.",
      "Stops at size 122 (7 years) because that is where the chest half runs out, even though the Girls bottoms chart's waist/hip continue to size 166. A dress without a chest bound is not a real answer, so the row is dropped rather than left half-filled.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "bottoms",
    variantName: "Girls",
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
    sourceTitle: "GIRLS - CLOTHING",
    sourceUrl: KIDS_URL,
    sourcePublishesPointValues: true,
    chartRows: rowsFromColumns({
      sizes: GIRLS_SIZES,
      aliases: GIRLS_ALIASES,
      bounds: {
        height: GIRLS_HEIGHT,
        waist: exact([52.5, 54.5, 55, 56, 57, 58, 61.75, 65.5, 67.25, 69]),
        hip: exact([56, 60, 62, 64, 66, 70, 77, 84, 88, 92]),
        inseam: exact([41, 45.5, 49.25, 52, 56, 59.75, 65.75, 71.5, 77.5, 78.5]),
      },
    }),
    notes: [
      "Full ten sizes, unlike the girls tops chart: waist is published all the way up, and waist is what `bottoms` requires.",
      "The top size is 166cm, not the boys' 176cm — the two scales genuinely diverge at the top, which is why they are separate audiences rather than one kids chart.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Girls Swim & Sleepwear Sets",
    // A distinct source table from "GIRLS - CLOTHING" above, with its own age-to-height bands and,
    // crucially, a chest column that keeps going where that one stops at 7 years — this is a
    // different real chart, not the same one repeated. Only the two garments its own heading names:
    // a girls' one-piece swimsuit and a pyjama/bikini set are full-body-sized products, so both map
    // here; a `dress` is not this heading's product and stays on the "Girls" `dresses` variant above.
    coversLeaves: ["kids-girls:full-body:swimsuit", "kids-girls:full-body:set"],
    audience: "girls",
    sourceTitle: "GIRLS PYJAMA SETS, BIKINI SETS, BATHINGSUITS",
    sourceUrl: KIDS_URL,
    chartRows: rowsFromColumns({
      sizes: ["XS", "S", "M", "L", "XL", "XXL"],
      aliases: {
        alpha: ["XS", "S", "M", "L", "XL", "XXL"],
        age: ["4-5y", "6-7y", "8-10y", "10-12y", "12-14y", "14-16y"],
      },
      bounds: {
        height: [
          [104, 110],
          [116, 122],
          [128, 140],
          [140, 152],
          [152, 164],
          [164, 176],
        ],
        chest: [
          [56, 58],
          [60.5, 63],
          [65, 71.5],
          [71.5, 78],
          [78, 82.5],
          [82.5, 87],
        ],
        waist: [
          [54.5, 55],
          [56, 57],
          [58, 62],
          [62, 65.5],
          [65.5, 67],
          [67, 69],
        ],
        hip: [
          [60, 62],
          [64, 66],
          [70, 77],
          [77, 84],
          [84, 88],
          [88, 92],
        ],
      },
    }),
    notes: [
      "`age`, not `alpha`: the source's SIZE/AGE row (4-5, 6-7, 8-10...) is a year band, the same reason every other kids chart in this file keeps age off the alpha alias.",
      "This chest column reaches 8-16 years, which the main Girls tops/outerwear/dresses tables cannot — Tommy's `n/a` gap on those tables is specific to that table, not to girls' chest as a measurement, and this sibling table is the honest way to say so rather than a contradiction to resolve.",
    ],
  },
];

/* ──────────────────────────── Kids unisex — the one ranged table ──────────────────────────── */

const KIDS_UNISEX: SeedChart[] = [
  {
    brandKey: BRAND,
    sizingCategory: "dresses",
    variantName: "Kids Bathrobes",
    // The only chart of any kind that claims the `bathrobe` leaf, for any of the three kids
    // departments — Tommy publishes it once for boys, girls and unisex alike, and none of them has
    // a competing chart to disambiguate against, so this is a confident, uncontested match.
    coversLeaves: [
      "kids-boys:full-body:bathrobe",
      "kids-girls:full-body:bathrobe",
      "kids-unisex:full-body:bathrobe",
    ],
    audience: "kids",
    sourceTitle: "KIDS BATHROBES",
    sourceUrl: KIDS_URL,
    chartRows: rowsFromColumns({
      sizes: ["S", "M", "L", "XL"],
      // The source's second column is "8-10y" etc, an age band, not an EU number — fixed from an
      // earlier `eu` mislabel that would have told an EU-declared store these rows answer to a
      // country size they do not carry at all.
      aliases: {
        alpha: ["S", "M", "L", "XL"],
        age: ["8-10y", "10-12y", "12-14y", "14-16y"],
      },
      bounds: {
        height: [
          [128, 140],
          [140, 152],
          [152, 164],
          [164, 170],
        ],
        chest: [
          [65, 71],
          [71, 78],
          [78, 86],
          [82.5, 87],
        ],
        waist: [
          [58, 63.5],
          [62, 68],
          [65.5, 73],
          [67, 69],
        ],
        hip: [
          [68, 77],
          [74.5, 84],
          [81, 89],
          [88, 92],
        ],
      },
    }),
    notes: [
      "The only childrenswear table Tommy publishes as ranges rather than points, which is why it carries no `sourcePublishesPointValues` flag.",
      "Filed under `dresses` (Dresses / Full-body): a bathrobe is one garment sized on the whole body. Audience is `kids` rather than boys or girls because the source publishes it once for both.",
      "XL is narrower than L on chest (82.5-87 against 78-86) and waist (67-69 against 65.5-73). Verbatim from the source — the mins still rise, so this is the brand tightening its top size rather than a misaligned column.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "footwear",
    variantName: "Infant",
    // Deliberately NOT exclusive: `kids-unisex:footwear:*` also appears on "Boys & Girls" below.
    // Nothing in the leaf itself says whether a merchant's gender-neutral shoe category means a
    // newborn's first bootie (this chart, EU 19-26.5) or a ten-year-old's sneaker (that one, EU
    // 27-41) — the two age bands are genuinely disjoint, and only the merchant knows which their
    // stock is. Listing it on both charts surfaces that as a conflict for Stage 5 to resolve rather
    // than silently guessing one age band. `sock` is left off both: no kids sock chart exists here.
    coversLeaves: [
      "kids-unisex:footwear:sneaker",
      "kids-unisex:footwear:shoe",
      "kids-unisex:footwear:boot",
      "kids-unisex:footwear:sandal",
      "kids-unisex:footwear:bootie",
      "kids-unisex:footwear:slipper",
    ],
    audience: "kids",
    sourceTitle: "INFANT - SHOES",
    sourceUrl: KIDS_URL,
    chartRows: rowsFromColumns({
      sizes: [
        "19",
        "19.5",
        "20",
        "20.5",
        "21",
        "21.5",
        "22",
        "22.5",
        "23",
        "23.5",
        "24",
        "24.5",
        "25",
        "25.5",
        "26",
        "26.5",
      ],
      aliases: {
        eu: [
          "19",
          "19.5",
          "20",
          "20.5",
          "21",
          "21.5",
          "22",
          "22.5",
          "23",
          "23.5",
          "24",
          "24.5",
          "25",
          "25.5",
          "26",
          "26.5",
        ],
        uk: ["3", "3.5", "4", "4.5", "5", "5", "5.5", "5.5", "6", "6.5", "7", "7", "7.5", "8", "8.5", "9"],
        us: ["4", "4.5", "5", "5", "5.5", "5.5", "6", "6", "6.5", "7", "7.5", "7.5", "8", "8.5", "9", "9.5"],
      },
      bounds: {
        foot_length: exact([
          11.5, 12, 12.5, 12.5, 13, 13, 13.5, 13.5, 14, 14.5, 15, 15, 15.5, 16, 16.5, 17,
        ]),
      },
    }),
    notes: [
      "The source prints EU 25 twice, at 15.5cm and 16cm. The duplicate is dropped and its 16cm folded onto EU 25.5, because two rows answering to the label `25` cannot be told apart at match time.",
    ],
  },
  {
    brandKey: BRAND,
    sizingCategory: "footwear",
    variantName: "Boys & Girls",
    // The confident, exclusive answer for kids-boys and kids-girls footwear leaves — this brand
    // names the chart for exactly those two departments and the age range (EU 27-41) matches
    // neither infant nor toddler. `kids-unisex:footwear:*` also appears here, deliberately
    // duplicated with "Infant" above — see that chart's note for why it is a conflict rather than
    // a pick. `sock` is left off: no kids sock chart exists in this guide.
    coversLeaves: [
      "kids-boys:footwear:sneaker",
      "kids-boys:footwear:shoe",
      "kids-boys:footwear:boot",
      "kids-boys:footwear:sandal",
      "kids-boys:footwear:bootie",
      "kids-boys:footwear:slipper",
      "kids-girls:footwear:sneaker",
      "kids-girls:footwear:shoe",
      "kids-girls:footwear:boot",
      "kids-girls:footwear:sandal",
      "kids-girls:footwear:bootie",
      "kids-girls:footwear:slipper",
      "kids-unisex:footwear:sneaker",
      "kids-unisex:footwear:shoe",
      "kids-unisex:footwear:boot",
      "kids-unisex:footwear:sandal",
      "kids-unisex:footwear:bootie",
      "kids-unisex:footwear:slipper",
    ],
    audience: "kids",
    sourceTitle: "BOY/GIRL - SHOES",
    sourceUrl: KIDS_URL,
    chartRows: rowsFromColumns({
      sizes: [
        "27",
        "27.5",
        "28",
        "28.5",
        "29",
        "29.5",
        "30",
        "30.5",
        "31",
        "31.5",
        "32",
        "32.5",
        "33",
        "33.5",
        "34",
        "34.5",
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
        "41",
      ],
      aliases: {
        eu: [
          "27",
          "27.5",
          "28",
          "28.5",
          "29",
          "29.5",
          "30",
          "30.5",
          "31",
          "31.5",
          "32",
          "32.5",
          "33",
          "33.5",
          "34",
          "34.5",
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
          "41",
        ],
        us: [
          "9.5",
          "10",
          "10.5",
          "11",
          "11.5",
          "11.5",
          "12",
          "12",
          "13",
          "13.5",
          "14",
          "14",
          "15",
          "1.5",
          "2",
          "2.5",
          "2.5",
          "3.5",
          "4",
          "4",
          "4.5",
          "5",
          "5.5",
          "6",
          "6.5",
          "6.5",
          "7",
          "8",
        ],
      },
      bounds: {
        foot_length: exact([
          17, 17, 17.5, 18, 18.5, 19, 19.5, 20, 20.5, 20.5, 21, 21, 21.5, 21.5, 22, 22, 22.5, 22.5, 23, 23,
          23.5, 23.5, 24, 24.5, 25, 25, 25.5, 26,
        ]),
      },
    }),
    notes: [
      "No UK aliases: the source's UK row was not legible in full, and a guessed conversion is worse than an absent one — a wrong UK label silently matches the wrong shoe.",
      "The US column resets from 15 to 1.5 at EU 33.5, which is the real US youth-to-adult rollover, not a transcription error. It is also why `size` is the EU scale here: the US labels are not monotonic and `1.5` appears on both sides of that boundary across Tommy's tables.",
    ],
  },
];

export const TOMMY_HILFIGER_KIDS_SEED: SeedChart[] = [...INFANT, ...BOYS, ...GIRLS, ...KIDS_UNISEX];
