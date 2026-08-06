/**
 * Parses free-text budget intake ("Under $300", "$300 – $600", "No limit") into a numeric
 * max price the catalog search and scorer can use. Returns null when no usable bound exists.
 */
export function parseBudgetMax(budget: string | undefined | null): number | null {
  if (!budget) return null;
  const lower = budget.toLowerCase().trim();
  if (!lower || lower.includes("no limit") || lower.includes("unlimited") || lower === "any") {
    return null;
  }

  // Prefer explicit upper bounds: "under 300", "up to $500", "max 200"
  const underMatch = lower.match(/(?:under|below|up to|max(?:imum)?|less than)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (underMatch) return Number(underMatch[1].replace(/,/g, ""));

  // Ranges: "$300 – $600", "300-600", "300 to 600" → use the high end
  const rangeMatch = lower.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:–|-|to)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (rangeMatch) return Number(rangeMatch[2].replace(/,/g, ""));

  // Bare amount: "$250" or "250"
  const bareMatch = lower.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (bareMatch) return Number(bareMatch[1].replace(/,/g, ""));

  return null;
}
