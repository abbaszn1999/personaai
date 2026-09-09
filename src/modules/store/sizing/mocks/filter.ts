import type { CategoryFilterConfig } from "../types";

/**
 * Default tolerances for the exclusion filter, per category.
 *
 * The asymmetry is the point. Footwear gets almost none — a shoe two sizes off is unwearable —
 * while an oversized top can run well over its chart range and still be the right buy. These
 * widen the range a shopper is checked against; they never touch the chart itself.
 */
export const INITIAL_FILTER_CONFIGS: CategoryFilterConfig[] = [
  {
    id: "filter-tops",
    name: "Tops",
    categoryPath: "Men > Tops, Women > Tops",
    iconName: "shirt",
    categoryType: "tops",
    defaultIncreaseCm: 6,
    defaultDecreaseCm: 3,
    skuCount: 892,
    sampleMeasurement: "Chest",
    sampleBaseRange: { min: 96, max: 104, unit: "cm", sizeLabel: "M" },
    brands: [
      { name: "Nike", brandType: "global", skuCount: 284, fitNote: "True to size" },
      { name: "Zara", brandType: "global", skuCount: 231, fitNote: "Runs small" },
      { name: "Uniqlo", brandType: "global", skuCount: 121, fitNote: "True to size" },
      { name: "Urban Basics Co", brandType: "private", skuCount: 174, fitNote: "Boxy, runs large" },
    ],
    brandOverrides: {
      Zara: { increaseCm: 8, decreaseCm: 1 },
      "Urban Basics Co": { increaseCm: 4, decreaseCm: 6 },
    },
  },
  {
    id: "filter-bottoms",
    name: "Bottoms",
    categoryPath: "Men > Bottoms, Women > Bottoms",
    iconName: "bottoms",
    categoryType: "bottoms",
    defaultIncreaseCm: 4,
    defaultDecreaseCm: 2,
    skuCount: 488,
    sampleMeasurement: "Waist",
    sampleBaseRange: { min: 80, max: 86, unit: "cm", sizeLabel: "M" },
    brands: [
      { name: "Levi's", brandType: "global", skuCount: 197, fitNote: "True to size" },
      { name: "Adidas", brandType: "global", skuCount: 148, fitNote: "Slightly generous" },
      { name: "Local Streetwear Co", brandType: "private", skuCount: 143, fitNote: "Runs small" },
    ],
    brandOverrides: {
      "Local Streetwear Co": { increaseCm: 6, decreaseCm: 1 },
    },
  },
  {
    id: "filter-outerwear",
    name: "Outerwear",
    categoryPath: "Men > Outerwear",
    iconName: "jacket",
    categoryType: "outerwear",
    defaultIncreaseCm: 8,
    defaultDecreaseCm: 2,
    skuCount: 213,
    sampleMeasurement: "Chest",
    sampleBaseRange: { min: 102, max: 110, unit: "cm", sizeLabel: "L" },
    brands: [
      { name: "Nike", brandType: "global", skuCount: 128, fitNote: "Layering fit" },
      { name: "Puma", brandType: "global", skuCount: 85, fitNote: "True to size" },
    ],
    brandOverrides: {},
  },
  {
    id: "filter-dresses",
    name: "Dresses",
    categoryPath: "Women > Dresses",
    iconName: "dress",
    categoryType: "dresses",
    defaultIncreaseCm: 3,
    defaultDecreaseCm: 2,
    skuCount: 157,
    sampleMeasurement: "Bust",
    sampleBaseRange: { min: 88, max: 94, unit: "cm", sizeLabel: "M" },
    brands: [{ name: "Zara", brandType: "global", skuCount: 157, fitNote: "Runs small" }],
    brandOverrides: {
      Zara: { increaseCm: 5, decreaseCm: 1 },
    },
  },
  {
    id: "filter-footwear",
    name: "Footwear",
    categoryPath: "Footwear",
    iconName: "shoe",
    categoryType: "footwear",
    // Almost no tolerance: a shoe outside its range is simply the wrong shoe.
    defaultIncreaseCm: 0.5,
    defaultDecreaseCm: 0.5,
    skuCount: 264,
    sampleMeasurement: "Foot length",
    sampleBaseRange: { min: 26.5, max: 26.5, unit: "cm", sizeLabel: "EU 42" },
    brands: [
      { name: "Nike", brandType: "global", skuCount: 122, fitNote: "Runs narrow" },
      { name: "No brand detected", brandType: "null", skuCount: 84 },
    ],
    brandOverrides: {
      Nike: { increaseCm: 1, decreaseCm: 0.5 },
    },
  },
  {
    id: "filter-accessories",
    name: "Accessories",
    categoryPath: "Accessories",
    iconName: "accessory",
    categoryType: "accessories",
    // Mostly one-size stock, so the filter should rarely exclude anything at all.
    defaultIncreaseCm: 10,
    defaultDecreaseCm: 10,
    skuCount: 113,
    sampleMeasurement: "Head circumference",
    sampleBaseRange: { min: 54, max: 60, unit: "cm", sizeLabel: "One Size" },
    brands: [{ name: "No brand detected", brandType: "null", skuCount: 113 }],
    brandOverrides: {},
  },
];

export const FILTER_PRESETS = [
  {
    id: "strict",
    label: "Strict",
    description: "Only near-exact matches. Fewest results, highest confidence.",
    multiplier: 0.5,
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Persona's defaults, tuned per category.",
    multiplier: 1,
  },
  {
    id: "generous",
    label: "Generous",
    description: "Widest net. Keeps borderline fits in play for the agent to judge.",
    multiplier: 1.75,
  },
] as const;
