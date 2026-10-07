import { QUALIFIER_TOKENS } from "./brand-mapping";
import { normalizeBrandKey, UNKNOWN_BRAND_KEY } from "./keys";

export interface ArrangedBrandRow {
  brandKey: string;
  brandName: string;
  skuCount: number;
  sizingCategory: string;
}

/** One brand as Stage 4 lists it: its name once, then one row per sizing category. */
export interface BrandCluster<T> {
  key: string;
  name: string;
  /** Every chart brand key folded in. More than one means the store spells the brand several ways,
   *  and each spelling still keeps charts of its own until they are merged in brand mapping. */
  brandKeys: string[];
  /** The other spellings, as the store writes them. */
  otherNames: string[];
  skuCount: number;
  rows: T[];
}

const CATEGORY_ORDER = ["tops", "bottoms", "dresses", "outerwear", "footwear"];

const AUDIENCE_WORD: Record<string, string> = {
  men: "men", mens: "men", man: "men", male: "men",
  women: "women", womens: "women", woman: "women", female: "women",
  kid: "kids", kids: "kids",
  boy: "boys", boys: "boys",
  girl: "girls", girls: "girls",
};

interface BrandIdentity {
  brandKey: string;
  name: string;
  skuCount: number;
  /** Case, spacing and punctuation folded away: `MOUSTACHE MEN` and `moustache-men` agree here. */
  compact: string;
  /** The brand without the audience words: what `Moustache Men` and `Moustache Women` share. */
  base: string;
  /** The audience words, normalised, so `Men` and `Mens` are the same line. */
  audience: string;
}

/**
 * Orders Stage 4's brand rows so one brand's categories sit together.
 *
 * Rows are grouped when they are the same brand written differently: identical once case, spaces and
 * punctuation are ignored, or one typo apart. Audience words are compared on their own and never
 * forgiven as a typo, so `Moustache Men` and `Moustache Women` stay two brands, though they are listed
 * next to each other. Grouping is display only; which chart sizes a product is still decided per
 * brand key.
 */
export function arrangeByBrand<T>(rows: readonly T[], read: (row: T) => ArrangedBrandRow): BrandCluster<T>[] {
  const identities = new Map<string, BrandIdentity>();
  const rowsByKey = new Map<string, T[]>();
  for (const row of rows) {
    const value = read(row);
    const existing = identities.get(value.brandKey);
    if (existing) {
      existing.skuCount += value.skuCount;
    } else {
      identities.set(value.brandKey, { ...identify(value), skuCount: value.skuCount });
    }
    rowsByKey.set(value.brandKey, [...(rowsByKey.get(value.brandKey) ?? []), row]);
  }
  for (const [brandKey, keyRows] of rowsByKey) {
    const best = keyRows.reduce((top, row) => (read(row).skuCount > read(top).skuCount ? row : top));
    identities.get(brandKey)!.name = read(best).brandName || identities.get(brandKey)!.name;
  }

  const ordered = [...identities.values()].sort(
    (a, b) => b.skuCount - a.skuCount || a.brandKey.localeCompare(b.brandKey),
  );
  const clusters: BrandIdentity[][] = [];
  for (const identity of ordered) {
    const home = clusters.find((members) => members.some((member) => sameBrand(member, identity)));
    if (home) home.push(identity);
    else clusters.push([identity]);
  }

  const built = clusters.map((members) => {
    const lead = members[0];
    const names = new Map<string, string>();
    for (const member of members) {
      const label = member.name.trim().replace(/\s+/g, " ");
      if (!names.has(label.toLowerCase())) names.set(label.toLowerCase(), label);
    }
    const clusterRows = members
      .flatMap((member) => rowsByKey.get(member.brandKey) ?? [])
      .sort((a, b) => {
        const left = read(a);
        const right = read(b);
        return (
          categoryRank(left.sizingCategory) - categoryRank(right.sizingCategory) ||
          right.skuCount - left.skuCount ||
          left.brandKey.localeCompare(right.brandKey)
        );
      });
    return {
      cluster: {
        key: lead.brandKey,
        name: lead.name.trim() || lead.brandKey,
        brandKeys: members.map((member) => member.brandKey),
        otherNames: [...names.values()].filter((label) => label.toLowerCase() !== lead.name.trim().toLowerCase()),
        skuCount: members.reduce((sum, member) => sum + member.skuCount, 0),
        rows: clusterRows,
      } satisfies BrandCluster<T>,
      lead,
    };
  });

  // Families keep a brand's lines adjacent (Moustache Men beside Moustache Women), ordered by the
  // family's total stock so the biggest job stays on top.
  const families: (typeof built)[] = [];
  for (const entry of built) {
    const home = families.find((family) => family.some((member) => similar(member.lead.base, entry.lead.base)));
    if (home) home.push(entry);
    else families.push([entry]);
  }
  return families
    .map((family) => ({
      total: family.reduce((sum, entry) => sum + entry.cluster.skuCount, 0),
      clusters: family
        .map((entry) => entry.cluster)
        .sort((a, b) => b.skuCount - a.skuCount || a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => b.total - a.total || a.clusters[0].key.localeCompare(b.clusters[0].key))
    .flatMap((family) => family.clusters);
}

function identify(row: ArrangedBrandRow): BrandIdentity {
  const key = row.brandKey === UNKNOWN_BRAND_KEY ? UNKNOWN_BRAND_KEY : normalizeBrandKey(row.brandName || row.brandKey);
  const tokens = key.split("_").filter(Boolean);
  const audience = tokens.filter((token) => QUALIFIER_TOKENS.has(token)).map((token) => AUDIENCE_WORD[token] ?? token);
  const base = tokens.filter((token) => !QUALIFIER_TOKENS.has(token)).join("");
  const compact = tokens.join("");
  return {
    brandKey: row.brandKey,
    name: row.brandName,
    skuCount: 0,
    compact,
    base: base || compact,
    audience: [...new Set(audience)].sort().join("+"),
  };
}

function sameBrand(a: BrandIdentity, b: BrandIdentity): boolean {
  if (a.brandKey === UNKNOWN_BRAND_KEY || b.brandKey === UNKNOWN_BRAND_KEY) return a.brandKey === b.brandKey;
  if (a.compact === b.compact) return true;
  return a.audience === b.audience && similar(a.base, b.base);
}

/** Equal, or one typo apart once the name is long enough that a typo is the likely explanation. */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 5) return false;
  const allowed = shorter >= 10 ? 2 : 1;
  return Math.abs(a.length - b.length) <= allowed && editDistance(a, b, allowed) <= allowed;
}

function editDistance(a: string, b: string, cap: number): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > cap) return rowMin;
    previous = current;
  }
  return previous[b.length];
}

function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}
