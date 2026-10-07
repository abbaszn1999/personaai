/**
 * Persona's fixed taxonomy for the Mapping screen.
 *
 * The ids in this file are a persisted contract: store-category mappings save these ids, never
 * display labels or breadcrumbs. Labels can therefore change without orphaning a merchant's map.
 */

/**
 * Bumped to 4: the taxonomy was reduced from 214 to 155 leaves by folding garments that brands size
 * on one table into a single leaf (blouse into shirt, sweater into knit, coat into jacket, loafer
 * into heel...). Nothing was renamed: every surviving id already existed, and every removed id is
 * listed in `LEAF_MERGES_V4` with the leaf it folded into, so stored data can be converted rather
 * than dropped. Version 3 added `kids-girls:top:bra`, which is kept.
 */
export const PERSONA_TAXONOMY_VERSION = 4;

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
  /** Display only. An unmapped category still resolves through its nearest mapped ancestor, and this
   *  names that ancestor and the path it gives, so the merchant can see where its products land. */
  inheritedFromName?: string;
  inheritedPersonaPath?: string;
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
    top: ["t-shirt", "shirt", "knit", "hoodie", "activewear-top", "swim-top", "sleep-top", "bra"],
    bottom: ["trouser", "jean", "skirt", "short", "legging", "swim-bottom", "sleep-bottom"],
    "full-body": ["dress", "jumpsuit", "kaftan", "set", "swimsuit", "sleepwear-set"],
    outerwear: ["jacket", "blazer", "cardigan", "activewear-jacket"],
    footwear: ["sneaker", "boot", "sandal", "heel", "slipper", "sock"],
  },
  men: {
    top: ["t-shirt", "polo-shirt", "shirt", "knit", "hoodie", "activewear-top", "sleep-top"],
    bottom: ["trouser", "jean", "short", "activewear-bottom", "swim-short", "sleep-bottom"],
    "full-body": ["suit", "jumpsuit", "thobe", "set", "sleepwear-set"],
    outerwear: ["jacket", "blazer", "cardigan", "activewear-jacket"],
    footwear: ["sneaker", "boot", "sandal", "dress-shoe", "slipper", "sock"],
  },
  unisex: {
    top: ["t-shirt", "shirt", "knit", "hoodie", "activewear-top"],
    bottom: ["trouser", "jean", "short", "activewear-bottom"],
    "full-body": ["jumpsuit", "set"],
    outerwear: ["jacket", "cardigan"],
    footwear: ["sneaker", "boot", "sandal", "slipper", "sock"],
  },
  "kids-boys": {
    top: ["t-shirt", "shirt", "knit", "hoodie", "bodysuit", "activewear-top", "sleep-top"],
    bottom: ["trouser", "short", "legging", "swim-short", "sleep-bottom"],
    "full-body": ["romper", "sleepsuit", "set", "swimsuit", "bathrobe"],
    outerwear: ["jacket", "cardigan", "snowsuit"],
    footwear: ["shoe", "boot", "sandal", "bootie", "slipper", "sock"],
  },
  "kids-girls": {
    top: ["t-shirt", "shirt", "knit", "hoodie", "bodysuit", "activewear-top", "sleep-top", "bra"],
    bottom: ["trouser", "skirt", "short", "legging", "sleep-bottom"],
    "full-body": ["dress", "romper", "sleepsuit", "set", "swimsuit", "bathrobe"],
    outerwear: ["jacket", "cardigan", "snowsuit"],
    footwear: ["shoe", "boot", "sandal", "bootie", "slipper", "sock"],
  },
  "kids-unisex": {
    top: ["t-shirt", "shirt", "knit", "hoodie", "bodysuit", "sleep-top"],
    bottom: ["trouser", "short", "legging", "sleep-bottom"],
    "full-body": ["romper", "sleepsuit", "set", "swimsuit", "bathrobe"],
    outerwear: ["jacket", "cardigan", "snowsuit"],
    footwear: ["shoe", "boot", "sandal", "bootie", "slipper", "sock"],
  },
};

/**
 * The leaves version 4 removed, grouped under the leaf each one folded into. Brands size every
 * garment in a group on the same table (Tommy's "Women" tops chart lists t-shirt, camisole, tank,
 * crop, bodysuit, knit, sweater, hoodie, sweatshirt and tunic together), so a separate leaf only
 * asked the merchant to make a distinction the size chart never makes.
 *
 * This is the single source of the merge: `LEAF_MERGES_V4` is derived from it, and the SQL migration
 * that converts stored chart coverage is checked against it by a test.
 */
const FOLDED_SUBCATEGORIES: Partial<Record<PersonaDepartmentId, Partial<Record<PersonaCategoryId, Record<string, string[]>>>>> = {
  women: {
    top: {
      "t-shirt": ["camisole", "tank-top", "crop-top", "tunic", "bodysuit"],
      shirt: ["blouse"],
      knit: ["sweater"],
      hoodie: ["sweatshirt"],
    },
    bottom: { trouser: ["culotte"], legging: ["activewear-bottom"] },
    "full-body": { dress: ["gown"], jumpsuit: ["romper"], kaftan: ["abaya"] },
    outerwear: { jacket: ["coat", "trench", "vest", "kimono"] },
    footwear: { heel: ["flat", "loafer", "mule", "wedge"] },
  },
  men: {
    top: { knit: ["sweater"], hoodie: ["sweatshirt"] },
    bottom: { trouser: ["chino", "jogger"] },
    "full-body": { jumpsuit: ["overall"] },
    outerwear: { jacket: ["coat", "gilet"], blazer: ["suit-jacket"] },
    footwear: { sandal: ["espadrille"], "dress-shoe": ["loafer"] },
  },
  unisex: {
    top: { knit: ["sweater"], hoodie: ["sweatshirt"] },
    bottom: { trouser: ["jogger"] },
    "full-body": { jumpsuit: ["overall"] },
    outerwear: { jacket: ["coat", "gilet"] },
    footwear: { sandal: ["slide"] },
  },
  "kids-boys": {
    top: { hoodie: ["sweatshirt"] },
    bottom: { trouser: ["jean", "jogger"] },
    "full-body": { romper: ["all-in-one"] },
    outerwear: { jacket: ["coat"], snowsuit: ["pramsuit"] },
    footwear: { shoe: ["sneaker"] },
  },
  "kids-girls": {
    top: { shirt: ["blouse"], hoodie: ["sweatshirt"] },
    bottom: { trouser: ["jean", "jogger"] },
    "full-body": { romper: ["all-in-one"] },
    outerwear: { jacket: ["coat"], snowsuit: ["pramsuit"] },
    footwear: { shoe: ["sneaker"] },
  },
  "kids-unisex": {
    top: { hoodie: ["sweatshirt"] },
    bottom: { trouser: ["jean", "jogger"] },
    "full-body": { romper: ["all-in-one"] },
    outerwear: { jacket: ["coat"], snowsuit: ["pramsuit"] },
    footwear: { shoe: ["sneaker"] },
  },
};

/** Every leaf version 4 removed, as `removed key -> the leaf it folded into`, full `dept:cat:sub` keys. */
export const LEAF_MERGES_V4: Readonly<Record<string, string>> = (() => {
  const merges: Record<string, string> = {};
  for (const [deptId, categories] of Object.entries(FOLDED_SUBCATEGORIES)) {
    for (const [catId, groups] of Object.entries(categories ?? {})) {
      for (const [survivor, absorbed] of Object.entries(groups)) {
        for (const sub of absorbed) merges[`${deptId}:${catId}:${sub}`] = `${deptId}:${catId}:${survivor}`;
      }
    }
  }
  return merges;
})();

/** A leaf key as it exists today: a removed leaf becomes the leaf it folded into; anything else is
 *  returned as it is. The one function every reader of stored leaf keys passes them through. */
export function canonicalLeafKey(leafKey: string): string {
  return LEAF_MERGES_V4[leafKey] ?? leafKey;
}

/** The bare names that folded into this leaf (`women:top:shirt` -> `["blouse"]`). */
export function absorbedSubCategories(leafKey: string): string[] {
  return Object.entries(LEAF_MERGES_V4)
    .filter(([, survivor]) => survivor === leafKey)
    .map(([removed]) => removed.split(":")[2]);
}

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
  "t-shirt": "T-Shirts & Tops", shirt: "Shirts", knit: "Knitwear & Sweaters", hoodie: "Hoodies & Sweatshirts",
  "polo-shirt": "Polos", bodysuit: "Bodysuits", bra: "Bras & Lingerie",
  "activewear-top": "Activewear Tops", "swim-top": "Swim Tops", "sleep-top": "Sleep Tops",
  trouser: "Trousers & Chinos", jean: "Jeans", skirt: "Skirts", short: "Shorts", legging: "Leggings & Tights",
  "activewear-bottom": "Activewear Bottoms", "swim-bottom": "Swim Bottoms", "swim-short": "Swim Shorts",
  "sleep-bottom": "Sleep Bottoms",
  dress: "Dresses & Gowns", jumpsuit: "Jumpsuits, Rompers & Overalls", kaftan: "Kaftans & Abayas", suit: "Suits",
  thobe: "Thobes", set: "Sets", swimsuit: "Swimsuits", "sleepwear-set": "Sleepwear Sets", romper: "Rompers & All-in-Ones",
  sleepsuit: "Sleepsuits", bathrobe: "Bathrobes",
  jacket: "Jackets & Coats", blazer: "Blazers & Suit Jackets", cardigan: "Cardigans",
  "activewear-jacket": "Activewear Jackets", snowsuit: "Snowsuits & Pramsuits",
  sneaker: "Sneakers", boot: "Boots", sandal: "Sandals & Slides", heel: "Heels & Flats", "dress-shoe": "Dress Shoes & Loafers",
  shoe: "Shoes & Sneakers", bootie: "Booties", slipper: "Slippers", sock: "Socks & Hosiery",
};

/** Where one department's wording differs from the generic label because the leaf folded in
 *  different garments there (kids' jeans sit under trousers, women's loafers under heels). */
const DEPARTMENT_LEAF_LABELS: Record<string, string> = {
  "women:shirt": "Shirts & Blouses",
  "kids-girls:shirt": "Shirts & Blouses",
  "women:legging": "Leggings & Activewear Bottoms",
  "women:heel": "Heels, Flats & Loafers",
  "women:trouser": "Trousers & Culottes",
  "kids-boys:trouser": "Trousers & Jeans",
  "kids-girls:trouser": "Trousers & Jeans",
  "kids-unisex:trouser": "Trousers & Jeans",
  "women:jumpsuit": "Jumpsuits & Rompers",
  "men:jumpsuit": "Jumpsuits & Overalls",
  "unisex:jumpsuit": "Jumpsuits & Overalls",
};

export function formatLeafLabel(sub: string, deptId?: string): string {
  const specific = deptId ? DEPARTMENT_LEAF_LABELS[`${deptId}:${sub}`] : undefined;
  return specific ?? LEAF_LABELS[sub] ?? sub.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * A Persona path as stored (`["persona", "women", "top", "t-shirt"]` — the ids ACS `categories` and
 * coverage carry) in the words the Mapping page uses: "Women > Tops > T-Shirts". Anything that is not
 * a Persona path is joined as it is.
 */
export function formatPersonaSegments(path: readonly string[]): string {
  if (path[0] !== "persona") return path.join(" › ");
  const [, deptId, catId, sub] = path;
  const department = PERSONA_DEPARTMENTS.find((item) => item.id === deptId);
  const parts = [department?.name ?? deptId, catId ? getCategoryDisplayName(catId) : undefined];
  if (sub) parts.push(formatLeafLabel(sub, deptId));
  return parts.filter((part): part is string => Boolean(part)).join(" > ");
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
