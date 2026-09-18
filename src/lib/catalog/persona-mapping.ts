import type { StoreCategory } from "@/modules/store/types";
import {
  EMPTY_PERSONA_SCOPE,
  PERSONA_CATEGORIES,
  PERSONA_DEPARTMENTS,
  PERSONA_SUB_CATEGORIES,
  PERSONA_TAXONOMY_VERSION,
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

export function parsePersonaScope(value: unknown): SerializedTaxonomyScope {
  if (!value || typeof value !== "object") return { ...EMPTY_PERSONA_SCOPE };
  const raw = value as Record<string, unknown>;
  return {
    configured: raw.configured === true,
    enabledDeptIds: strings(raw.enabledDeptIds).filter((id) => DEPARTMENT_IDS.has(id as PersonaDepartmentId)),
    enabledLeafKeys: strings(raw.enabledLeafKeys),
    customLeaves: parseCustomLeaves(raw.customLeaves),
    customCategories: parseCustomCategories(raw.customCategories),
  };
}

function parseMapping(value: unknown): PersonaCategoryMapping | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.status === "excluded") {
    return {
      status: "excluded",
      excludeReason: typeof raw.excludeReason === "string" ? raw.excludeReason.slice(0, 240) : undefined,
      isAutoMatched: raw.isAutoMatched === true,
    };
  }
  if (raw.status !== "mapped" || typeof raw.departmentId !== "string" || typeof raw.categoryId !== "string") return null;
  if (!DEPARTMENT_IDS.has(raw.departmentId as PersonaDepartmentId)) return null;
  return {
    status: "mapped",
    departmentId: raw.departmentId as PersonaDepartmentId,
    categoryId: raw.categoryId,
    subCategory: typeof raw.subCategory === "string" && raw.subCategory.trim() ? raw.subCategory.trim() : undefined,
    personaPath: typeof raw.personaPath === "string" ? raw.personaPath : undefined,
    isAutoMatched: raw.isAutoMatched === true,
  };
}

export function parsePersonaCategoryMap(value: unknown, categories: readonly StoreCategory[]): PersonaCategoryMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const validIds = new Set(categories.map((category) => category.id));
  const parsed: PersonaCategoryMap = {};
  for (const [sourceId, itemValue] of Object.entries(value as Record<string, unknown>)) {
    if (!validIds.has(sourceId)) continue;
    const mapping = parseMapping(itemValue);
    if (mapping) parsed[sourceId] = mapping;
  }
  return parsed;
}

export function buildPersonaMappingConfig(
  scopeValue: unknown,
  mapValue: unknown,
  categories: readonly StoreCategory[],
): PersonaMappingConfig {
  return {
    taxonomyVersion: PERSONA_TAXONOMY_VERSION,
    scope: parsePersonaScope(scopeValue),
    mappings: parsePersonaCategoryMap(mapValue, categories),
  };
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
}

function resolveOne(
  mapping: PersonaCategoryMapping | undefined,
  scope: SerializedTaxonomyScope,
): ResolvedPersonaPath | null {
  if (!mapping || mapping.status !== "mapped" || !mapping.departmentId || !mapping.categoryId) return null;
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

  if (mapping.subCategory) {
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
  }

  const derived = standardCategory
    ? derivePersonaValues(deptId, mapping.categoryId as PersonaCategoryId)
    : derivePersonaValues(deptId, "top");
  const fullPath = formatPersonaPath(deptId, mapping.categoryId, mapping.subCategory);
  return {
    key: `${deptId}:${mapping.categoryId}:${mapping.subCategory ?? ""}`,
    segments: ["persona", deptId, mapping.categoryId, ...(mapping.subCategory ? [mapping.subCategory] : [])],
    fullPath,
    departmentId: deptId,
    categoryId: mapping.categoryId,
    subCategory: mapping.subCategory,
    sizingGroup,
    gender: derived.gender,
    ageGroup: derived.ageGroup,
  };
}

/** Resolves every mapped Persona path for one product; merchant paths never leave this boundary. */
export function resolvePersonaPaths(
  sourceCategoryIds: readonly string[],
  config: PersonaMappingConfig,
): ResolvedPersonaPath[] {
  const byKey = new Map<string, ResolvedPersonaPath>();
  for (const sourceId of sourceCategoryIds) {
    const resolved = resolveOne(config.mappings[sourceId], config.scope);
    if (resolved) byKey.set(resolved.key, resolved);
  }
  return [...byKey.values()];
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
    segments.push(customLeaf?.label ?? formatLeafLabel(path.subCategory));
  }

  return segments.join(" > ");
}

export function mappedSourceCategoryIds(map: PersonaCategoryMap): string[] {
  return Object.entries(map).flatMap(([sourceId, mapping]) => mapping.status === "mapped" ? [sourceId] : []);
}

export function storeCategoryBreadcrumb(categoryId: string, categories: readonly StoreCategory[]): string {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(categoryId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    names.unshift(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return names.join(" / ");
}
