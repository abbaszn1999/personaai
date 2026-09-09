import type { GapItem } from "../types";

/**
 * Brand+category combinations with no chart behind them.
 *
 * These are the ones no amount of web search can fix: a store's own label has no public size
 * guide, and unbranded stock has nothing to search for. Rows arrive pre-filled with a plausible
 * baseline rather than blank, because an empty grid is the single most likely place for a merchant
 * to abandon setup.
 */
export const INITIAL_GAP_ITEMS: GapItem[] = [
  {
    id: "gap-urban-tops",
    brandName: "Urban Basics Co",
    categoryPath: "Men > Tops",
    title: "Urban Basics Co — Men's Tops",
    type: "brand",
    categoryType: "tops",
    skuCount: 174,
    status: "not_started",
    sampleProducts: [
      {
        sku: "UB-TS-0031",
        title: "Urban Basics Heavyweight Boxy Tee",
        imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=200&q=80",
        price: "$28.00",
      },
      {
        sku: "UB-TS-0052",
        title: "Urban Basics Long Sleeve Henley",
        imageUrl: "https://images.unsplash.com/photo-1622470953794-aa9c70b0fb9d?w=200&q=80",
        price: "$36.00",
      },
    ],
    columns: ["Size", "Chest (cm)", "Waist (cm)", "Body Length (cm)"],
    rows: [
      { Size: "S", "Chest (cm)": "90-96", "Waist (cm)": "76-82", "Body Length (cm)": "68" },
      { Size: "M", "Chest (cm)": "96-104", "Waist (cm)": "82-88", "Body Length (cm)": "71" },
      { Size: "L", "Chest (cm)": "104-112", "Waist (cm)": "88-96", "Body Length (cm)": "74" },
      { Size: "XL", "Chest (cm)": "112-122", "Waist (cm)": "96-104", "Body Length (cm)": "77" },
    ],
  },
  {
    id: "gap-urban-women-tops",
    brandName: "Urban Basics Co",
    categoryPath: "Women > Tops",
    title: "Urban Basics Co — Women's Tops",
    type: "brand",
    categoryType: "tops",
    skuCount: 100,
    status: "not_started",
    sampleProducts: [
      {
        sku: "UB-SW-0044",
        title: "Urban Basics Cropped Sweatshirt",
        imageUrl: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=200&q=80",
        price: "$42.00",
      },
    ],
    columns: ["Size", "Bust (cm)", "Waist (cm)", "Body Length (cm)"],
    rows: [
      { Size: "XS", "Bust (cm)": "78-84", "Waist (cm)": "60-66", "Body Length (cm)": "52" },
      { Size: "S", "Bust (cm)": "84-90", "Waist (cm)": "66-72", "Body Length (cm)": "54" },
      { Size: "M", "Bust (cm)": "90-96", "Waist (cm)": "72-78", "Body Length (cm)": "56" },
      { Size: "L", "Bust (cm)": "96-104", "Waist (cm)": "78-86", "Body Length (cm)": "58" },
    ],
  },
  {
    id: "gap-local-bottoms",
    brandName: "Local Streetwear Co",
    categoryPath: "Women > Bottoms",
    title: "Local Streetwear Co — Women's Bottoms",
    type: "brand",
    categoryType: "bottoms",
    skuCount: 143,
    status: "not_started",
    sampleProducts: [
      {
        sku: "LS-SK-9902",
        title: "Local Streetwear Cargo Skirt",
        imageUrl: "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=200&q=80",
        price: "$58.00",
      },
    ],
    columns: ["Size", "Waist (cm)", "Hip (cm)", "Length (cm)"],
    rows: [
      { Size: "S", "Waist (cm)": "64-70", "Hip (cm)": "88-94", "Length (cm)": "48" },
      { Size: "M", "Waist (cm)": "70-76", "Hip (cm)": "94-100", "Length (cm)": "50" },
      { Size: "L", "Waist (cm)": "76-84", "Hip (cm)": "100-108", "Length (cm)": "52" },
    ],
  },
  {
    id: "gap-unbranded-footwear",
    brandName: "No brand detected",
    categoryPath: "Footwear > Sneakers",
    title: "Unbranded — Footwear",
    type: "category",
    categoryType: "footwear",
    skuCount: 84,
    status: "not_started",
    sampleProducts: [
      {
        sku: "SKU-5011",
        title: "Canvas Low-Top Sneaker",
        imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=200&q=80",
        price: "$49.00",
      },
    ],
    columns: ["Size", "EU", "US", "Foot Length (cm)"],
    rows: [
      { Size: "40", EU: "40", US: "7", "Foot Length (cm)": "25.0" },
      { Size: "41", EU: "41", US: "8", "Foot Length (cm)": "25.7" },
      { Size: "42", EU: "42", US: "8.5", "Foot Length (cm)": "26.5" },
      { Size: "43", EU: "43", US: "9.5", "Foot Length (cm)": "27.2" },
      { Size: "44", EU: "44", US: "10", "Foot Length (cm)": "28.0" },
      { Size: "45", EU: "45", US: "11", "Foot Length (cm)": "28.7" },
    ],
  },
  {
    id: "gap-unbranded-accessories",
    brandName: "No brand detected",
    categoryPath: "Accessories",
    title: "Unbranded — Accessories",
    type: "category",
    categoryType: "accessories",
    skuCount: 113,
    status: "not_started",
    sampleProducts: [
      {
        sku: "SKU-4823",
        title: "Ribbed Knit Beanie",
        imageUrl: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=200&q=80",
        price: "$18.00",
      },
    ],
    columns: ["Size", "Circumference (cm)"],
    rows: [
      { Size: "One Size", "Circumference (cm)": "54-60" },
    ],
  },
];

/** Gaps raised by a delta sync. The reused row proves the setup work carried forward. */
export const NEW_SYNC_GAP_ITEMS: GapItem[] = [
  {
    ...INITIAL_GAP_ITEMS[0],
    id: "sync-gap-urban-tops",
    skuCount: 6,
    status: "complete",
    isInheritedFromSetup: true,
    inheritedFromSetupLabel: "Filled during initial setup",
    inheritedSetupDate: "2026-08-14",
    sourceOrigin: "setup_prefilled",
  },
  {
    id: "sync-gap-unbranded-accessories",
    brandName: "No brand detected",
    categoryPath: "Accessories > Scarves",
    title: "Unbranded — Scarves",
    type: "category",
    categoryType: "accessories",
    skuCount: 3,
    status: "not_started",
    sampleProducts: [
      {
        sku: "SKU-6120",
        title: "Wool Blend Scarf",
        imageUrl: "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=200&q=80",
        price: "$29.00",
      },
    ],
    columns: ["Size", "Length (cm)", "Width (cm)"],
    rows: [{ Size: "One Size", "Length (cm)": "180", "Width (cm)": "30" }],
    sourceOrigin: "delta_gap_required",
  },
];
