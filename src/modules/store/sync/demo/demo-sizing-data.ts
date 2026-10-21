/**
 * Demo data for the Sync flow's two screens (Size Chart Research and Active Overview).
 *
 * Those screens are the real Stage 4 and Stage 5 components, so this file produces the exact shapes
 * the sizing API returns (`BrandResearchRow`, `ResearchedChart`, `ChartGap`, `AcsStageFiveRow`, …).
 * Nothing here is fetched or stored: it describes one delta batch of 48 new SKUs.
 *
 * Everything is derived from `CATALOG` below — brand rows, gaps, leaf counts, the resolution summary
 * and every ACS record — so the screens can never contradict each other. Charts are built through the
 * same `chartTable` / `assessChart` the server uses, so tables and quality flags look as they do live.
 */

import {
  assessChart,
  chartTable,
  CHART_CONFIDENCE_PERCENT,
  hasBlockingQualityIssue,
} from "@/lib/sizing/chart-review";
import type { SizeAliases, SizeChartBoundKey, SizeChartRow } from "@/lib/sizing/chart-schema";
import { MEASUREMENT_KEYS, type Measurement, type SizingGroup } from "@/lib/sizing/measurements";
import type { ProductChartStatus } from "@/lib/sizing/product-chart";
import type {
  AcsStageFiveRow,
  BrandResearchRow,
  ChartAudience,
  ChartGap,
  ResearchedChart,
  ServerBrandType,
  SizingChartsResponse,
  SizingResolutionSummary,
  SizingRun,
  UnresolvedSizingGroup,
} from "@/modules/store/sizing/server-types";

// ─── Brands ──────────────────────────────────────────────────────────────────────

interface DemoBrand {
  key: string;
  name: string;
  type: Exclude<ServerBrandType, "unclassified">;
  skuPrefix: string;
}

const BRANDS: DemoBrand[] = [
  { key: "nike", name: "Nike", type: "global", skuPrefix: "NKE" },
  { key: "adidas", name: "Adidas", type: "global", skuPrefix: "ADI" },
  { key: "carhartt_wip", name: "Carhartt WIP", type: "global", skuPrefix: "CRH" },
  { key: "salomon", name: "Salomon", type: "global", skuPrefix: "SAL" },
  { key: "arcteryx", name: "Arc’teryx", type: "global", skuPrefix: "ARC" },
  { key: "moustache_store", name: "Moustache Store", type: "private", skuPrefix: "MST" },
  { key: "nordic_knitwear_lab", name: "Nordic Knitwear Lab", type: "private", skuPrefix: "NKL" },
  { key: "", name: "No brand", type: "none", skuPrefix: "GEN" },
];

const CATEGORY_GROUP: Record<string, SizingGroup> = {
  top: "tops",
  bottom: "bottoms",
  outerwear: "outerwear",
  footwear: "footwear",
};

function groupOfLeaf(leaf: string): SizingGroup {
  return CATEGORY_GROUP[leaf.split(":")[1]] ?? "tops";
}

// ─── Catalog: the 48 SKUs in this delta batch ───────────────────────────────────────

const IMG = {
  tee: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=160&auto=format&fit=crop&q=80",
  hoodie: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=160&auto=format&fit=crop&q=80",
  shirt: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=160&auto=format&fit=crop&q=80",
  knit: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=160&auto=format&fit=crop&q=80",
  jeans: "https://images.unsplash.com/photo-1542272604-780c96856592?w=160&auto=format&fit=crop&q=80",
  shorts: "https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=160&auto=format&fit=crop&q=80",
  sneaker: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=160&auto=format&fit=crop&q=80",
  sneakerAlt: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=160&auto=format&fit=crop&q=80",
  trail: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=160&auto=format&fit=crop&q=80",
  boot: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=160&auto=format&fit=crop&q=80",
  shell: "https://images.unsplash.com/photo-1544441893-675973e31985?w=160&auto=format&fit=crop&q=80",
  canvas: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=160&auto=format&fit=crop&q=80",
  plainTee: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=160&auto=format&fit=crop&q=80",
} as const;

interface CatalogItem {
  brandKey: string;
  title: string;
  leaf: string;
  price: number;
  image: string;
}

const item = (brandKey: string, title: string, leaf: string, price: number, image: string): CatalogItem => ({
  brandKey,
  title,
  leaf,
  price,
  image,
});

const CATALOG_ITEMS: CatalogItem[] = [
  // Nike — 12
  item("nike", "Nike Sportswear Club T-Shirt", "men:top:t-shirt", 35, IMG.tee),
  item("nike", "Nike Dri-FIT Run Division Tee", "men:top:t-shirt", 40, IMG.tee),
  item("nike", "Nike ACG Heavyweight Tee", "men:top:t-shirt", 45, IMG.tee),
  item("nike", "Nike Tech Fleece Full-Zip Hoodie", "men:top:hoodie", 135, IMG.hoodie),
  item("nike", "Nike One Classic Dri-FIT Tee (Women)", "women:top:t-shirt", 38, IMG.tee),
  item("nike", "Nike Challenger 7\" Running Shorts", "men:bottom:short", 45, IMG.shorts),
  item("nike", "Nike Club Fleece Shorts", "men:bottom:short", 50, IMG.shorts),
  item("nike", "Nike Tech Fleece Joggers", "men:bottom:trouser", 120, IMG.jeans),
  item("nike", "Nike Dunk Low Retro “Panda”", "men:footwear:sneaker", 115, IMG.sneaker),
  item("nike", "Nike Air Force 1 ’07", "men:footwear:sneaker", 115, IMG.sneakerAlt),
  item("nike", "Nike Pegasus 41", "men:footwear:sneaker", 140, IMG.trail),
  item("nike", "Nike Air Max 90 (Women)", "women:footwear:sneaker", 135, IMG.sneaker),
  // Adidas — 10
  item("adidas", "Adicolor Classics Trefoil Tee", "men:top:t-shirt", 32, IMG.tee),
  item("adidas", "Own The Run Tee", "men:top:t-shirt", 35, IMG.tee),
  item("adidas", "Essentials Fleece Hoodie", "men:top:hoodie", 65, IMG.hoodie),
  item("adidas", "Trefoil Hoodie", "men:top:hoodie", 75, IMG.hoodie),
  item("adidas", "Adicolor Firebird Track Pants", "men:bottom:trouser", 80, IMG.jeans),
  item("adidas", "Tiro 24 Training Pants", "men:bottom:trouser", 55, IMG.jeans),
  item("adidas", "Samba OG Leather Sneaker", "men:footwear:sneaker", 100, IMG.sneakerAlt),
  item("adidas", "Gazelle Suede Sneaker", "men:footwear:sneaker", 100, IMG.sneaker),
  item("adidas", "Campus 00s Sneaker", "men:footwear:sneaker", 110, IMG.sneakerAlt),
  item("adidas", "Ultraboost Light Running Shoe", "men:footwear:sneaker", 190, IMG.trail),
  // Carhartt WIP — 6
  item("carhartt_wip", "Detroit Duck Canvas Jacket", "men:outerwear:jacket", 238, IMG.canvas),
  item("carhartt_wip", "OG Active Jacket", "men:outerwear:jacket", 215, IMG.canvas),
  item("carhartt_wip", "Michigan Coat", "men:outerwear:jacket", 260, IMG.canvas),
  item("carhartt_wip", "S/S Chase T-Shirt", "men:top:t-shirt", 55, IMG.tee),
  item("carhartt_wip", "S/S Pocket T-Shirt", "men:top:t-shirt", 50, IMG.tee),
  item("carhartt_wip", "Klondike Denim Jeans", "men:bottom:jean", 140, IMG.jeans),
  // Salomon — 6
  item("salomon", "XT-6 Advanced Trail Running Shoe", "men:footwear:sneaker", 200, IMG.trail),
  item("salomon", "Speedcross 6 Trail Shoe", "men:footwear:sneaker", 150, IMG.trail),
  item("salomon", "XT-6 Advanced Trail Shoe (Women)", "women:footwear:sneaker", 200, IMG.trail),
  item("salomon", "Quest 4 GTX Hiking Boot", "men:footwear:boot", 230, IMG.boot),
  item("salomon", "Bonatti WP Waterproof Jacket", "men:outerwear:jacket", 180, IMG.shell),
  item("salomon", "Outline GTX 3L Shell", "men:outerwear:jacket", 330, IMG.shell),
  // Arc’teryx — 4
  item("arcteryx", "Beta LT GORE-TEX Shell Jacket", "men:outerwear:jacket", 450, IMG.shell),
  item("arcteryx", "Atom Insulated Hoody", "men:outerwear:jacket", 300, IMG.shell),
  item("arcteryx", "Beta AR Jacket (Women)", "women:outerwear:jacket", 650, IMG.shell),
  item("arcteryx", "Gamma Softshell Pant", "men:bottom:trouser", 220, IMG.jeans),
  // Moustache Store — 4
  item("moustache_store", "Moustache Store Heavy Twill Overshirt", "men:top:shirt", 98, IMG.shirt),
  item("moustache_store", "Moustache Store Oxford Button-Down", "men:top:shirt", 85, IMG.shirt),
  item("moustache_store", "Moustache Store Linen Camp Shirt", "men:top:shirt", 78, IMG.shirt),
  item("moustache_store", "Moustache Store Flannel Check Shirt", "men:top:shirt", 88, IMG.shirt),
  // Nordic Knitwear Lab — 3
  item("nordic_knitwear_lab", "Seamless Merino Crewneck", "men:top:knit", 145, IMG.knit),
  item("nordic_knitwear_lab", "Lambswool Roll Neck", "men:top:knit", 160, IMG.knit),
  item("nordic_knitwear_lab", "Cable Knit Sweater (Women)", "women:top:knit", 170, IMG.knit),
  // No brand — 3
  item("", "Essential Cotton Tee", "men:top:t-shirt", 18, IMG.plainTee),
  item("", "Everyday Pocket Tee", "men:top:t-shirt", 20, IMG.plainTee),
  item("", "Basic Crew Tee (Women)", "women:top:t-shirt", 18, IMG.plainTee),
];

export interface DemoProduct extends CatalogItem {
  index: number;
  sku: string;
  brand: DemoBrand;
  group: SizingGroup;
  sizes: string[];
}

function sizesFor(leaf: string): string[] {
  const [dept, category] = leaf.split(":");
  if (category === "footwear") return dept === "women" ? ["US 6", "US 7", "US 8"] : ["US 8", "US 9", "US 10"];
  if (category === "bottom") return ["30", "32", "34"];
  return dept === "women" ? ["XS", "S", "M", "L"] : ["S", "M", "L", "XL"];
}

const brandByKey = new Map(BRANDS.map((brand) => [brand.key, brand]));

export const DEMO_PRODUCTS: DemoProduct[] = (() => {
  const counters = new Map<string, number>();
  return CATALOG_ITEMS.map((entry, index) => {
    const brand = brandByKey.get(entry.brandKey)!;
    const next = (counters.get(brand.key) ?? 0) + 1;
    counters.set(brand.key, next);
    return {
      ...entry,
      index,
      brand,
      sku: `${brand.skuPrefix}-${String(next).padStart(3, "0")}`,
      group: groupOfLeaf(entry.leaf),
      sizes: sizesFor(entry.leaf),
    };
  });
})();

// ─── Charts ──────────────────────────────────────────────────────────────────────

interface Step {
  from: number;
  step: number;
  width?: number;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Evenly graded rows: each size starts `step` after the previous one. */
function ladder(
  sizes: string[],
  spec: Partial<Record<Measurement, Step>>,
  aliasesFor?: (index: number) => SizeAliases,
): SizeChartRow[] {
  return sizes.map((size, index) => {
    const bounds: Partial<Record<SizeChartBoundKey, number>> = {};
    for (const [measurement, step] of Object.entries(spec) as [Measurement, Step][]) {
      const min = round(step.from + index * step.step);
      bounds[`${measurement}_min`] = min;
      bounds[`${measurement}_max`] = round(min + (step.width ?? step.step));
    }
    return { size, ...(aliasesFor ? { aliases: aliasesFor(index) } : {}), ...bounds };
  });
}

const shoeAliases = (firstEu: number, firstUk: number, firstUs: number) => (index: number): SizeAliases => ({
  eu: String(firstEu + index),
  uk: String(firstUk + index),
  us: String(firstUs + index),
});

const MEN_TOPS = ladder(["XS", "S", "M", "L", "XL", "XXL"], {
  chest: { from: 81, step: 8 },
  waist: { from: 66, step: 8 },
});
const WOMEN_TOPS = ladder(["XS", "S", "M", "L", "XL"], {
  chest: { from: 78, step: 5 },
  waist: { from: 60, step: 5 },
});
const MEN_OUTERWEAR = ladder(["S", "M", "L", "XL", "XXL"], {
  chest: { from: 89, step: 8 },
  waist: { from: 74, step: 8 },
});
const WOMEN_OUTERWEAR = ladder(["XS", "S", "M", "L", "XL"], {
  chest: { from: 80, step: 5 },
  waist: { from: 62, step: 5 },
});
const MEN_BOTTOMS = ladder(["28", "30", "32", "34", "36", "38"], {
  waist: { from: 71, step: 5 },
  hip: { from: 89, step: 5 },
});
const MEN_SHOES = ladder(
  ["US 7", "US 8", "US 9", "US 10", "US 11", "US 12"],
  { foot_length: { from: 24.5, step: 0.85 } },
  shoeAliases(40, 6, 7),
);
const WOMEN_SHOES = ladder(
  ["US 5", "US 6", "US 7", "US 8", "US 9", "US 10"],
  { foot_length: { from: 22.5, step: 0.85 } },
  shoeAliases(35, 3, 5),
);
const UNISEX_SHOES = ladder(
  ["US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12"],
  { foot_length: { from: 23.6, step: 0.85 } },
  shoeAliases(39, 5, 6),
);

interface ChartSpec {
  id: string;
  brandKey: string;
  group: SizingGroup;
  variantName: string;
  audience: ChartAudience;
  sourceTitle: string;
  confidence: number;
  lastUpdated: string;
  sourceUrl: string | null;
  provenance: ResearchedChart["provenance"];
  shared: boolean;
  coversLeaves: string[];
  rows: SizeChartRow[];
}

const SOURCE = (path: string) => `https://www.${path}`;

const CHART_SPECS: ChartSpec[] = [
  // Nike
  {
    id: "demo-nike-tops-mens", brandKey: "nike", group: "tops", variantName: "Men", audience: "mens",
    sourceTitle: "MEN’S TOPS SIZE CHART", confidence: 97, lastUpdated: "2026-08-14",
    sourceUrl: SOURCE("nike.com/size-fit/mens-tops"), provenance: "research", shared: true,
    coversLeaves: ["men:top:t-shirt", "men:top:hoodie", "men:top:polo-shirt"], rows: MEN_TOPS,
  },
  {
    id: "demo-nike-tops-womens", brandKey: "nike", group: "tops", variantName: "Women", audience: "womens",
    sourceTitle: "WOMEN’S TOPS SIZE CHART", confidence: 96, lastUpdated: "2026-08-14",
    sourceUrl: SOURCE("nike.com/size-fit/womens-tops"), provenance: "research", shared: true,
    coversLeaves: ["women:top:t-shirt", "women:top:hoodie"], rows: WOMEN_TOPS,
  },
  {
    id: "demo-nike-bottoms-mens", brandKey: "nike", group: "bottoms", variantName: "Men", audience: "mens",
    sourceTitle: "MEN’S BOTTOMS SIZE CHART", confidence: 95, lastUpdated: "2026-08-14",
    sourceUrl: SOURCE("nike.com/size-fit/mens-bottoms"), provenance: "research", shared: true,
    coversLeaves: ["men:bottom:short", "men:bottom:trouser"], rows: MEN_BOTTOMS,
  },
  {
    id: "demo-nike-footwear-mens", brandKey: "nike", group: "footwear", variantName: "Men’s Shoes", audience: "mens",
    sourceTitle: "MEN’S SHOE SIZE CHART", confidence: 98, lastUpdated: "2026-08-14",
    sourceUrl: SOURCE("nike.com/size-fit/mens-shoes"), provenance: "research", shared: true,
    coversLeaves: ["men:footwear:sneaker", "men:footwear:boot"], rows: MEN_SHOES,
  },
  {
    id: "demo-nike-footwear-womens", brandKey: "nike", group: "footwear", variantName: "Women’s Shoes", audience: "womens",
    sourceTitle: "WOMEN’S SHOE SIZE CHART", confidence: 98, lastUpdated: "2026-08-14",
    sourceUrl: SOURCE("nike.com/size-fit/womens-shoes"), provenance: "research", shared: true,
    coversLeaves: ["women:footwear:sneaker"], rows: WOMEN_SHOES,
  },
  // Adidas
  {
    id: "demo-adidas-tops-mens", brandKey: "adidas", group: "tops", variantName: "Men", audience: "mens",
    sourceTitle: "MEN — CLOTHING SIZE CHART", confidence: 96, lastUpdated: "2026-07-30",
    sourceUrl: SOURCE("adidas.com/us/size_charts"), provenance: "research", shared: true,
    coversLeaves: ["men:top:t-shirt", "men:top:hoodie", "men:top:polo-shirt"], rows: MEN_TOPS,
  },
  {
    id: "demo-adidas-bottoms-mens", brandKey: "adidas", group: "bottoms", variantName: "Men", audience: "mens",
    sourceTitle: "MEN — BOTTOMS SIZE CHART", confidence: 94, lastUpdated: "2026-07-30",
    sourceUrl: SOURCE("adidas.com/us/size_charts"), provenance: "research", shared: true,
    coversLeaves: ["men:bottom:trouser", "men:bottom:short"], rows: MEN_BOTTOMS,
  },
  {
    id: "demo-adidas-footwear-mens", brandKey: "adidas", group: "footwear", variantName: "Men’s Shoes", audience: "mens",
    sourceTitle: "MEN — SHOE SIZE CHART", confidence: 97, lastUpdated: "2026-07-30",
    sourceUrl: SOURCE("adidas.com/us/size_charts"), provenance: "research", shared: true,
    coversLeaves: ["men:footwear:sneaker"], rows: MEN_SHOES,
  },
  // Carhartt WIP
  {
    id: "demo-carhartt-outerwear-mens", brandKey: "carhartt_wip", group: "outerwear", variantName: "Men", audience: "mens",
    sourceTitle: "MEN — OUTERWEAR SIZE GUIDE", confidence: 93, lastUpdated: "2026-06-22",
    sourceUrl: SOURCE("carhartt-wip.com/en/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["men:outerwear:jacket"], rows: MEN_OUTERWEAR,
  },
  {
    id: "demo-carhartt-tops-mens", brandKey: "carhartt_wip", group: "tops", variantName: "Men", audience: "mens",
    sourceTitle: "MEN — T-SHIRTS & SHIRTS", confidence: 92, lastUpdated: "2026-06-22",
    sourceUrl: SOURCE("carhartt-wip.com/en/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["men:top:t-shirt", "men:top:hoodie"], rows: MEN_TOPS,
  },
  {
    id: "demo-carhartt-bottoms-mens", brandKey: "carhartt_wip", group: "bottoms", variantName: "Men", audience: "mens",
    sourceTitle: "MEN — PANTS & JEANS", confidence: 91, lastUpdated: "2026-06-22",
    sourceUrl: SOURCE("carhartt-wip.com/en/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["men:bottom:jean", "men:bottom:trouser"], rows: MEN_BOTTOMS,
  },
  // Salomon — researched during this sync
  {
    id: "demo-salomon-footwear-unisex", brandKey: "salomon", group: "footwear", variantName: "Unisex Shoes", audience: "unisex",
    sourceTitle: "SHOES SIZE CHART", confidence: 96, lastUpdated: "2026-10-21",
    sourceUrl: SOURCE("salomon.com/en-us/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["men:footwear:sneaker", "men:footwear:boot", "women:footwear:sneaker"], rows: UNISEX_SHOES,
  },
  {
    id: "demo-salomon-outerwear-mens", brandKey: "salomon", group: "outerwear", variantName: "Men", audience: "mens",
    sourceTitle: "MEN’S JACKETS SIZE CHART", confidence: 94, lastUpdated: "2026-10-21",
    sourceUrl: SOURCE("salomon.com/en-us/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["men:outerwear:jacket"], rows: MEN_OUTERWEAR,
  },
  // Arc’teryx — researched during this sync; its guide has no trouser table
  {
    id: "demo-arcteryx-outerwear-mens", brandKey: "arcteryx", group: "outerwear", variantName: "Men", audience: "mens",
    sourceTitle: "MEN’S SIZE GUIDE — JACKETS", confidence: 95, lastUpdated: "2026-10-21",
    sourceUrl: SOURCE("arcteryx.com/us/en/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["men:outerwear:jacket"], rows: MEN_OUTERWEAR,
  },
  {
    id: "demo-arcteryx-outerwear-womens", brandKey: "arcteryx", group: "outerwear", variantName: "Women", audience: "womens",
    sourceTitle: "WOMEN’S SIZE GUIDE — JACKETS", confidence: 95, lastUpdated: "2026-10-21",
    sourceUrl: SOURCE("arcteryx.com/us/en/size-guide"), provenance: "research", shared: true,
    coversLeaves: ["women:outerwear:jacket"], rows: WOMEN_OUTERWEAR,
  },
  // Moustache Store — the merchant's own chart, saved earlier
  {
    id: "demo-moustache-tops-mens", brandKey: "moustache_store", group: "tops", variantName: "Men’s Shirts", audience: "mens",
    sourceTitle: "Moustache Store — shirt sizing", confidence: 100, lastUpdated: "2026-05-09",
    sourceUrl: null, provenance: "merchant", shared: false,
    coversLeaves: ["men:top:shirt"], rows: MEN_TOPS.filter((row) => ["S", "M", "L", "XL"].includes(row.size)),
  },
];

function labelSystemsOf(rows: SizeChartRow[]): string {
  const present = (["eu", "uk", "us"] as const).filter((key) => rows.some((row) => row.aliases?.[key]));
  return present.map((key) => key.toUpperCase()).join(" · ");
}

const catalogOf = (brandKey: string, group?: SizingGroup) =>
  DEMO_PRODUCTS.filter((product) => product.brand.key === brandKey && (!group || product.group === group));

function makeChart(spec: ChartSpec): ResearchedChart {
  const brand = brandByKey.get(spec.brandKey)!;
  const { headers, rows } = chartTable(spec.rows, spec.group, spec.audience);
  const quality = assessChart({
    rows: spec.rows,
    group: spec.group,
    audience: spec.audience,
    sourceUrl: spec.sourceUrl,
  });
  return {
    id: spec.id,
    brand: brand.name,
    brandKey: spec.brandKey,
    sizingCategory: spec.group,
    variantName: spec.variantName,
    audience: spec.audience,
    sourceTitle: spec.sourceTitle,
    skuCount: catalogOf(spec.brandKey, spec.group).length,
    labelSystems: labelSystemsOf(spec.rows),
    confidence: spec.confidence,
    lastUpdated: spec.lastUpdated,
    sourceUrl: spec.sourceUrl,
    provenance: spec.provenance,
    shared: spec.shared,
    headers,
    rows,
    chartRows: spec.rows,
    quality,
    coversLeaves: spec.coversLeaves,
    needsReview: spec.confidence < CHART_CONFIDENCE_PERCENT || hasBlockingQualityIssue(quality),
  };
}

export const DEMO_CHARTS: ResearchedChart[] = CHART_SPECS.map(makeChart);

const chartForProduct = (product: DemoProduct): ResearchedChart | null =>
  DEMO_CHARTS.find(
    (chart) =>
      chart.brandKey === product.brand.key &&
      chart.sizingCategory === product.group &&
      chart.coversLeaves.includes(product.leaf),
  ) ?? null;

// ─── Brand queue, gaps and totals ─────────────────────────────────────────────────

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

export const DEMO_BRAND_ROWS: BrandResearchRow[] = BRANDS.filter((brand) => brand.type === "global").map((brand) => {
  const products = catalogOf(brand.key);
  const uncovered = products.filter((product) => !chartForProduct(product));
  const charts = DEMO_CHARTS.filter((chart) => chart.brandKey === brand.key);
  return {
    brandKey: brand.key,
    brandName: brand.name,
    searchName: brand.name,
    status: uncovered.length === 0 ? "done" : charts.length > 0 ? "partial" : "not_found",
    skuCount: products.length,
    sizingCategories: unique(products.map((product) => product.group)),
    chartedCategories: unique(charts.map((chart) => chart.sizingCategory)).length,
    partialCategories: 0,
    missingLeaves: unique(uncovered.map((product) => product.leaf)),
    missingSkuCount: uncovered.length,
    chartCount: charts.length,
    note: null,
    memberBrands: [{ brandKey: brand.key, brandName: brand.name, skuCount: products.length }],
  };
});

const GAP_REASON: Record<ServerBrandType, string> = {
  global: "The shared registry has no chart for these subcategories",
  private: "Private label — it publishes no size guide to research",
  none: "These products carry no brand",
  unclassified: "Brand not classified yet",
};

const MISSING_LEAF_REASONS: Record<string, Record<string, string>> = {
  arcteryx: { "men:bottom:trouser": "Arc’teryx’s official size guide publishes no trouser table." },
};

function buildGaps(): ChartGap[] {
  const gaps: ChartGap[] = [];
  for (const brand of BRANDS) {
    for (const group of unique(catalogOf(brand.key).map((product) => product.group))) {
      const uncovered = catalogOf(brand.key, group).filter((product) => !chartForProduct(product));
      if (uncovered.length === 0) continue;
      const missingLeaves = unique(uncovered.map((product) => product.leaf));
      const missingLeafCounts = Object.fromEntries(
        missingLeaves.map((leaf) => [leaf, uncovered.filter((product) => product.leaf === leaf).length]),
      );
      const reasons = MISSING_LEAF_REASONS[brand.key];
      gaps.push({
        id: `demo-gap-${brand.key || "none"}-${group}`,
        brandKey: brand.key,
        brandName: brand.name,
        brandType: brand.type,
        sizingCategory: group,
        skuCount: uncovered.length,
        storeCategoryPaths: missingLeaves.map((leaf) => ["persona", ...leaf.split(":")]),
        researchStatus: brand.type === "global" ? "not_found" : brand.type === "private" ? "not_covered" : "pending",
        researchNote: null,
        reason: GAP_REASON[brand.type],
        sampleSkus: uncovered
          .slice(0, 3)
          .map((product) => ({ sku: product.sku, title: product.title, imageUrl: product.image })),
        missingLeaves,
        missingLeafCounts,
        ...(reasons ? { missingLeafReasons: reasons } : {}),
        partial: DEMO_CHARTS.some((chart) => chart.brandKey === brand.key && chart.sizingCategory === group),
      });
    }
  }
  return gaps;
}

const ALL_GAPS = buildGaps();

export const DEMO_GAPS_GLOBAL = ALL_GAPS.filter((gap) => gap.brandType === "global");
export const DEMO_GAPS_NOT_FOUND = ALL_GAPS.filter((gap) => gap.brandType === "private");
export const DEMO_GAPS_NO_BRAND = ALL_GAPS.filter((gap) => gap.brandType === "none");

const pairsNeeded = unique(DEMO_PRODUCTS.map((product) => `${product.brand.key}|${product.group}`)).length;
const gapSkus = ALL_GAPS.reduce((sum, gap) => sum + gap.skuCount, 0);

export const DEMO_CHART_TOTALS: SizingChartsResponse["totals"] = {
  chartsFound: DEMO_CHARTS.length,
  brandsCharted: unique(DEMO_CHARTS.map((chart) => chart.brandKey)).length,
  chartedSkus: DEMO_PRODUCTS.length - gapSkus,
  pairsNeeded,
  gapSkus,
};

export const DEMO_LEAF_COUNTS: SizingChartsResponse["leafCounts"] = (() => {
  const counts = new Map<string, number>();
  for (const product of DEMO_PRODUCTS) {
    const key = `${product.brand.key}|${product.leaf}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, skuCount]) => {
    const [brandKey, leafKey] = key.split("|");
    return { brandKey, leafKey, skuCount };
  });
})();

/** Every leaf this demo store's taxonomy enables — the stocked ones plus a few it sells none of yet. */
export const DEMO_MAPPED_LEAVES: string[] = unique([
  ...DEMO_PRODUCTS.map((product) => product.leaf),
  "men:top:polo-shirt",
  "women:top:hoodie",
  "men:bottom:short",
  "women:bottom:jean",
]);

// ─── Run ──────────────────────────────────────────────────────────────────────────

export const DEMO_RUN: SizingRun = {
  id: "demo-sync-run",
  connectionId: "demo-sync",
  kind: "delta",
  status: "complete",
  stage: "assign",
  productsScanned: DEMO_PRODUCTS.length,
  productsWithoutImage: 0,
  phase: null,
  phaseDone: null,
  phaseTotal: null,
  researchBrandKeys: [],
  researchCurrentBrandKey: null,
  researchForce: false,
  error: null,
  publishedAt: null,
  createdAt: "2026-10-21T08:00:00.000Z",
  updatedAt: "2026-10-21T08:05:00.000Z",
};

// ─── Stage 5: ACS records and resolution summary ─────────────────────────────────

function fitRowFor(chart: ResearchedChart, size: string): string | null {
  const row = chart.chartRows.find((candidate) => candidate.size === size);
  if (!row) return null;
  const record: Record<string, unknown> = { s: row.size };
  for (const measurement of MEASUREMENT_KEYS) {
    const min = row[`${measurement}_min` as SizeChartBoundKey];
    const max = row[`${measurement}_max` as SizeChartBoundKey];
    if (min !== undefined || max !== undefined) record[measurement] = [min ?? null, max ?? null];
  }
  return JSON.stringify(record);
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const DEMO_ACS_ROWS: AcsStageFiveRow[] = DEMO_PRODUCTS.flatMap((product) => {
  const chart = chartForProduct(product);
  const [dept, category, sub] = product.leaf.split(":");
  const categories = [`persona > ${dept} > ${category} > ${sub}`];
  const primaryId = `gid://shopify/Product/${8100000 + product.index}`;
  const fit = (sizes: string[]) =>
    chart
      ? {
          fitLeaf: product.leaf,
          fitGroup: chart.sizingCategory,
          fitAudience: chart.audience,
          fitChartVariant: chart.variantName,
          fitSizeLabels: sizes,
          fitRows: sizes.flatMap((size) => fitRowFor(chart, size) ?? []),
        }
      : { fitLeaf: null, fitGroup: null, fitAudience: null, fitChartVariant: null, fitSizeLabels: [], fitRows: [] };
  const base = {
    imageUrl: product.image,
    price: product.price,
    currency: "USD",
    brand: product.brand.type === "none" ? null : product.brand.name,
    brandType: product.brand.type,
    categories,
    title: product.title,
  } satisfies Partial<AcsStageFiveRow>;

  const variants: AcsStageFiveRow[] = product.sizes.map((size, variantIndex) => ({
    ...base,
    ...fit([size]),
    id: `gid://shopify/ProductVariant/${9100000 + product.index * 10 + variantIndex}`,
    type: "VARIANT",
    primaryProductId: primaryId,
    sku: `${product.sku}-${slug(size).toUpperCase()}`,
    availability: (product.index + variantIndex) % 7 === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
    sizes: [size],
  }));

  const primary: AcsStageFiveRow = {
    ...base,
    ...fit(product.sizes),
    id: primaryId,
    type: "PRIMARY",
    primaryProductId: null,
    sku: product.sku,
    availability: variants.every((variant) => variant.availability === "OUT_OF_STOCK") ? "OUT_OF_STOCK" : "IN_STOCK",
    sizes: product.sizes,
  };
  return [primary, ...variants];
});

const unresolvedStatus = (product: DemoProduct): Exclude<ProductChartStatus, "matched"> =>
  product.brand.key === "arcteryx" ? "unsupported-source" : "no-chart";

const UNRESOLVED_PRODUCTS = DEMO_PRODUCTS.filter((product) => !chartForProduct(product));

export const DEMO_UNRESOLVED_GROUPS: UnresolvedSizingGroup[] = (() => {
  const groups = new Map<string, UnresolvedSizingGroup>();
  for (const product of UNRESOLVED_PRODUCTS) {
    const status = unresolvedStatus(product);
    const key = `${product.brand.key}|${product.leaf}|${status}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.sampleSkus.push(product.sku);
    } else {
      groups.set(key, {
        brandKey: product.brand.key,
        brandName: product.brand.type === "none" ? null : product.brand.name,
        leafKey: product.leaf,
        status,
        count: 1,
        sampleSkus: [product.sku],
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
})();

const byStatus = (): SizingResolutionSummary["byStatus"] => {
  const counts: SizingResolutionSummary["byStatus"] = {
    matched: DEMO_PRODUCTS.length - UNRESOLVED_PRODUCTS.length,
    "sizes-unknown": 0,
    "no-leaf": 0,
    unclassified: 0,
    "stale-brand-mapping": 0,
    "no-chart": 0,
    ambiguous: 0,
    "fit-only": 0,
    "parent-mismatch": 0,
    "sizes-unresolved": 0,
    "unsupported-source": 0,
  };
  for (const product of UNRESOLVED_PRODUCTS) counts[unresolvedStatus(product)] += 1;
  return counts;
};

export const DEMO_RESOLUTION_SUMMARY: SizingResolutionSummary = {
  total: DEMO_PRODUCTS.length,
  excluded: 0,
  unresolvedGroups: DEMO_UNRESOLVED_GROUPS,
  variantCount: DEMO_ACS_ROWS.filter((row) => row.type === "VARIANT").length,
  matched: DEMO_PRODUCTS.length - UNRESOLVED_PRODUCTS.length,
  unresolved: UNRESOLVED_PRODUCTS.length,
  matchPercent: Math.round(((DEMO_PRODUCTS.length - UNRESOLVED_PRODUCTS.length) / DEMO_PRODUCTS.length) * 100),
  byStatus: byStatus(),
  chartCount: DEMO_CHARTS.length,
  canonicalBrandCount: BRANDS.filter((brand) => brand.type === "global").length,
  unmatchedLabels: [],
  brandMappingCurrent: true,
  unavailable: 0,
  withoutImage: 0,
  refreshing: false,
};
