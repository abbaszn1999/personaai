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

const HISTORY_TURNS = 8;
/** A pasted essay is still one request; past this the model reads noise, not intent. */
const MAX_MESSAGE_CHARS = 2_000;

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

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
  if (search.alsoPaths?.length) lines.push(`also_paths: ${search.alsoPaths.join(", ")}`);
  if (search.brands.length) lines.push(`brands: ${search.brands.join(", ")}`);
  if (search.excludeBrands?.length) lines.push(`exclude_brands: ${search.excludeBrands.join(", ")}`);
  if (search.priceMin !== null) lines.push(`price_min: ${search.priceMin}`);
  if (search.priceMax !== null) lines.push(`price_max: ${search.priceMax}`);
  for (const attribute of search.attributes) lines.push(`attribute ${attribute.key}: ${attribute.values.join(", ")}`);
  for (const attribute of search.excludeAttributes ?? []) {
    lines.push(`exclude attribute ${attribute.key}: ${attribute.values.join(", ")}`);
  }
  if (search.sizes?.length) lines.push(`sizes: ${search.sizes.join(", ")}`);
  if (search.query) lines.push(`query: ${search.query}`);
  return lines.join("\n");
}

export interface PersonaTurnExtras {
  message: string;
  referenced: CatalogCandidate | null;
  onScreen: CatalogCandidate[];
  /** False when the store's catalog cannot be searched right now. */
  canSearch: boolean;
  /** Set on the corrective retry. */
  problems?: string[];
  /** Set when the corrective retry still could not become a search. */
  unavailable?: { problems: string[]; nearby: string[] };
  /** Set when the search ran and returned nothing. `exhausted` means it returned nothing new:
   *  everything matching is already on screen. `sizeOnly` means the same search does find stock
   *  without the shopper's fit — nothing matching comes in their size. */
  empty?: { constraints: string[]; nearby: string[]; exhausted?: boolean; sizeOnly?: boolean };
}

/** The variable half — everything after the cached boundary. */
export function renderPersonaTurn(ctx: AgentContext, extras: PersonaTurnExtras): string {
  const blocks = [
    `## SESSION\nshopper: ${ctx.session.audience ?? "unknown"}\ndepartment: ${ctx.session.department ?? "unknown"}\ncatalog: ${
      extras.canSearch ? "searchable" : "unavailable right now — answer or ask only"
    }`,
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
  blocks.push(`## MESSAGE\n${clip(extras.message.trim(), MAX_MESSAGE_CHARS)}`);

  if (extras.problems?.length) {
    blocks.push(
      `## VALIDATION PROBLEMS\nYour previous decision for this message cannot run:\n${extras.problems
        .map((problem) => `- ${problem}`)
        .join("\n")}\nFix exactly these and decide again. If the shopper's constraint does not exist in this store, return action "answer" and say so honestly, with quick options built from what does exist.`
    );
  }
  if (extras.unavailable) {
    blocks.push(
      `## CANNOT SEARCH\nThis message cannot become a search in this store:\n${extras.unavailable.problems
        .map((problem) => `- ${problem}`)
        .join("\n")}\nStocked nearby:\n${
        extras.unavailable.nearby.map((path) => `- ${path}`).join("\n") || "- nothing close"
      }\nReturn action "answer" in the shopper's language: say plainly what is not possible and why, in one or two sentences, and offer up to four quick options built from what does exist, written as a shopper would say them (never as paths).`
    );
  }
  if (extras.empty?.exhausted) {
    blocks.push(
      `## NOTHING MORE TO SHOW\nThe shopper asked for more of the same search, and every product matching it is already on screen:\n${extras.empty.constraints
        .map((line) => `- ${line}`)
        .join("\n")}\nReturn action "answer": say that is everything the store has for this right now, and offer quick options that each change exactly one constraint using real values (a nearby category, another colour, a wider price).`
    );
  } else if (extras.empty?.sizeOnly) {
    blocks.push(
      `## NOTHING IN THEIR SIZE\nThe search for this message ran with these constraints:\n${extras.empty.constraints
        .map((line) => `- ${line}`)
        .join("\n")}\nThe store does stock matching products, but none in a size that fits this shopper. Return action "answer": say plainly, in one or two sentences, that nothing matching comes in their size right now, without blaming any other constraint. Offer quick options that change exactly one thing that could reach their size: a nearby category, another colour, another brand or a wider price — never a different size.`
    );
  } else if (extras.empty) {
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
