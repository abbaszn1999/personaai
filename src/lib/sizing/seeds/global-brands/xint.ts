import { rowsFromColumns, type SeedChart } from "../types";

/**
 * XINT publishes this guide directly in the size-guide component embedded on its product and
 * collection pages. The body measurements are reference points, not ranges; preserve them exactly
 * rather than manufacturing boundaries around them.
 */
const SOURCE_URL = "https://www.xint.com.tr/kadin-crop";
const SOURCE_TITLE = "XINT Size Guide";

function publishedPoints(rows: SeedChart["chartRows"]): SeedChart["chartRows"] {
  return rows.map((row) => ({ ...row, source_point_values: true }));
}

const MEN_TOP_ROWS = publishedPoints(rowsFromColumns({
  sizes: ["S", "M", "L", "XL", "XXL"],
  aliases: { eu: ["46", "48", "50", "52", "54"] },
  bounds: {
    chest: [
      [97, 97],
      [101, 101],
      [105, 105],
      [109, 109],
      [113, 113],
    ],
    waist: [
      [80, 80],
      [84, 84],
      [88, 88],
      [92, 92],
      [96, 96],
    ],
  },
}));

const MEN_BOTTOM_ROWS = publishedPoints(rowsFromColumns({
  sizes: ["S", "M", "L", "XL", "XXL"],
  aliases: { eu: ["46", "48", "50", "52", "54"] },
  bounds: {
    waist: [
      [80, 80],
      [84, 84],
      [88, 88],
      [92, 92],
      [96, 96],
    ],
    hip: [
      [96, 96],
      [100, 100],
      [104, 104],
      [108, 108],
      [112, 112],
    ],
  },
}));

const WOMEN_TOP_ROWS = publishedPoints(rowsFromColumns({
  sizes: ["XS", "S", "M", "L", "XL"],
  aliases: { eu: ["34", "36", "38", "40", "42"] },
  bounds: {
    chest: [
      [82, 82],
      [86, 86],
      [90, 90],
      [94, 94],
      [98, 98],
    ],
    waist: [
      [62, 62],
      [66, 66],
      [70, 70],
      [74, 74],
      [78, 78],
    ],
  },
}));

const WOMEN_BOTTOM_ROWS = publishedPoints(rowsFromColumns({
  sizes: ["XS", "S", "M", "L", "XL"],
  aliases: { eu: ["34", "36", "38", "40", "42"] },
  bounds: {
    waist: [
      [62, 62],
      [66, 66],
      [70, 70],
      [74, 74],
      [78, 78],
    ],
    hip: [
      [90, 90],
      [94, 94],
      [98, 98],
      [102, 102],
      [106, 106],
    ],
  },
}));

export const XINT_SEED: SeedChart[] = [
  {
    brandKey: "xint",
    sizingCategory: "tops",
    variantName: "Men Tops",
    audience: "mens",
    coversLeaves: [
      "men:top:t-shirt",
      "men:top:shirt",
      "men:top:polo-shirt",
      "men:top:knit",
      "men:top:sweater",
      "men:top:hoodie",
      "men:top:sweatshirt",
      "men:top:activewear-top",
      "men:top:sleep-top",
    ],
    sourceTitle: SOURCE_TITLE,
    sourceUrl: SOURCE_URL,
    sourcePublishesPointValues: true,
    chartRows: MEN_TOP_ROWS,
  },
  {
    brandKey: "xint",
    sizingCategory: "bottoms",
    variantName: "Men Bottom Wear",
    audience: "mens",
    coversLeaves: [
      "men:bottom:trouser",
      "men:bottom:jean",
      "men:bottom:chino",
      "men:bottom:short",
      "men:bottom:jogger",
      "men:bottom:activewear-bottom",
      "men:bottom:swim-short",
      "men:bottom:sleep-bottom",
    ],
    sourceTitle: SOURCE_TITLE,
    sourceUrl: SOURCE_URL,
    sourcePublishesPointValues: true,
    chartRows: MEN_BOTTOM_ROWS,
  },
  {
    brandKey: "xint",
    sizingCategory: "footwear",
    variantName: "Men Shoes",
    audience: "mens",
    coversLeaves: [
      "men:footwear:sneaker",
      "men:footwear:dress-shoe",
      "men:footwear:boot",
      "men:footwear:loafer",
      "men:footwear:sandal",
      "men:footwear:espadrille",
      "men:footwear:slipper",
    ],
    sourceTitle: SOURCE_TITLE,
    sourceUrl: SOURCE_URL,
    chartRows: publishedPoints(rowsFromColumns({
      sizes: ["40", "41", "42", "43", "44"],
      aliases: { eu: ["40", "41", "42", "43", "44"] },
      bounds: {
        foot_length: [
          [25.6, 25.6],
          [26.3, 26.3],
          [26.9, 26.9],
          [27.6, 27.6],
          [28.3, 28.3],
        ],
      },
    })),
  },
  {
    brandKey: "xint",
    sizingCategory: "tops",
    variantName: "Women Tops",
    audience: "womens",
    coversLeaves: [
      "women:top:t-shirt",
      "women:top:shirt",
      "women:top:blouse",
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
      "women:top:swim-top",
      "women:top:sleep-top",
    ],
    sourceTitle: SOURCE_TITLE,
    sourceUrl: SOURCE_URL,
    sourcePublishesPointValues: true,
    chartRows: WOMEN_TOP_ROWS,
  },
  {
    brandKey: "xint",
    sizingCategory: "bottoms",
    variantName: "Women Bottom Wear",
    audience: "womens",
    coversLeaves: [
      "women:bottom:trouser",
      "women:bottom:jean",
      "women:bottom:skirt",
      "women:bottom:short",
      "women:bottom:legging",
      "women:bottom:culotte",
      "women:bottom:activewear-bottom",
      "women:bottom:swim-bottom",
      "women:bottom:sleep-bottom",
    ],
    sourceTitle: SOURCE_TITLE,
    sourceUrl: SOURCE_URL,
    sourcePublishesPointValues: true,
    chartRows: WOMEN_BOTTOM_ROWS,
  },
  {
    brandKey: "xint",
    sizingCategory: "footwear",
    variantName: "Women Shoes",
    audience: "womens",
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
    sourceTitle: SOURCE_TITLE,
    sourceUrl: SOURCE_URL,
    chartRows: publishedPoints(rowsFromColumns({
      sizes: ["36", "37", "38", "39", "40"],
      aliases: { eu: ["36", "37", "38", "39", "40"] },
      bounds: {
        foot_length: [
          [22.9, 22.9],
          [23.6, 23.6],
          [24.3, 24.3],
          [24.9, 24.9],
          [25.6, 25.6],
        ],
      },
    })),
  },
];
