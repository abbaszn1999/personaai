import type { CatalogCandidate } from "@/lib/retrieval/types";

/** `["persona","women","bottom","trouser"]` → `"women > bottom > trouser"`. The first Persona
 *  path wins when a product sits under more than one. */
export function personaPathOf(candidate: Pick<CatalogCandidate, "categoryPaths">): string | null {
  const path = candidate.categoryPaths.find((segments) => segments[0] === "persona" && segments.length > 1);
  return path ? path.slice(1).join(" > ") : null;
}

export function departmentOf(candidate: Pick<CatalogCandidate, "categoryPaths">): string | null {
  return personaPathOf(candidate)?.split(" > ")[0] ?? null;
}

/** Persona category id — `top`, `bottom`, `full-body`, `outerwear`, `footwear`. */
export function categoryOf(candidate: Pick<CatalogCandidate, "categoryPaths">): string | null {
  return personaPathOf(candidate)?.split(" > ")[1] ?? null;
}

/** Attribute keys that describe sizing internals, never shown to a model as product facts. */
function isInternalAttribute(key: string): boolean {
  return key.startsWith("fit_") || key === "sizing_chart_key";
}

export function productAttributes(candidate: CatalogCandidate): Array<[string, string[]]> {
  return Object.entries(candidate.attributes ?? {}).filter(
    ([key, values]) => !isInternalAttribute(key) && values.length > 0
  );
}

function money(value: number | null, currency: string | null): string {
  if (value === null) return "price unknown";
  return `${currency ? `${currency} ` : ""}${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export interface RecordOptions {
  /** Longer descriptions for the one item a turn is about; short ones for lists. */
  descriptionChars?: number;
  includeSizes?: boolean;
}

/** One product as a model reads it: facts only, one line per field, nothing invented. */
export function renderProductRecord(candidate: CatalogCandidate, options: RecordOptions = {}): string {
  const lines = [
    `id: ${candidate.externalId}`,
    `title: ${candidate.title}`,
    `path: ${personaPathOf(candidate) ?? "unmapped"}`,
    `brand: ${candidate.brand ?? "none"}`,
    `price: ${money(candidate.price, candidate.currency)}`,
    `availability: ${candidate.inStock ? "in stock" : "out of stock"}`,
  ];
  for (const [key, values] of productAttributes(candidate)) {
    if (key === "size" && options.includeSizes === false) continue;
    lines.push(`${key}: ${values.join(", ")}`);
  }
  if (candidate.fitSizes?.length) lines.push(`fits the shopper (size chart): ${candidate.fitSizes.join(", ")}`);
  const limit = options.descriptionChars ?? 0;
  if (limit > 0 && candidate.enrichedDescription) {
    const text = candidate.enrichedDescription.replace(/\s+/g, " ").trim();
    lines.push(`description: ${text.length > limit ? `${text.slice(0, limit)}…` : text}`);
  }
  return lines.join("\n");
}

/** A single compact line, for lists of candidates. */
export function renderProductLine(candidate: CatalogCandidate): string {
  const facts = productAttributes(candidate)
    .filter(([key]) => key !== "size")
    .map(([key, values]) => `${key}=${values.slice(0, 4).join("/")}`)
    .join("; ");
  const fits = candidate.fitSizes?.length ? ` · fits the shopper in ${candidate.fitSizes.join("/")}` : "";
  return `[${candidate.externalId}] ${candidate.title} · ${candidate.brand ?? "no brand"} · ${money(
    candidate.price,
    candidate.currency
  )}${facts ? ` · ${facts}` : ""}${fits}`;
}
