import type { StoreCategory } from "@/modules/store/types";
import {
  ALL_PERSONA_LEAF_KEYS,
  EMPTY_PERSONA_SCOPE,
  PERSONA_CATEGORIES,
  PERSONA_DEPARTMENTS,
  PERSONA_SUB_CATEGORIES,
  PERSONA_TAXONOMY_VERSION,
  canonicalLeafKey,
  derivePersonaValues,
  formatLeafLabel,
  formatPersonaPath,
  personaSizingGroup,
  type CustomCategoryDef,
  type CustomTaxonomyItem,
  type PersonaCategoryId,
  type PersonaCategoryMap,
  type PersonaCategoryMapping,
  type PersonaDepartmentId,
  type PersonaMappingConfig,
  type SerializedTaxonomyScope,
} from "@/modules/store/mapping/persona-taxonomy";
import type { SizingGroup } from "@/lib/sizing/measurements";
import { mapToCanonical, type CanonicalMapping } from "@/lib/retrieval/taxonomy";
import { buildCategoryIndex, type CategoryIndex } from "./category-parents";

const DEPARTMENT_IDS = new Set(PERSONA_DEPARTMENTS.map((item) => item.id));
const CATEGORY_IDS = new Set(PERSONA_CATEGORIES.map((item) => item.id));
const SIZING_GROUPS = new Set<SizingGroup>(["tops", "bottoms", "dresses", "outerwear", "footwear"]);

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

function parseCustomLeaves(value: unknown): CustomTaxonomyItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (![row.id, row.deptId, row.catId, row.subCategory, row.label].every((entry) => typeof entry === "string")) return [];
    return [{
      id: row.id as string,
      deptId: row.deptId as string,
      catId: row.catId as string,
      subCategory: row.subCategory as string,
      label: row.label as string,
      isCustom: true as const,
    }];
  });
}

function parseCustomCategories(value: unknown): CustomCategoryDef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.deptId !== "string" || typeof row.name !== "string") return [];
    const sizingGroup = typeof row.sizingGroup === "string" && SIZING_GROUPS.has(row.sizingGroup as SizingGroup)
      ? row.sizingGroup as SizingGroup
      : undefined;
    return [{ id: row.id, deptId: row.deptId, name: row.name, sizingGroup, isCustom: true as const }];
  });
}

const ALL_LEAF_KEY_SET = new Set(ALL_PERSONA_LEAF_KEYS);

function customLeafKeySet(customLeaves: readonly Pick<CustomTaxonomyItem, "deptId" | "catId" | "subCategory">[]): Set<string> {
  return new Set(customLeaves.map((leaf) => `${leaf.deptId}:${leaf.catId}:${leaf.subCategory}`));
}

/**
 * A stored leaf key in today's taxonomy, or null when it names nothing that exists. A leaf the
 * taxonomy has since folded into another becomes that other (`women:top:blouse` is now
 * `women:top:shirt`); a merchant's own custom leaf is never rewritten, even when it reuses a removed
 * name; a leaf under a custom category is kept because the standard vocabulary says nothing about it.
 */
function currentLeafKey(leafKey: string, customKeys: ReadonlySet<string>): string | null {
  if (customKeys.has(leafKey)) return leafKey;
  const current = canonicalLeafKey(leafKey);
  if (ALL_LEAF_KEY_SET.has(current)) return current;
  const catId = leafKey.split(":")[1] ?? "";
  return CATEGORY_IDS.has(catId as PersonaCategoryId) ? null : leafKey;
}

export function parsePersonaScope(value: unknown): SerializedTaxonomyScope {
  if (!value || typeof value !== "object") return { ...EMPTY_PERSONA_SCOPE };
  const raw = value as Record<string, unknown>;
  const customLeaves = parseCustomLeaves(raw.customLeaves);
  const customKeys = customLeafKeySet(customLeaves);
  return {
    configured: raw.configured === true,
    enabledDeptIds: strings(raw.enabledDeptIds).filter((id) => DEPARTMENT_IDS.has(id as PersonaDepartmentId)),
    enabledLeafKeys: [...new Set(
      strings(raw.enabledLeafKeys).flatMap((key) => {
        const current = currentLeafKey(key, customKeys);
        return current ? [current] : [];
      }),
    )],
    customLeaves,
    customCategories: parseCustomCategories(raw.customCategories),
  };
}

function parseMapping(value: unknown, customKeys: ReadonlySet<string>): PersonaCategoryMapping | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.status === "excluded") {
    return {
      status: "excluded",
      excludeReason: typeof raw.excludeReason === "string" ? raw.excludeReason.slice(0, 240) : undefined,
      isAutoMatched: raw.isAutoMatched === true,
    };
  }
  if (
    raw.status !== "mapped" ||
    typeof raw.departmentId !== "string" ||
    typeof raw.categoryId !== "string" ||
    typeof raw.subCategory !== "string" ||
    !raw.subCategory.trim()
  ) return null;
  if (!DEPARTMENT_IDS.has(raw.departmentId as PersonaDepartmentId)) return null;
  const currentKey = currentLeafKey(`${raw.departmentId}:${raw.categoryId}:${raw.subCategory.trim()}`, customKeys);
  if (!currentKey) return null;
  const subCategory = currentKey.split(":")[2];
  const convertedLeaf = subCategory !== raw.subCategory.trim();
  return {
    status: "mapped",
    departmentId: raw.departmentId as PersonaDepartmentId,
    categoryId: raw.categoryId,
    subCategory,
    personaPath: !convertedLeaf && typeof raw.personaPath === "string" ? raw.personaPath : undefined,
    isAutoMatched: raw.isAutoMatched === true,
  };
}

export function parsePersonaCategoryMap(
  value: unknown,
  categories: readonly StoreCategory[],
  customLeaves: readonly Pick<CustomTaxonomyItem, "deptId" | "catId" | "subCategory">[] = [],
): PersonaCategoryMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const validIds = new Set(categories.map((category) => category.id));
  const customKeys = customLeafKeySet(customLeaves);
  const parsed: PersonaCategoryMap = {};
  for (const [sourceId, itemValue] of Object.entries(value as Record<string, unknown>)) {
    if (!validIds.has(sourceId)) continue;
    const mapping = parseMapping(itemValue, customKeys);
    if (mapping) parsed[sourceId] = mapping;
  }
  return parsed;
}

/**
 * The mapping plus the store's category tree, which is what lets a product filed on an unmapped
 * child take its parent's mapping and lets several mapped categories on one product be ordered by
 * how specific they are. Optional so a config built without a category list still resolves exactly
 * as before — by direct mapping, in the order the product reported its categories.
 */
export interface HierarchicalPersonaMappingConfig extends PersonaMappingConfig {
  hierarchy?: CategoryIndex;
}

/**
 * Configs already built from the same connection objects. Resolving a catalog calls this once per
 * product with the same scope, map and category list, and rebuilding the category index each time
 * made re-resolving a few thousand products take seconds instead of milliseconds. Keyed on the
 * objects themselves, so a freshly read connection always gets a freshly built config.
 */
const configMemo = new WeakMap<object, WeakMap<object, WeakMap<object, HierarchicalPersonaMappingConfig>>>();

export function buildPersonaMappingConfig(
  scopeValue: unknown,
  mapValue: unknown,
  categories: readonly StoreCategory[],
): HierarchicalPersonaMappingConfig {
  const memoizable =
    typeof scopeValue === "object" && scopeValue !== null &&
    typeof mapValue === "object" && mapValue !== null;
  const cached = memoizable
    ? configMemo.get(scopeValue)?.get(mapValue)?.get(categories)
    : undefined;
  if (cached) return cached;

  const scope = parsePersonaScope(scopeValue);
  const config: HierarchicalPersonaMappingConfig = {
    taxonomyVersion: PERSONA_TAXONOMY_VERSION,
    scope,
    mappings: parsePersonaCategoryMap(mapValue, categories, scope.customLeaves),
    hierarchy: buildCategoryIndex(categories),
  };

  if (memoizable) {
    let byMap = configMemo.get(scopeValue);
    if (!byMap) {
      byMap = new WeakMap();
      configMemo.set(scopeValue, byMap);
    }
    let byCategories = byMap.get(mapValue);
    if (!byCategories) {
      byCategories = new WeakMap();
      byMap.set(mapValue, byCategories);
    }
    byCategories.set(categories, config);
  }
  return config;
}

export interface EffectiveMapping {
  mapping: PersonaCategoryMapping;
  /** The ancestor the mapping was taken from; null when the category carries it itself. */
  inheritedFrom: string | null;
}

/**
 * The mapping that governs one store category. A category's own answer — mapped, or deliberately
 * excluded — always stands. Without one it takes the nearest mapped ancestor's, and an excluded
 * ancestor ends the search: excluding a branch excludes what sits under it.
 */
export function effectiveMappingFor(
  sourceId: string,
  mappings: PersonaCategoryMap,
  hierarchy: CategoryIndex | undefined,
): EffectiveMapping | null {
  const own = mappings[sourceId];
  if (own) return { mapping: own, inheritedFrom: null };
  if (!hierarchy) return null;

  let cursor = hierarchy.parentOf.get(sourceId) ?? null;
  for (let hops = 0; cursor !== null && hops <= hierarchy.parentOf.size; hops += 1) {
    const inherited = mappings[cursor];
    if (inherited) return inherited.status === "mapped" ? { mapping: inherited, inheritedFrom: cursor } : null;
    cursor = hierarchy.parentOf.get(cursor) ?? null;
  }
  return null;
}

export interface ResolvedPersonaPath {
  key: string;
  segments: string[];
  fullPath: string;
  departmentId: PersonaDepartmentId;
  categoryId: string;
  subCategory?: string;
  sizingGroup: SizingGroup;
  gender: "female" | "male" | "male+female";
  ageGroup: "adult" | "kids";
  /** The merchant category this path was resolved from — the one the product is filed on. */
  sourceCategoryId?: string;
  /** Set when that category has no mapping of its own and took this one from an ancestor. */
  inheritedFromCategoryId?: string | null;
}

function resolveOne(
  mapping: PersonaCategoryMapping | undefined,
  scope: SerializedTaxonomyScope,
): ResolvedPersonaPath | null {
  if (
    !mapping ||
    mapping.status !== "mapped" ||
    !mapping.departmentId ||
    !mapping.categoryId ||
    !mapping.subCategory
  ) return null;
  const deptId = mapping.departmentId;
  if (!DEPARTMENT_IDS.has(deptId)) return null;
  if (scope.configured && !scope.enabledDeptIds.includes(deptId)) return null;

  const standardCategory = CATEGORY_IDS.has(mapping.categoryId as PersonaCategoryId);
  const customCategory = scope.customCategories.find(
    (item) => item.id === mapping.categoryId && item.deptId === deptId,
  );
  const sizingGroup = standardCategory
    ? personaSizingGroup(mapping.categoryId)
    : customCategory?.sizingGroup ?? null;
  if (!sizingGroup) return null;

  const leafKey = `${deptId}:${mapping.categoryId}:${mapping.subCategory}`;
  if (scope.configured && !scope.enabledLeafKeys.includes(leafKey)) return null;
  const standardLeaf = standardCategory &&
    (PERSONA_SUB_CATEGORIES[deptId]?.[mapping.categoryId as PersonaCategoryId] ?? []).includes(mapping.subCategory);
  const customLeaf = scope.customLeaves.some(
    (item) =>
      item.deptId === deptId &&
      item.catId === mapping.categoryId &&
      item.subCategory === mapping.subCategory,
  );
  if (!standardLeaf && !customLeaf) return null;

  const derived = standardCategory
    ? derivePersonaValues(deptId, mapping.categoryId as PersonaCategoryId)
    : derivePersonaValues(deptId, "top");
  const fullPath = formatPersonaPath(deptId, mapping.categoryId, mapping.subCategory);
  return {
    key: leafKey,
    segments: ["persona", deptId, mapping.categoryId, mapping.subCategory],
    fullPath,
    departmentId: deptId,
    categoryId: mapping.categoryId,
    subCategory: mapping.subCategory,
    sizingGroup,
    gender: derived.gender,
    ageGroup: derived.ageGroup,
  };
}

/** What the product says about itself, used only to choose between equally specific categories. */
export interface PersonaPathEvidence {
  title?: string | null;
}

/** The retrieval vocabulary's plural or shortened subcategory names, in Persona's leaf spelling. */
const CANONICAL_TO_PERSONA_SUB: Record<string, string> = {
  jeans: "jean",
  trousers: "trouser",
  chinos: "chino",
  shorts: "short",
  leggings: "legging",
  joggers: "jogger",
  sneakers: "sneaker",
  boots: "boot",
  sandals: "sandal",
  loafers: "loafer",
  heels: "heel",
  flats: "flat",
  slippers: "slipper",
  socks: "sock",
  polo: "polo-shirt",
  "swim-shorts": "swim-short",
};

/**
 * How strongly the product's own title agrees with a path: 2 when it names the path's subcategory
 * ("…Printed T-shirt" on `top:t-shirt`), 1 when it only names the path's sizing group, 0 otherwise.
 */
function evidenceScore(path: ResolvedPersonaPath, evidence: CanonicalMapping | null): number {
  if (!evidence) return 0;
  if (evidence.subcategory) {
    const sub = CANONICAL_TO_PERSONA_SUB[evidence.subcategory] ?? evidence.subcategory;
    // The title's garment is read in this path's own department, because a leaf folds differently
    // there: "Jeans" is `jean` for adults but sits under `trouser` for kids, and "Blouse" is `shirt`.
    const named = canonicalLeafKey(`${path.departmentId}:${path.categoryId}:${sub}`);
    if (path.key === named) return 2;
  }
  return path.sizingGroup === evidence.category ? 1 : 0;
}

/**
 * Resolves every mapped Persona path for one product; merchant paths never leave this boundary.
 *
 * The first entry is the product's primary path — the one its size chart is chosen from — so the
 * order is a decision, not an accident of how a platform lists categories. The most specific
 * category wins (`Men > Tops > Polos` over `Men > Tops` over `Sale`). Equally specific ones — every
 * Shopify collection, since collections are flat — are ordered by how well the product's own title
 * agrees with each path, then by id, so the same product resolves to the same path on every walk.
 * Without the title, a catch-all collection mapped to `men:bottom:jean` would size a T-shirt sharing
 * it with `women:top:t-shirt` as jeans whenever the catch-all's id sorted first.
 */
export function resolvePersonaPaths(
  sourceCategoryIds: readonly string[],
  config: HierarchicalPersonaMappingConfig,
  evidence?: PersonaPathEvidence,
): ResolvedPersonaPath[] {
  const titleEvidence = evidence?.title ? mapToCanonical(evidence.title) : null;
  const candidates: Array<{ path: ResolvedPersonaPath; depth: number; score: number; sourceId: string }> = [];
  for (const sourceId of new Set(sourceCategoryIds)) {
    const effective = effectiveMappingFor(sourceId, config.mappings, config.hierarchy);
    const resolved = resolveOne(effective?.mapping, config.scope);
    if (!resolved) continue;
    const path = { ...resolved, sourceCategoryId: sourceId, inheritedFromCategoryId: effective?.inheritedFrom ?? null };
    candidates.push({
      path,
      depth: config.hierarchy?.depthOf.get(sourceId) ?? 0,
      score: evidenceScore(path, titleEvidence),
      sourceId,
    });
  }

  if (config.hierarchy) {
    candidates.sort(
      (a, b) => b.depth - a.depth || b.score - a.score || a.sourceId.localeCompare(b.sourceId),
    );
  }

  const byKey = new Map<string, ResolvedPersonaPath>();
  for (const { path } of candidates) {
    if (!byKey.has(path.key)) byKey.set(path.key, path);
  }
  return [...byKey.values()];
}

export interface PersonaPathConflict {
  /** `group`: the paths size the product on different measurements (a T-shirt also filed as jeans).
   *  `department`: same group, but for different bodies (men and women, or adult and kids). */
  kind: "group" | "department";
  /** Every path the product resolves to, primary first. */
  paths: ResolvedPersonaPath[];
}

function audienceOf(departmentId: string): string | null {
  if (departmentId === "unisex" || departmentId === "kids-unisex") return null;
  return departmentId;
}

/**
 * Whether a product's categories disagree about what it is, in a way that changes its size chart.
 *
 * Several subcategories inside one group (a tee also filed under sweaters) are routine and size the
 * same way. Different groups, or a men's and a women's path, are not: one of the merchant's
 * categories is mapped wrong for this product, usually a catch-all collection mapped to one leaf.
 * Unisex paths never conflict with a gendered one, since a unisex chart fits either.
 */
export function personaPathConflict(paths: readonly ResolvedPersonaPath[]): PersonaPathConflict | null {
  if (paths.length < 2) return null;
  if (new Set(paths.map((path) => path.sizingGroup)).size > 1) return { kind: "group", paths: [...paths] };
  const ages = new Set(paths.map((path) => path.ageGroup));
  const audiences = new Set(paths.map((path) => audienceOf(path.departmentId)).filter((id) => id !== null));
  if (ages.size > 1 || audiences.size > 1) return { kind: "department", paths: [...paths] };
  return null;
}

/**
 * A resolved Persona path as a shop owner reads it — "Women > Tops", not `resolveOne`'s own
 * `segments` (`["persona", "women", "top"]`), which are the stable ids ACS's `categories` field is
 * actually written with, not display copy.
 *
 * Needed for exactly one place today: Setup Stage 1's `categories` row has no CMS column behind it
 * (see that row's own comment in `modules/store/acs-rows.ts`), so its sample cell has nothing to show
 * except this — a real resolved path, in the same words the Categories mapping page itself uses.
 *
 * Looks the department and category up by id first, falling back to a merchant's own custom
 * category/leaf name where the path resolved through one of those rather than a standard id, and
 * finally to the bare id itself — which should never show, but a made-up id from a future taxonomy
 * version is a wrong label, not a crash.
 */
export function personaPathLabel(path: ResolvedPersonaPath, config: PersonaMappingConfig): string {
  const department = PERSONA_DEPARTMENTS.find((item) => item.id === path.departmentId);
  const standardCategory = PERSONA_CATEGORIES.find((item) => item.id === path.categoryId);
  const customCategory = config.scope.customCategories.find(
    (item) => item.id === path.categoryId && item.deptId === path.departmentId,
  );

  const segments = [department?.name ?? path.departmentId, standardCategory?.name ?? customCategory?.name ?? path.categoryId];

  if (path.subCategory) {
    const customLeaf = config.scope.customLeaves.find(
      (leaf) =>
        leaf.deptId === path.departmentId && leaf.catId === path.categoryId && leaf.subCategory === path.subCategory,
    );
    segments.push(customLeaf?.label ?? formatLeafLabel(path.subCategory, path.departmentId));
  }

  return segments.join(" > ");
}

export function mappedSourceCategoryIds(map: PersonaCategoryMap): string[] {
  return Object.entries(map).flatMap(([sourceId, mapping]) => mapping.status === "mapped" ? [sourceId] : []);
}

/** A merchant category's names from the root down, as the store's own admin shows them. */
export function storeCategoryTrail(categoryId: string, categories: readonly StoreCategory[]): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(categoryId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    names.unshift(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return names;
}

export function storeCategoryBreadcrumb(categoryId: string, categories: readonly StoreCategory[]): string {
  return storeCategoryTrail(categoryId, categories).join(" / ");
}
