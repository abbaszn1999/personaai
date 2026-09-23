/**
 * Persona's fixed taxonomy for the Mapping screen — a straight port of the demo's
 * `data/personaTaxonomyData.ts` (see `Documentation/store_src_demo_frontend/data/personaTaxonomyData.ts`).
 *
 * The ids in this file are a persisted contract: store-category mappings save these ids, never
 * display labels or breadcrumbs. Labels can therefore change without orphaning a merchant's map.
 */

/**
 * Bumped to 2: added `bra` (women:top), `sock` (footwear, every department) and `bathrobe`
 * (kids full-body). All three were seeded chart variants — `Women Bras (Wired)`, `Men Socks`,
 * `Women Socks`, `Kids Bathrobes` — with no leaf a merchant could map a category onto, which made
 * them permanently unreachable by auto-match: `pickVariant`'s garment-specialization pass can only
 * fire for a leaf id it is given, and none of these four had one. Additive only — no existing leaf
 * id changed or moved — so no stored mapping is invalidated by the bump.
 */
export const PERSONA_TAXONOMY_VERSION = 2;

export type PersonaDepartmentId = "women" | "men" | "unisex" | "kids-boys" | "kids-girls" | "kids-unisex";

export type PersonaCategoryId = "top" | "bottom" | "full-body" | "outerwear" | "footwear";

export interface PersonaDepartmentDef {
  id: PersonaDepartmentId;
  name: string;
  path: string;
  shortLabel: string;
  description: string;
  /** Decorative only — a fixed accent used for the department's dot/badge in the tree. */
  accentColor: string;
}

export interface PersonaCategoryDef {
  id: PersonaCategoryId;
  name: string;
  sizingParent: "Tops" | "Bottoms" | "Dresses/Full-body" | "Outerwear/Jackets" | "Footwear";
}

export interface PersonaDerivedValues {
  gender: "female" | "male" | "male+female";
  ageGroup: "adult" | "kids";
  sizingParent: PersonaCategoryDef["sizingParent"];
}

export interface CustomTaxonomyItem {
  id: string;
  deptId: string;
  catId: string;
  subCategory: string;
  label: string;
  isCustom: true;
}

export interface CustomCategoryDef {
  id: string;
  deptId: string;
  name: string;
  sizingGroup?: "tops" | "bottoms" | "dresses" | "outerwear" | "footwear";
  isCustom: true;
}

export interface SerializedTaxonomyScope {
  configured: boolean;
  enabledDeptIds: string[];
  enabledLeafKeys: string[];
  customLeaves: CustomTaxonomyItem[];
  customCategories: CustomCategoryDef[];
}

export interface PersonaCategoryMapping {
  status: "mapped" | "excluded";
  departmentId?: PersonaDepartmentId;
  categoryId?: PersonaCategoryId | string;
  subCategory?: string;
  personaPath?: string;
  excludeReason?: string;
  isAutoMatched?: boolean;
}

export type PersonaCategoryMap = Record<string, PersonaCategoryMapping>;

export interface PersonaMappingConfig {
  taxonomyVersion: number;
  scope: SerializedTaxonomyScope;
  mappings: PersonaCategoryMap;
}

export const EMPTY_PERSONA_SCOPE: SerializedTaxonomyScope = {
  configured: false,
  enabledDeptIds: [],
  enabledLeafKeys: [],
  customLeaves: [],
  customCategories: [],
};

export type StoreCategoryStatus = "unmapped" | "mapped" | "excluded";

export interface StoreCategoryItem {
  id: string;
  name: string;
  storePath: string;
  productCount: number;
  status: StoreCategoryStatus;
  assignedPersonaPath?: string;
  departmentId?: PersonaDepartmentId;
  categoryId?: PersonaCategoryId;
  subCategory?: string;
  derived?: PersonaDerivedValues;
  excludeReason?: string;
  isAutoMatched?: boolean;
}

export const PERSONA_DEPARTMENTS: PersonaDepartmentDef[] = [
  { id: "women", name: "Women", path: "persona > women", shortLabel: "Women", description: "Adult womenswear & footwear", accentColor: "#e11d48" },
  { id: "men", name: "Men", path: "persona > men", shortLabel: "Men", description: "Adult menswear & footwear", accentColor: "#3b82f6" },
  { id: "unisex", name: "Unisex", path: "persona > unisex", shortLabel: "Unisex", description: "Gender-neutral adult fashion", accentColor: "#a855f7" },
  { id: "kids-boys", name: "Kids Boys", path: "persona > kids-boys", shortLabel: "Kids Boys", description: "Boys sizing (infant to teen)", accentColor: "#0ea5e9" },
  { id: "kids-girls", name: "Kids Girls", path: "persona > kids-girls", shortLabel: "Kids Girls", description: "Girls sizing (infant to teen)", accentColor: "#ec4899" },
  { id: "kids-unisex", name: "Kids Unisex", path: "persona > kids-unisex", shortLabel: "Kids Unisex", description: "Gender-neutral kids apparel & shoes", accentColor: "#f59e0b" },
];

export const PERSONA_CATEGORIES: PersonaCategoryDef[] = [
  { id: "top", name: "Top", sizingParent: "Tops" },
  { id: "bottom", name: "Bottom", sizingParent: "Bottoms" },
  { id: "full-body", name: "Full-body", sizingParent: "Dresses/Full-body" },
  { id: "outerwear", name: "Outerwear", sizingParent: "Outerwear/Jackets" },
  { id: "footwear", name: "Footwear", sizingParent: "Footwear" },
];

export const PERSONA_SUB_CATEGORIES: Record<PersonaDepartmentId, Record<PersonaCategoryId, string[]>> = {
  women: {
    top: ["t-shirt", "shirt", "blouse", "camisole", "tank-top", "crop-top", "bodysuit", "knit", "sweater", "hoodie", "sweatshirt", "tunic", "activewear-top", "swim-top", "sleep-top", "bra"],
    bottom: ["trouser", "jean", "skirt", "short", "legging", "culotte", "activewear-bottom", "swim-bottom", "sleep-bottom"],
    "full-body": ["dress", "gown", "jumpsuit", "romper", "kaftan", "abaya", "swimsuit", "set", "sleepwear-set"],
    outerwear: ["blazer", "jacket", "coat", "trench", "cardigan", "vest", "kimono", "activewear-jacket"],
    footwear: ["heel", "flat", "sneaker", "boot", "sandal", "loafer", "mule", "wedge", "slipper", "sock"],
  },
  men: {
    top: ["t-shirt", "shirt", "polo-shirt", "knit", "sweater", "hoodie", "sweatshirt", "activewear-top", "sleep-top"],
    bottom: ["trouser", "jean", "chino", "short", "jogger", "activewear-bottom", "swim-short", "sleep-bottom"],
    "full-body": ["suit", "jumpsuit", "thobe", "overall", "set", "sleepwear-set"],
    outerwear: ["blazer", "suit-jacket", "jacket", "coat", "cardigan", "gilet", "activewear-jacket"],
    footwear: ["sneaker", "dress-shoe", "boot", "loafer", "sandal", "espadrille", "slipper", "sock"],
  },
  unisex: {
    top: ["t-shirt", "shirt", "knit", "sweater", "hoodie", "sweatshirt", "activewear-top"],
    bottom: ["trouser", "jean", "short", "jogger", "activewear-bottom"],
    "full-body": ["jumpsuit", "overall", "set"],
    outerwear: ["jacket", "coat", "cardigan", "gilet"],
    footwear: ["sneaker", "boot", "sandal", "slide", "slipper", "sock"],
  },
  "kids-boys": {
    top: ["t-shirt", "shirt", "knit", "hoodie", "sweatshirt", "bodysuit", "activewear-top", "sleep-top"],
    bottom: ["trouser", "jean", "short", "legging", "jogger", "swim-short", "sleep-bottom"],
    "full-body": ["romper", "all-in-one", "sleepsuit", "set", "swimsuit", "bathrobe"],
    outerwear: ["jacket", "coat", "cardigan", "snowsuit", "pramsuit"],
    footwear: ["sneaker", "shoe", "boot", "sandal", "bootie", "slipper", "sock"],
  },
  "kids-girls": {
    top: ["t-shirt", "shirt", "blouse", "knit", "hoodie", "sweatshirt", "bodysuit", "activewear-top", "sleep-top"],
    bottom: ["trouser", "jean", "skirt", "short", "legging", "jogger", "sleep-bottom"],
    "full-body": ["dress", "romper", "all-in-one", "sleepsuit", "set", "swimsuit", "bathrobe"],
    outerwear: ["jacket", "coat", "cardigan", "snowsuit", "pramsuit"],
    footwear: ["sneaker", "shoe", "boot", "sandal", "bootie", "slipper", "sock"],
  },
  "kids-unisex": {
    top: ["t-shirt", "shirt", "knit", "hoodie", "sweatshirt", "bodysuit", "sleep-top"],
    bottom: ["trouser", "jean", "short", "legging", "jogger", "sleep-bottom"],
    // `swimsuit` is present for kids-boys and kids-girls; its absence here left a mixed-gender
    // kids swimwear collection with no target at all, so Auto-Match's answer for one was rejected.
    "full-body": ["romper", "all-in-one", "sleepsuit", "set", "swimsuit", "bathrobe"],
    outerwear: ["jacket", "coat", "cardigan", "snowsuit", "pramsuit"],
    footwear: ["sneaker", "shoe", "boot", "sandal", "bootie", "slipper", "sock"],
  },
};

/** `deptId:catId:sub` — the identity a merchant's category mapping stores and `leafOfPersonaPath`/
 *  `audienceForPersonaPath` in `variant-match.ts` read back apart. */
export function personaLeafKey(deptId: PersonaDepartmentId, catId: PersonaCategoryId, sub: string): string {
  return `${deptId}:${catId}:${sub}`;
}

/** Every leaf key under one department + category, e.g. every `women:top:*`. What a chart's
 *  coverage checklist (the manual editor, the seed backfill) enumerates against. */
export function leafKeysFor(deptId: PersonaDepartmentId, catId: PersonaCategoryId): string[] {
  return (PERSONA_SUB_CATEGORIES[deptId][catId] ?? []).map((sub) => personaLeafKey(deptId, catId, sub));
}

/**
 * Every leaf this merchant's own category mapping resolves to a subcategory — the structural fact
 * of their taxonomy, independent of live stock. `sizing_path_coverage` (what Stage 5 and this
 * chart-view modal otherwise read leaves from) is a scan artifact: it only has a row for a leaf a
 * product currently exists under, so a leaf the merchant mapped a store category to but which
 * happens to hold zero SKUs of one particular brand right now — or zero SKUs at all, between scans —
 * is invisible to it. This reads the mapping itself instead, so "does this merchant's taxonomy have
 * a `jean` leaf under women's bottoms" answers independently of whether any product has landed there
 * yet, which is what lets a chart's "Covers" show every leaf it is the honest answer for rather than
 * only the leaves that happen to be non-empty at this exact moment.
 *
 * A mapping missing `subCategory` (`persona > women > top`, no leaf chosen — a real, common
 * classifier gap, not a taxonomy leaf) contributes nothing here, same as it contributes no leaf to
 * `covers_leaves` matching elsewhere: there is no leaf to name until a merchant or the classifier
 * picks one.
 */
export function mappedPersonaLeaves(
  map: PersonaCategoryMap | null | undefined,
  scope?: SerializedTaxonomyScope | null
): string[] {
  // Once Merchandise Scope Setup has been saved, its enabled leaf list is the merchant's explicit,
  // authoritative taxonomy. It includes selected leaves even when they currently have zero products,
  // which is exactly what chart coverage needs. The source-category map below answers a different
  // question ("where did scanned products route?") and may contain category-level mappings with no
  // leaf when classification could not safely choose one.
  if (scope?.configured) return [...new Set(scope.enabledLeafKeys)];

  // Compatibility fallback for connections created before Merchandise Scope Setup was persisted.
  const leaves = new Set<string>();
  for (const mapping of Object.values(map ?? {})) {
    if (mapping.status !== "mapped") continue;
    if (!mapping.departmentId || !mapping.categoryId || !mapping.subCategory) continue;
    leaves.add(personaLeafKey(mapping.departmentId, mapping.categoryId as PersonaCategoryId, mapping.subCategory));
  }
  return [...leaves];
}

/**
 * The complete, flat Persona leaf vocabulary — every `deptId:catId:sub` combination that exists,
 * across all six departments. This is the closed enum wherever something has to state "one of
 * every leaf that exists" rather than free text: the research prompt's `covers_leaves` field, and
 * the seed-coverage completeness check that asserts every leaf under a seeded brand's departments
 * is claimed by exactly one chart.
 */
export const ALL_PERSONA_LEAF_KEYS: string[] = PERSONA_DEPARTMENTS.flatMap((dept) =>
  PERSONA_CATEGORIES.flatMap((cat) => leafKeysFor(dept.id, cat.id))
);

/**
 * `women:top:t-shirt` → `"Women · T-Shirt"`. For chips and checklists that show a chart's
 * `covers_leaves` — the department, because one chart can legitimately cover the same leaf name
 * across several departments (`Kids Bathrobes` covers `bathrobe` under boys, girls and kids-unisex
 * alike), and the leaf's own kebab-case name, titled. The category is left out: every leaf in one
 * chart's `covers_leaves` shares that chart's own `sizingCategory`, so repeating it on every chip
 * would say nothing the chart's own heading doesn't already.
 */
export function leafLabel(leafKey: string): string {
  const [deptId, , sub] = leafKey.split(":");
  const dept = PERSONA_DEPARTMENTS.find((d) => d.id === deptId);
  const subLabel = (sub ?? "")
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("-");
  return dept ? `${dept.shortLabel} · ${subLabel}` : subLabel || leafKey;
}

export function derivePersonaValues(deptId: PersonaDepartmentId, catId: PersonaCategoryId): PersonaDerivedValues {
  let gender: PersonaDerivedValues["gender"] = "male+female";
  if (deptId === "women" || deptId === "kids-girls") gender = "female";
  else if (deptId === "men" || deptId === "kids-boys") gender = "male";

  const ageGroup: PersonaDerivedValues["ageGroup"] = deptId.startsWith("kids") ? "kids" : "adult";

  let sizingParent: PersonaDerivedValues["sizingParent"] = "Tops";
  switch (catId) {
    case "top": sizingParent = "Tops"; break;
    case "bottom": sizingParent = "Bottoms"; break;
    case "full-body": sizingParent = "Dresses/Full-body"; break;
    case "outerwear": sizingParent = "Outerwear/Jackets"; break;
    case "footwear": sizingParent = "Footwear"; break;
  }

  return { gender, ageGroup, sizingParent };
}

export function personaSizingGroup(catId: PersonaCategoryId | string):
  | "tops"
  | "bottoms"
  | "dresses"
  | "outerwear"
  | "footwear"
  | null {
  switch (catId) {
    case "top": return "tops";
    case "bottom": return "bottoms";
    case "full-body": return "dresses";
    case "outerwear": return "outerwear";
    case "footwear": return "footwear";
    default: return null;
  }
}

export function formatPersonaPath(deptId: PersonaDepartmentId | string, catId: PersonaCategoryId | string, subCat?: string): string {
  if (subCat && subCat.trim()) return `persona > ${deptId} > ${catId} > ${subCat.trim()}`;
  return `persona > ${deptId} > ${catId}`;
}

const LEAF_LABELS: Record<string, string> = {
  "t-shirt": "T-Shirts", shirt: "Shirts", blouse: "Blouses", sweater: "Sweaters & Cardigans", knit: "Knits",
  hoodie: "Hoodies", sweatshirt: "Sweatshirts", camisole: "Camisoles", "tank-top": "Tank Tops", "crop-top": "Crop Tops",
  bodysuit: "Bodysuits", tunic: "Tunics", dress: "Casual", gown: "Formal", jumpsuit: "Jumpsuits", romper: "Rompers",
  kaftan: "Kaftans", abaya: "Abayas", thobe: "Thobes", overall: "Overalls", jean: "Jeans", trouser: "Trousers & Slacks",
  chino: "Chinos", short: "Shorts", skirt: "Skirts", legging: "Leggings", jogger: "Joggers", blazer: "Blazers",
  jacket: "Jackets", coat: "Coats", trench: "Trench Coats", cardigan: "Cardigans", vest: "Vests", gilet: "Gilets",
  sneaker: "Sneakers", boot: "Boots", heel: "Heels", flat: "Flats", sandal: "Sandals", loafer: "Loafers", mule: "Mules",
  wedge: "Wedges", slide: "Slides", espadrille: "Espadrilles", "dress-shoe": "Dress Shoes", shoe: "Shoes",
  bootie: "Booties", "all-in-one": "All-in-Ones", sleepsuit: "Sleepsuits", snowsuit: "Snowsuits", pramsuit: "Pramsuits",
  culotte: "Culottes", polo: "Polos", "polo-shirt": "Polos", kimono: "Kimonos", "suit-jacket": "Suit Jackets",
  "activewear-top": "Activewear Tops", "activewear-bottom": "Activewear Bottoms", "activewear-jacket": "Activewear Jackets",
  "swim-top": "Swim Tops", "swim-bottom": "Swim Bottoms", "swim-short": "Swim Shorts", "sleep-top": "Sleep Tops",
  "sleep-bottom": "Sleep Bottoms", "sleepwear-set": "Sleepwear Sets", swimsuit: "Swimsuits", set: "Sets", suit: "Suits",
  slipper: "Slippers", bra: "Bras & Lingerie", sock: "Socks & Hosiery", bathrobe: "Bathrobes",
};

export function formatLeafLabel(sub: string): string {
  return LEAF_LABELS[sub] ?? sub.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function getCategoryDisplayName(catId: PersonaCategoryId | string): string {
  switch (catId) {
    case "top": return "Tops";
    case "bottom": return "Bottoms";
    case "full-body": return "Dresses";
    case "outerwear": return "Outerwear";
    case "footwear": return "Footwear";
    default: return String(catId);
  }
}

// ----------------------------------------------------------------------------
// ~40 mock store PLP categories (unmapped / mapped / excluded), ported verbatim from the demo.
// ----------------------------------------------------------------------------
export const INITIAL_STORE_CATEGORIES: StoreCategoryItem[] = [
  { id: "sc-01", name: "Women's Silk Slips & Camisoles", storePath: "Shopify / Collections / Womens / Tops & Blouses / Camisoles", productCount: 84, status: "unmapped" },
  { id: "sc-02", name: "Men's Cashmere Crewnecks", storePath: "WooCommerce / Men / Knitwear / Cashmere Sweaters", productCount: 112, status: "unmapped" },
  { id: "sc-03", name: "Unisex Oversized Streetwear Hoodies", storePath: "Shopify / Collections / Unisex / Fleece & Hoodies", productCount: 196, status: "unmapped" },
  { id: "sc-04", name: "Girls Pleated Tennis Skirts", storePath: "Shopify / Collections / Kids / Girls / Skirts & Skorts", productCount: 42, status: "unmapped" },
  { id: "sc-05", name: "Boys Puffer Snowsuits & Pramex", storePath: "WooCommerce / Kids / Boys Outerwear / Snowsuits", productCount: 31, status: "unmapped" },
  { id: "sc-06", name: "Women's Block Heel Sandals", storePath: "Shopify / Collections / Footwear / Women / Strappy Sandals", productCount: 128, status: "unmapped" },
  { id: "sc-07", name: "Men's Italian Wool Overcoats", storePath: "WooCommerce / Men / Outerwear / Tailored Coats", productCount: 65, status: "unmapped" },
  { id: "sc-08", name: "Baby All-In-One Sleepsuits", storePath: "Shopify / Collections / Newborn / Unisex Sleepwear", productCount: 94, status: "unmapped" },
  { id: "sc-09", name: "Women's High-Rise Denim Shorts", storePath: "Shopify / Collections / Women / Bottoms / Cutoff Shorts", productCount: 140, status: "unmapped" },
  { id: "sc-10", name: "Men's Chino Relaxed Pants", storePath: "WooCommerce / Men / Trousers / Casual Chinos", productCount: 175, status: "unmapped" },
  { id: "sc-11", name: "Unisex Poolside Slides & Slip-ons", storePath: "Shopify / Collections / Summer / Unisex Slides", productCount: 88, status: "unmapped" },
  { id: "sc-12", name: "Girls Knit Cardigans & Boleros", storePath: "Shopify / Collections / Girls / Sweaters & Cardigans", productCount: 56, status: "unmapped" },

  {
    id: "sc-13", name: "Women's Graphic T-Shirts", storePath: "Shopify / Collections / Women / Tops / Tees & Graphic", productCount: 320, status: "mapped",
    assignedPersonaPath: "persona > women > top > t-shirt", departmentId: "women", categoryId: "top", subCategory: "t-shirt",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Tops" },
  },
  {
    id: "sc-14", name: "Women's Cocktail & Evening Gowns", storePath: "WooCommerce / Women / Dresses / Maxi & Gowns", productCount: 145, status: "mapped",
    assignedPersonaPath: "persona > women > full-body > gown", departmentId: "women", categoryId: "full-body", subCategory: "gown",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Dresses/Full-body" },
  },
  {
    id: "sc-15", name: "Women's Skinny & Straight Leg Jeans", storePath: "Shopify / Collections / Women / Denim / Straight-Jeans", productCount: 290, status: "mapped",
    assignedPersonaPath: "persona > women > bottom > jean", departmentId: "women", categoryId: "bottom", subCategory: "jean",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Bottoms" },
  },
  {
    id: "sc-16", name: "Women's Double-Breasted Blazers", storePath: "Shopify / Collections / Women / Suiting / Blazers", productCount: 86, status: "mapped",
    assignedPersonaPath: "persona > women > outerwear > blazer", departmentId: "women", categoryId: "outerwear", subCategory: "blazer",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Outerwear/Jackets" },
  },
  {
    id: "sc-17", name: "Women's Stiletto & Kitten Heels", storePath: "WooCommerce / Shoes / Women / Heels & Pumps", productCount: 110, status: "mapped",
    assignedPersonaPath: "persona > women > footwear > heel", departmentId: "women", categoryId: "footwear", subCategory: "heel",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Footwear" },
  },
  {
    id: "sc-18", name: "Women's Linen Blouses", storePath: "Shopify / Collections / Women / Tops / Blouses", productCount: 78, status: "mapped",
    assignedPersonaPath: "persona > women > top > blouse", departmentId: "women", categoryId: "top", subCategory: "blouse",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Tops" },
  },
  {
    id: "sc-19", name: "Women's Compression Leggings", storePath: "Shopify / Collections / Women / Activewear / Tights", productCount: 165, status: "mapped",
    assignedPersonaPath: "persona > women > bottom > legging", departmentId: "women", categoryId: "bottom", subCategory: "legging",
    derived: { gender: "female", ageGroup: "adult", sizingParent: "Bottoms" },
  },
  {
    id: "sc-20", name: "Men's Oxford Dress Shirts", storePath: "WooCommerce / Men / Formalwear / Button-Down-Shirts", productCount: 215, status: "mapped",
    assignedPersonaPath: "persona > men > top > shirt", departmentId: "men", categoryId: "top", subCategory: "shirt",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Tops" },
  },
  {
    id: "sc-21", name: "Men's Piqué Cotton Polos", storePath: "Shopify / Collections / Men / Casual / Polos", productCount: 134, status: "mapped",
    assignedPersonaPath: "persona > men > top > polo-shirt", departmentId: "men", categoryId: "top", subCategory: "polo-shirt",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Tops" },
  },
  {
    id: "sc-22", name: "Men's Slim Raw Denim Jeans", storePath: "Shopify / Collections / Men / Denim / Slim-Fit", productCount: 240, status: "mapped",
    assignedPersonaPath: "persona > men > bottom > jean", departmentId: "men", categoryId: "bottom", subCategory: "jean",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Bottoms" },
  },
  {
    id: "sc-23", name: "Men's Fleece Gym Joggers", storePath: "WooCommerce / Men / Athleisure / Jogger Pants", productCount: 180, status: "mapped",
    assignedPersonaPath: "persona > men > bottom > jogger", departmentId: "men", categoryId: "bottom", subCategory: "jogger",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Bottoms" },
  },
  {
    id: "sc-24", name: "Men's Formal Suit Jackets", storePath: "Shopify / Collections / Men / Tailoring / Suit Jackets", productCount: 92, status: "mapped",
    assignedPersonaPath: "persona > men > outerwear > suit-jacket", departmentId: "men", categoryId: "outerwear", subCategory: "suit-jacket",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Outerwear/Jackets" },
  },
  {
    id: "sc-25", name: "Men's Leather Oxford & Derby Shoes", storePath: "WooCommerce / Men / Footwear / Formal Shoes", productCount: 115, status: "mapped",
    assignedPersonaPath: "persona > men > footwear > dress-shoe", departmentId: "men", categoryId: "footwear", subCategory: "dress-shoe",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Footwear" },
  },
  {
    id: "sc-26", name: "Men's Suede Penny Loafers", storePath: "Shopify / Collections / Men / Shoes / Loafers", productCount: 72, status: "mapped",
    assignedPersonaPath: "persona > men > footwear > loafer", departmentId: "men", categoryId: "footwear", subCategory: "loafer",
    derived: { gender: "male", ageGroup: "adult", sizingParent: "Footwear" },
  },
  {
    id: "sc-27", name: "Unisex Heavyweight Boxy T-Shirts", storePath: "Shopify / Collections / Unisex / Tops / Boxy Tees", productCount: 310, status: "mapped",
    assignedPersonaPath: "persona > unisex > top > t-shirt", departmentId: "unisex", categoryId: "top", subCategory: "t-shirt",
    derived: { gender: "male+female", ageGroup: "adult", sizingParent: "Tops" },
  },
  {
    id: "sc-28", name: "Unisex Athletic Running Sneakers", storePath: "Shopify / Collections / Footwear / Performance Sneakers", productCount: 420, status: "mapped",
    assignedPersonaPath: "persona > unisex > footwear > sneaker", departmentId: "unisex", categoryId: "footwear", subCategory: "sneaker",
    derived: { gender: "male+female", ageGroup: "adult", sizingParent: "Footwear" },
  },
  {
    id: "sc-29", name: "Unisex Waterproof Windbreakers (Category Level)", storePath: "WooCommerce / Outdoor / Rainwear / Jackets", productCount: 68, status: "mapped",
    assignedPersonaPath: "persona > unisex > outerwear", departmentId: "unisex", categoryId: "outerwear",
    derived: { gender: "male+female", ageGroup: "adult", sizingParent: "Outerwear/Jackets" },
  },
  {
    id: "sc-30", name: "Boys Everyday Crewneck T-Shirts", storePath: "Shopify / Collections / Kids / Boys / Tops / T-Shirts", productCount: 160, status: "mapped",
    assignedPersonaPath: "persona > kids-boys > top > t-shirt", departmentId: "kids-boys", categoryId: "top", subCategory: "t-shirt",
    derived: { gender: "male", ageGroup: "kids", sizingParent: "Tops" },
  },
  {
    id: "sc-31", name: "Boys Cargo Pocket Shorts", storePath: "WooCommerce / Kids / Boys / Bottoms / Shorts", productCount: 88, status: "mapped",
    assignedPersonaPath: "persona > kids-boys > bottom > short", departmentId: "kids-boys", categoryId: "bottom", subCategory: "short",
    derived: { gender: "male", ageGroup: "kids", sizingParent: "Bottoms" },
  },
  {
    id: "sc-32", name: "Boys Fleece Zip Hoodies", storePath: "Shopify / Collections / Boys / Sweatshirts & Hoodies", productCount: 104, status: "mapped",
    assignedPersonaPath: "persona > kids-boys > top > hoodie", departmentId: "kids-boys", categoryId: "top", subCategory: "hoodie",
    derived: { gender: "male", ageGroup: "kids", sizingParent: "Tops" },
  },
  {
    id: "sc-33", name: "Girls Floral Summer Sundresses", storePath: "Shopify / Collections / Girls / Dresses / Party & Day", productCount: 135, status: "mapped",
    assignedPersonaPath: "persona > kids-girls > full-body > dress", departmentId: "kids-girls", categoryId: "full-body", subCategory: "dress",
    derived: { gender: "female", ageGroup: "kids", sizingParent: "Dresses/Full-body" },
  },
  {
    id: "sc-34", name: "Girls Stretch Ankle Leggings", storePath: "WooCommerce / Kids / Girls / Pants / Cotton Leggings", productCount: 150, status: "mapped",
    assignedPersonaPath: "persona > kids-girls > bottom > legging", departmentId: "kids-girls", categoryId: "bottom", subCategory: "legging",
    derived: { gender: "female", ageGroup: "kids", sizingParent: "Bottoms" },
  },
  {
    id: "sc-35", name: "Girls Sparkle Mary Jane Flats", storePath: "Shopify / Collections / Girls / Shoes / Ballerina Flats", productCount: 64, status: "mapped",
    assignedPersonaPath: "persona > kids-girls > footwear > shoe", departmentId: "kids-girls", categoryId: "footwear", subCategory: "shoe",
    derived: { gender: "female", ageGroup: "kids", sizingParent: "Footwear" },
  },
  {
    id: "sc-36", name: "Toddler Soft Organic Bodysuits", storePath: "Shopify / Collections / Baby / Unisex Bodysuits", productCount: 185, status: "mapped",
    assignedPersonaPath: "persona > kids-unisex > top > bodysuit", departmentId: "kids-unisex", categoryId: "top", subCategory: "bodysuit",
    derived: { gender: "male+female", ageGroup: "kids", sizingParent: "Tops" },
  },
  {
    id: "sc-37", name: "Baby Fleece Infant Booties", storePath: "WooCommerce / Baby / Footwear / Soft Soles", productCount: 52, status: "mapped",
    assignedPersonaPath: "persona > kids-unisex > footwear > bootie", departmentId: "kids-unisex", categoryId: "footwear", subCategory: "bootie",
    derived: { gender: "male+female", ageGroup: "kids", sizingParent: "Footwear" },
  },
  {
    id: "sc-38", name: "Kids Lightweight Rain Jackets (Category Level)", storePath: "Shopify / Collections / Kids / Outerwear / Raincoats", productCount: 76, status: "mapped",
    assignedPersonaPath: "persona > kids-unisex > outerwear", departmentId: "kids-unisex", categoryId: "outerwear",
    derived: { gender: "male+female", ageGroup: "kids", sizingParent: "Outerwear/Jackets" },
  },

  { id: "sc-39", name: "Nursery Cribs, Cots & Mattresses", storePath: "Shopify / Collections / Baby / Nursery Furniture", productCount: 38, status: "excluded", excludeReason: "Non-fashion: Nursery Furniture & Gear" },
  { id: "sc-40", name: "Infant Feeding Bottles & Highchairs", storePath: "WooCommerce / Baby / Feeding & Mealtime", productCount: 54, status: "excluded", excludeReason: "Non-fashion: Feeding Accessories" },
  { id: "sc-41", name: "Kids Montessori Wooden Toys & Puzzles", storePath: "Shopify / Collections / Kids / Play & Educational Toys", productCount: 92, status: "excluded", excludeReason: "Non-fashion: Children Toys" },
  { id: "sc-42", name: "Store E-Gift Cards & Gift Vouchers", storePath: "Shopify / Collections / Gifts / Store Digital Cards", productCount: 12, status: "excluded", excludeReason: "Non-fashion: Digital Vouchers" },
];
