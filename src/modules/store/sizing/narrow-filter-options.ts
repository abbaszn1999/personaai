import type { SelectOption } from "@/modules/store/components/mapping-select";
import type { SizingSampleFacets } from "@/lib/sizing/sample-facets";

/** The Persona path filter as three selections. Each is the id of one level, or null above the
 *  deepest level chosen. `subCategory` is the leaf id on its own (`t-shirt`), not the full key. */
export interface PathSelection {
  department: string | null;
  category: string | null;
  subCategory: string | null;
}

export function parsePathFilter(path: string | null): PathSelection {
  if (!path) return { department: null, category: null, subCategory: null };
  const [department, category, subCategory] = path.split(":");
  return {
    department: department || null,
    category: category || null,
    subCategory: subCategory || null,
  };
}

/** The filter value for a selection: `women:` / `women:top:` for a prefix, the leaf key for one
 *  subcategory. The inverse of `parsePathFilter`. */
export function buildPathFilter(selection: PathSelection): string | null {
  if (!selection.department) return null;
  if (!selection.category) return `${selection.department}:`;
  if (!selection.subCategory) return `${selection.department}:${selection.category}:`;
  return `${selection.department}:${selection.category}:${selection.subCategory}`;
}

const lastSegment = (label: string) => label.split(" > ").at(-1) ?? label;

function withCount(label: string, count: number) {
  return `${label} (${count.toLocaleString()})`;
}

export function brandOptions(
  facets: SizingSampleFacets | null,
  brandType: string | null,
  selectedKey: string | null,
): SelectOption[] {
  const brands = (facets?.brands ?? []).filter(
    // The chip narrows the list, but a brand already chosen stays visible so it can be seen and cleared.
    (brand) => !brandType || brand.type === brandType || brand.brandKey === selectedKey,
  );
  return [
    { key: "", label: "All brands" },
    ...brands.map((brand): SelectOption => ({
      key: brand.brandKey,
      label: withCount(brand.name, brand.count),
      hint: brand.type === "global" ? "Global brand" : brand.type === "private" ? "Private brand" : undefined,
    })),
  ];
}

export function departmentOptions(facets: SizingSampleFacets | null): SelectOption[] {
  return [
    { key: "", label: "All departments" },
    ...(facets?.paths ?? [])
      .filter((path) => path.depth === 1)
      .map((path): SelectOption => ({
        key: path.key.slice(0, -1),
        label: withCount(lastSegment(path.label), path.count),
      })),
  ];
}

export function categoryOptions(facets: SizingSampleFacets | null, department: string | null): SelectOption[] {
  if (!department) return [{ key: "", label: "All categories" }];
  return [
    { key: "", label: "All categories" },
    ...(facets?.paths ?? [])
      .filter((path) => path.depth === 2 && path.key.startsWith(`${department}:`))
      .map((path): SelectOption => ({
        key: path.key.split(":")[1],
        label: withCount(lastSegment(path.label), path.count),
      })),
  ];
}

export function subCategoryOptions(
  facets: SizingSampleFacets | null,
  department: string | null,
  category: string | null,
): SelectOption[] {
  if (!department || !category) return [{ key: "", label: "All subcategories" }];
  return [
    { key: "", label: "All subcategories" },
    ...(facets?.paths ?? [])
      .filter((path) => path.depth === 3 && path.key.startsWith(`${department}:${category}:`))
      .map((path): SelectOption => ({
        key: path.key.split(":")[2],
        label: withCount(lastSegment(path.label), path.count),
      })),
  ];
}

export function collectionOptions(facets: SizingSampleFacets | null): SelectOption[] {
  return [
    { key: "", label: "All collections" },
    ...(facets?.collections ?? []).map((collection): SelectOption => ({
      key: collection.id,
      label: withCount(collection.name, collection.count),
      hint: collection.trail.length > 1 ? collection.trail.slice(0, -1).join(" › ") : undefined,
    })),
  ];
}
