import type { FoundSizeChart } from "../types";

/**
 * Size charts the research agent found for the global brands.
 *
 * Headers vary by category on purpose — a footwear chart has nothing in common with a tops chart,
 * and any UI that assumes one fixed column set falls apart on the first shoe. Every row is a
 * range in cm, which is the only form the fit filter can compare a shopper against.
 */
export const FOUND_SIZE_CHARTS: FoundSizeChart[] = [
  {
    id: "chart-nike-tops",
    brand: "Nike",
    categories: ["Men > Tops", "Men > Outerwear"],
    skuCount: 284,
    region: "US / EU",
    confidence: 96,
    lastUpdated: "2026-08-14",
    headers: ["Size", "Chest (cm)", "Waist (cm)", "Body Length (cm)"],
    rows: [
      { Size: "S", "Chest (cm)": "88-96", "Waist (cm)": "76-82", "Body Length (cm)": "69-71" },
      { Size: "M", "Chest (cm)": "96-104", "Waist (cm)": "82-88", "Body Length (cm)": "71-73" },
      { Size: "L", "Chest (cm)": "104-112", "Waist (cm)": "88-96", "Body Length (cm)": "73-75" },
      { Size: "XL", "Chest (cm)": "112-124", "Waist (cm)": "96-106", "Body Length (cm)": "75-78" },
      { Size: "XXL", "Chest (cm)": "124-136", "Waist (cm)": "106-118", "Body Length (cm)": "78-81" },
    ],
  },
  {
    id: "chart-adidas-bottoms",
    brand: "Adidas",
    categories: ["Men > Bottoms"],
    skuCount: 148,
    region: "EU",
    confidence: 93,
    lastUpdated: "2026-08-11",
    headers: ["Size", "Waist (cm)", "Hip (cm)", "Inseam (cm)"],
    rows: [
      { Size: "XS", "Waist (cm)": "70-74", "Hip (cm)": "86-90", "Inseam (cm)": "76" },
      { Size: "S", "Waist (cm)": "74-80", "Hip (cm)": "90-96", "Inseam (cm)": "78" },
      { Size: "M", "Waist (cm)": "80-86", "Hip (cm)": "96-102", "Inseam (cm)": "80" },
      { Size: "L", "Waist (cm)": "86-94", "Hip (cm)": "102-110", "Inseam (cm)": "82" },
      { Size: "XL", "Waist (cm)": "94-104", "Hip (cm)": "110-118", "Inseam (cm)": "82" },
    ],
  },
  {
    id: "chart-zara-women",
    brand: "Zara",
    categories: ["Women > Dresses", "Women > Tops"],
    skuCount: 388,
    region: "EU",
    confidence: 89,
    lastUpdated: "2026-07-29",
    headers: ["Size", "EU", "Bust (cm)", "Waist (cm)", "Hip (cm)"],
    rows: [
      { Size: "XS", EU: "34", "Bust (cm)": "80-84", "Waist (cm)": "62-66", "Hip (cm)": "88-92" },
      { Size: "S", EU: "36", "Bust (cm)": "84-88", "Waist (cm)": "66-70", "Hip (cm)": "92-96" },
      { Size: "M", EU: "38-40", "Bust (cm)": "88-94", "Waist (cm)": "70-76", "Hip (cm)": "96-102" },
      { Size: "L", EU: "42", "Bust (cm)": "94-100", "Waist (cm)": "76-83", "Hip (cm)": "102-108" },
    ],
  },
  {
    id: "chart-levis-denim",
    brand: "Levi's",
    categories: ["Men > Bottoms"],
    skuCount: 197,
    region: "US",
    confidence: 98,
    lastUpdated: "2026-08-02",
    headers: ["Size", "Waist (cm)", "Hip (cm)", "Inseam (cm)"],
    rows: [
      { Size: "W30", "Waist (cm)": "76-78", "Hip (cm)": "94-96", "Inseam (cm)": "81" },
      { Size: "W32", "Waist (cm)": "81-83", "Hip (cm)": "99-101", "Inseam (cm)": "81" },
      { Size: "W34", "Waist (cm)": "86-88", "Hip (cm)": "104-106", "Inseam (cm)": "81" },
      { Size: "W36", "Waist (cm)": "91-93", "Hip (cm)": "109-111", "Inseam (cm)": "86" },
    ],
  },
  {
    id: "chart-hm-tops",
    brand: "H&M",
    categories: ["Women > Tops"],
    skuCount: 156,
    region: "EU",
    confidence: 84,
    lastUpdated: "2026-06-18",
    headers: ["Size", "Bust (cm)", "Waist (cm)"],
    rows: [
      { Size: "XS", "Bust (cm)": "78-82", "Waist (cm)": "60-64" },
      { Size: "S", "Bust (cm)": "82-88", "Waist (cm)": "64-70" },
      { Size: "M", "Bust (cm)": "88-94", "Waist (cm)": "70-76" },
      { Size: "L", "Bust (cm)": "94-102", "Waist (cm)": "76-84" },
    ],
  },
  {
    id: "chart-uniqlo-tops",
    brand: "Uniqlo",
    categories: ["Men > Tops"],
    skuCount: 121,
    region: "JP / EU",
    confidence: 91,
    lastUpdated: "2026-08-20",
    headers: ["Size", "Chest (cm)", "Body Length (cm)", "Shoulder (cm)"],
    rows: [
      { Size: "S", "Chest (cm)": "92", "Body Length (cm)": "66", "Shoulder (cm)": "42" },
      { Size: "M", "Chest (cm)": "98", "Body Length (cm)": "69", "Shoulder (cm)": "44" },
      { Size: "L", "Chest (cm)": "104", "Body Length (cm)": "72", "Shoulder (cm)": "46" },
      { Size: "XL", "Chest (cm)": "112", "Body Length (cm)": "75", "Shoulder (cm)": "48" },
    ],
  },
];

/**
 * The delta-sync view of the same registry.
 *
 * The Nike chart is reused rather than re-researched — that reuse is the entire cost argument for
 * a shared registry, so the flag is surfaced in the UI rather than left implicit.
 */
export const NEW_SYNC_FOUND_SIZE_CHARTS: FoundSizeChart[] = [
  {
    ...FOUND_SIZE_CHARTS[0],
    skuCount: 12,
    isInheritedFromSetup: true,
    inheritedFromSetupLabel: "Reused from initial setup",
    sourceOrigin: "setup_cached",
    researchStatus: "done",
  },
  {
    id: "chart-puma-outerwear",
    brand: "Puma",
    categories: ["Men > Outerwear"],
    skuCount: 9,
    region: "EU",
    confidence: 88,
    lastUpdated: "2026-09-01",
    headers: ["Size", "Chest (cm)", "Waist (cm)", "Sleeve (cm)"],
    rows: [
      { Size: "S", "Chest (cm)": "90-96", "Waist (cm)": "78-84", "Sleeve (cm)": "62" },
      { Size: "M", "Chest (cm)": "96-102", "Waist (cm)": "84-90", "Sleeve (cm)": "64" },
      { Size: "L", "Chest (cm)": "102-110", "Waist (cm)": "90-98", "Sleeve (cm)": "66" },
      { Size: "XL", "Chest (cm)": "110-120", "Waist (cm)": "98-108", "Sleeve (cm)": "68" },
      { Size: "XXL", "Chest (cm)": "120-130", "Waist (cm)": "108-118", "Sleeve (cm)": "70" },
    ],
    sourceOrigin: "delta_researched",
    isResearched: true,
    researchStatus: "done",
  },
];
