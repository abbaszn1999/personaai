import type { CatalogCandidate, HardRule, RuleSelector } from "@/lib/retrieval/types";

/**
 * The merchant's absolute constraints, enforced mechanically.
 *
 * Two of the three rule types can be compiled into the query and are handled in the filter
 * builder. `never_pair` and `max_price_spread` cannot: they are properties of a *combination*,
 * not of any single item, so no per-category filter can express them. They are checked here,
 * after the bundle model has proposed a set — which is also why the model's output is treated
 * as a proposal rather than an answer.
 */

/** Every root category a candidate belongs to, across all of its (possibly several) paths. */
function candidateCategories(candidate: CatalogCandidate): string[] {
  return candidate.categoryPaths.map((path) => path[0]).filter((value): value is string => Boolean(value));
}

/** Every non-root segment across all of a candidate's paths — a rule naming a subcategory should
 *  match whichever level it names, not only the leaf. */
function candidateSubcategories(candidate: CatalogCandidate): string[] {
  return candidate.categoryPaths.flatMap((path) => path.slice(1));
}

export function matchesSelector(candidate: CatalogCandidate, selector: RuleSelector): boolean {
  if (selector.brands?.length) {
    const brand = candidate.brand?.toLowerCase();
    if (!brand || !selector.brands.some((value) => value.toLowerCase() === brand)) return false;
  }

  if (selector.categories?.length) {
    const categories = candidateCategories(candidate);
    if (!selector.categories.some((category) => categories.includes(category))) return false;
  }

  if (selector.subcategories?.length) {
    const subcategories = candidateSubcategories(candidate);
    if (!selector.subcategories.some((subcategory) => subcategories.includes(subcategory))) return false;
  }

  // An empty selector matches nothing rather than everything. A malformed rule that silently
  // matched every product would reject every bundle, and the shopper would just see an agent
  // that never finds anything.
  return Boolean(selector.brands?.length || selector.categories?.length || selector.subcategories?.length);
}

export interface RuleViolation {
  rule: HardRule["type"];
  detail: string;
}

/** Checks one proposed combination against the rules that only apply to combinations. */
export function validateBundle(items: CatalogCandidate[], rules: HardRule[]): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    if (rule.type === "exclude_items") {
      const excludedIds = new Set(rule.externalIds ?? []);
      for (const item of items) {
        const byId = excludedIds.has(item.externalId);
        const byBrand = rule.brands?.some((brand) => brand.toLowerCase() === item.brand?.toLowerCase()) ?? false;
        // Any of the item's category paths, not just a primary one — an excluded category has to
        // hide the product regardless of which selected category also reaches it.
        const byCategory = rule.categories?.some((category) => candidateCategories(item).includes(category)) ?? false;

        if (byId || byBrand || byCategory) {
          violations.push({ rule: "exclude_items", detail: `"${item.title}" is excluded by store rules.` });
        }
      }
      continue;
    }

    if (rule.type === "never_pair") {
      // Every ordered pair, both directions, since the two selectors aren't interchangeable.
      for (const a of items) {
        for (const b of items) {
          if (a.externalId === b.externalId) continue;
          if (matchesSelector(a, rule.a) && matchesSelector(b, rule.b)) {
            violations.push({ rule: "never_pair", detail: `"${a.title}" must not be paired with "${b.title}".` });
          }
        }
      }
      continue;
    }

    if (rule.type === "max_price_spread") {
      const prices = items.map((item) => item.price).filter((price): price is number => price !== null);
      if (prices.length < 2) continue;

      const spread = Math.max(...prices) - Math.min(...prices);
      if (spread > rule.amount) {
        violations.push({
          rule: "max_price_spread",
          detail: `Price spread of ${spread.toFixed(2)} exceeds the ${rule.amount} limit.`,
        });
      }
    }
  }

  return violations;
}

export function isValidBundle(items: CatalogCandidate[], rules: HardRule[]): boolean {
  return validateBundle(items, rules).length === 0;
}

/**
 * Drops proposed bundles that break a combination rule.
 *
 * Rejecting rather than repairing is deliberate: swapping an item to satisfy a price spread
 * would silently discard the styling judgement that was the entire reason for the model call.
 * Asking for several options up front is what makes rejection affordable.
 */
export function filterValidBundles<T extends { items: CatalogCandidate[] }>(bundles: T[], rules: HardRule[]): T[] {
  if (rules.length === 0) return bundles;
  return bundles.filter((bundle) => isValidBundle(bundle.items, rules));
}

/** Normalises whatever is stored in the `hard_rules` jsonb, discarding malformed entries so a
 *  bad rule can't quietly reject every bundle. */
export function parseHardRules(raw: unknown): HardRule[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter((entry): entry is HardRule => {
    if (!entry || typeof entry !== "object") return false;
    const rule = entry as { type?: unknown; amount?: unknown; a?: unknown; b?: unknown };

    if (rule.type === "exclude_items") return true;
    if (rule.type === "never_pair") return Boolean(rule.a && rule.b);
    if (rule.type === "max_price_spread") return typeof rule.amount === "number" && rule.amount > 0;
    return false;
  });
}
