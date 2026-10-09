import { comparableAttributeValue } from "./lookup";
import type { PathConfigAttribute, PathConfigNode, PathConfigTier, PersonaPathConfig } from "./types";

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function renderTiers(tiers: readonly PathConfigTier[]): string {
  if (tiers.length === 0) return "none";
  return tiers.map((tier) => `${tier.label}[${formatAmount(tier.min)}-${formatAmount(tier.max)}, ${tier.count}]`).join("  ");
}

/** Built-in fields whose values a shopper names in words; a bare number there is a merchant's
 *  internal colour or fabric code, which nobody can ask for. */
const WORD_VALUED_FIELDS = new Set(["colors", "materials", "patterns"]);

function letterCount(value: string): number {
  return value.match(/\p{L}/gu)?.length ?? 0;
}

/**
 * One entry per value however the store spelled it ("Black", "BLACK", "L.GREY", "Light Grey"),
 * shown in its most spelled-out form, ties to the first in sort order. Validation matches the same
 * way and sends every stored spelling, so nothing is lost.
 */
function distinctValues(attribute: PathConfigAttribute): string[] {
  const shown = new Map<string, string>();
  for (const value of attribute.values ?? []) {
    if (WORD_VALUED_FIELDS.has(attribute.field) && /^[\d\s.\-/]+$/.test(value)) continue;
    const key = comparableAttributeValue(attribute, value);
    const current = shown.get(key);
    if (current === undefined || letterCount(value) > letterCount(current)) shown.set(key, value);
  }
  return [...shown.values()].sort((a, b) => a.localeCompare(b));
}

export function renderAttribute(attribute: PathConfigAttribute): string {
  if (attribute.kind === "number" && attribute.range) {
    return `${attribute.key}(number ${formatAmount(attribute.range.min)}..${formatAmount(attribute.range.max)})`;
  }
  return `${attribute.key}(${distinctValues(attribute).join("|")})`;
}

function renderLeaf(node: PathConfigNode, indent: string): string[] {
  const lines = [`${indent}${node.path} — ${node.inStock} in stock`];
  lines.push(`${indent}  tiers: ${renderTiers(node.tiers)}`);
  const brands = node.brands;
  lines.push(
    `${indent}  brands: ${brands.length > 0 ? brands.map((brand) => `${brand.name} (${brand.count})`).join(", ") : "none recorded"}`
  );
  const attributes = node.attributes.filter((attribute) => attribute.kind === "number" || distinctValues(attribute).length > 0);
  if (attributes.length > 0) {
    lines.push(`${indent}  attrs: ${attributes.map(renderAttribute).join(" · ")}`);
  } else {
    lines.push(`${indent}  attrs: none recorded`);
  }
  if (node.words?.length) lines.push(`${indent}  title words: ${node.words.join(", ")}`);
  return lines;
}

/** One category and its leaves — the slice of the config an outfit slot needs. */
export function renderCategory(config: PersonaPathConfig, category: PathConfigNode): string {
  const lines = [`${category.path} — ${category.inStock} in stock · tiers: ${renderTiers(category.tiers)}`];
  const leaves = config.nodes.filter(
    (node) => node.level === "leaf" && node.department === category.department && node.category === category.category
  );
  for (const leaf of leaves) lines.push(...renderLeaf(leaf, "  "));
  return lines.join("\n");
}

/**
 * The config as the agents read it. Deterministic: same config, same bytes — this text is the
 * tail of Persona's cached prompt prefix, so any nondeterminism here is a cache miss every turn.
 */
export function renderPathConfig(config: PersonaPathConfig): string {
  const departments = config.nodes.filter((node) => node.level === "department");
  const lines: string[] = [
    `Currency: ${config.currency ?? "store default"} · ${config.inStock} products in stock across ${
      config.nodes.filter((node) => node.level === "leaf").length
    } leaves.`,
  ];
  if (config.catalogLanguage) lines.push(`Catalog language: ${config.catalogLanguage} (product titles and descriptions are written in it).`);
  lines.push("");

  if (departments.length === 0) {
    lines.push("NO PATHS — this store has no in-stock products with a size chart mapped to Persona yet.");
    return lines.join("\n");
  }

  for (const department of departments) {
    lines.push(`### ${department.path} — ${department.inStock} in stock · tiers: ${renderTiers(department.tiers)}`);
    const categories = config.nodes.filter((node) => node.level === "category" && node.department === department.department);
    for (const category of categories) lines.push(renderCategory(config, category));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
