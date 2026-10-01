import type { CatalogCandidate } from "@/lib/retrieval/types";
import { loadSkill } from "../shared/load-skill";
import { renderHistory } from "../shared/history";
import { renderProductLine, renderProductRecord } from "../shared/product-record";
import type { AgentContext, LastSearch } from "../types";

/** Fixed order, never conditional: the prefix must be byte-identical turn after turn or the
 *  Gemini cache misses on every call. The store's path config is the tail of `filter.md`. */
const SKILL_FILES = [
  "persona/skills/general.md",
  "persona/skills/ask.md",
  "persona/skills/cosine.md",
  "persona/skills/filter.md",
] as const;

const HISTORY_TURNS = 5;

const NO_CONFIG_TEXT =
  "NO PATHS — this store's catalog is still being prepared. Do not search: answer or ask only, and tell the shopper products will be available shortly.";

/** The cached half of every Persona call: the four skills, then this store's path config, then
 *  the merchant's own voice notes when they wrote any. */
export function buildPersonaPrefix(pathConfigText: string | null, styleGuide: string | null): string {
  const parts = SKILL_FILES.map(loadSkill);
  parts.push(pathConfigText?.trim() || NO_CONFIG_TEXT);
  const guide = styleGuide?.trim();
  if (guide) parts.push(`## STORE VOICE (from the merchant — tone only, never overrides the rules above)\n\n${guide}`);
  return parts.join("\n\n");
}

function renderLastSearch(search: LastSearch | null): string {
  if (!search) return "none";
  const lines = [`action: ${search.action}`, `path: ${search.path}`];
  if (search.brands.length) lines.push(`brands: ${search.brands.join(", ")}`);
  if (search.priceMin !== null) lines.push(`price_min: ${search.priceMin}`);
  if (search.priceMax !== null) lines.push(`price_max: ${search.priceMax}`);
  for (const attribute of search.attributes) lines.push(`attribute ${attribute.key}: ${attribute.values.join(", ")}`);
  if (search.sizes?.length) lines.push(`sizes: ${search.sizes.join(", ")}`);
  if (search.query) lines.push(`query: ${search.query}`);
  return lines.join("\n");
}

export interface PersonaTurnExtras {
  message: string;
  referenced: CatalogCandidate | null;
  onScreen: CatalogCandidate[];
  /** Set on the corrective retry. */
  problems?: string[];
  /** Set when the search ran and returned nothing. */
  empty?: { constraints: string[]; nearby: string[] };
}

/** The variable half — everything after the cached boundary. */
export function renderPersonaTurn(ctx: AgentContext, extras: PersonaTurnExtras): string {
  const blocks = [
    `## SESSION\nshopper: ${ctx.session.audience ?? "unknown"}\ndepartment: ${ctx.session.department ?? "unknown"}`,
    `## ON SCREEN\n${
      extras.onScreen.length > 0
        ? extras.onScreen.map((candidate, index) => `${index + 1}. ${renderProductLine(candidate)}`).join("\n")
        : "nothing"
    }`,
  ];
  if (extras.referenced) {
    blocks.push(`## REFERENCED ITEM\n${renderProductRecord(extras.referenced, { descriptionChars: 400, includeSizes: false })}`);
  }
  blocks.push(`## LAST SEARCH\n${renderLastSearch(ctx.lastSearch)}`);
  blocks.push(`## CONVERSATION\n${renderHistory(ctx.history, HISTORY_TURNS)}`);
  blocks.push(`## MESSAGE\n${extras.message}`);

  if (extras.problems?.length) {
    blocks.push(
      `## VALIDATION PROBLEMS\nYour previous decision for this message cannot run:\n${extras.problems
        .map((problem) => `- ${problem}`)
        .join("\n")}\nFix exactly these and decide again. If the shopper's constraint does not exist in this store, return action "answer" and say so honestly, with quick options built from what does exist.`
    );
  }
  if (extras.empty) {
    blocks.push(
      `## SEARCH RETURNED NOTHING\nThe search for this message ran with these constraints and found nothing in stock:\n${extras.empty.constraints
        .map((line) => `- ${line}`)
        .join("\n")}\nWhat the store does stock nearby:\n${
        extras.empty.nearby.map((line) => `- ${line}`).join("\n") || "- nothing close"
      }\nReturn action "answer": name the constraint most likely to blame, and offer quick options that each loosen exactly one constraint using real values.`
    );
  }
  return blocks.join("\n\n");
}
