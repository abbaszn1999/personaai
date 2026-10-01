import type { PathConfigAttribute, PathConfigNode, PathConfigTier, PersonaPathConfig } from "./types";

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function renderTiers(tiers: readonly PathConfigTier[]): string {
  if (tiers.length === 0) return "none";
  return tiers.map((tier) => `${tier.label}[${formatAmount(tier.min)}-${formatAmount(tier.max)}, ${tier.count}]`).join("  ");
}

export function renderAttribute(attribute: PathConfigAttribute): string {
  if (attribute.kind === "number" && attribute.range) {
    return `${attribute.key}(number ${formatAmount(attribute.range.min)}..${formatAmount(attribute.range.max)})`;
  }
  return `${attribute.key}(${(attribute.values ?? []).join("|")})`;
}

function renderLeaf(node: PathConfigNode, indent: string): string[] {
  const lines = [`${indent}${node.path} — ${node.inStock} in stock`];
  lines.push(`${indent}  tiers: ${renderTiers(node.tiers)}`);
  lines.push(
    `${indent}  brands: ${node.brands.length > 0 ? node.brands.map((brand) => `${brand.name} (${brand.count})`).join(", ") : "none recorded"}`
  );
  if (node.attributes.length > 0) {
    lines.push(`${indent}  attrs: ${node.attributes.map(renderAttribute).join(" · ")}`);
  } else {
    lines.push(`${indent}  attrs: none recorded`);
  }
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
    "",
  ];

  if (departments.length === 0) {
    lines.push("NO PATHS — this store has no in-stock products mapped to Persona yet.");
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
