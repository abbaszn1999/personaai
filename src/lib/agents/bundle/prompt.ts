import type { PathConfigTier, PersonaPathConfig } from "@/lib/catalog/path-config/types";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { loadSkill, pickSections } from "../shared/load-skill";
import { renderHistory } from "../shared/history";
import { renderProductLine, renderProductRecord } from "../shared/product-record";
import type { AgentContext, LookRecord } from "../types";
import type { SlotCandidates } from "./compose";

const GENERAL = "bundle/skills/general.md";
const BUNDLE = "bundle/skills/bundle.md";
const FOLLOW_UP_TURNS = 3;

/** Each stage gets only the sections it uses — the compose call in particular is the expensive
 *  one, and the planning sections would be dead weight in it. */
export function planPrefix(): string {
  return [loadSkill(GENERAL), pickSections(loadSkill(BUNDLE), ["1", "2", "3", "4"])].join("\n\n");
}

export function composePrefix(): string {
  return [loadSkill(GENERAL), pickSections(loadSkill(BUNDLE), ["5"])].join("\n\n");
}

export function followUpPrefix(): string {
  return [loadSkill(GENERAL), pickSections(loadSkill(BUNDLE), ["6"])].join("\n\n");
}

export function anchorPrefix(): string {
  return [loadSkill(GENERAL), pickSections(loadSkill(BUNDLE), ["7"])].join("\n\n");
}

export type BudgetLine =
  | { kind: "budget"; budget: number; committed: number }
  | { kind: "fallback"; tier: string | null; ceilings: Map<string, number | null> };

function renderBudget(line: BudgetLine): string {
  if (line.kind === "budget") {
    return `${line.budget} for the full look — pieces already in it cost ${line.committed} → remaining ${Math.max(0, line.budget - line.committed)}`;
  }
  const ceilings = [...line.ceilings]
    .map(([slot, ceiling]) => `${slot} ≤ ${ceiling ?? "no ceiling"}`)
    .join(", ");
  return `none — the shopper named no budget. Every piece stays in the anchor's tier ${line.tier ?? "(unknown)"} of the path you search: on a whole category that is ${ceilings}; on one leaf, that leaf's own tier ${line.tier ?? ""} maximum. Use those ceilings; do not invent a total.`;
}

/** Currency and the language the store writes its titles in — every query is written in it. */
export function renderStore(config: PersonaPathConfig): string {
  const language = config.catalogLanguage?.trim();
  return [
    `currency: ${config.currency ?? "store default"}`,
    language
      ? `catalog language: ${language} — product titles are written in it, so every query is too`
      : "catalog language: not recorded — write queries in the language of the title words below",
  ].join("\n");
}

/** Where the anchor sits among the prices of its own path. */
export interface AnchorTier {
  path: string;
  tier: PathConfigTier;
}

const TIER_WORDS: Record<PathConfigTier["label"], string> = {
  A: "the lower third of its range",
  B: "the middle of its range",
  C: "the top third of its range",
};

function renderAnchor(anchor: CatalogCandidate, descriptionChars: number, position?: AnchorTier | null): string {
  const record = renderProductRecord(anchor, { descriptionChars, includeSizes: false });
  if (!position) return record;
  const { tier } = position;
  return `${record}\nprice position: tier ${tier.label} of ${position.path} (${tier.min}–${tier.max}) — ${TIER_WORDS[tier.label]}`;
}

function renderStyleNotes(guide: string | null | undefined): string | null {
  const text = guide?.trim();
  return text ? `## STORE STYLE NOTES (from the merchant — lean on them, never break the doctrine)\n${text}` : null;
}

export interface PlanTurnInput {
  anchor: CatalogCandidate;
  anchorTier?: AnchorTier | null;
  department: string;
  budget: BudgetLine;
  /** `renderStore` of the store's config. */
  store?: string;
  slotsText: string;
  /** How many looks to plan: up to five on "Complete the look", exactly one on a follow-up. */
  looks: number;
  request?: string;
  /** The shopper's language — look themes are written in it. */
  language?: string | null;
  styleGuide?: string | null;
  problems?: string[];
}

export function renderPlanTurn(input: PlanTurnInput): string {
  const blocks = [
    `## ANCHOR\n${renderAnchor(input.anchor, 400, input.anchorTier)}`,
    `## BUDGET\n${renderBudget(input.budget)}`,
    `## SESSION\ndepartment: ${input.department}`,
  ];
  if (input.store) blocks.push(`## STORE\n${input.store}`);
  if (input.request) blocks.push(`## SHOPPER REQUEST\n${input.request}`);
  if (input.language?.trim()) blocks.push(`## REPLY LANGUAGE\n${input.language.trim()}`);
  const notes = renderStyleNotes(input.styleGuide);
  if (notes) blocks.push(notes);
  blocks.push(`## SLOTS IN PLAY\n${input.slotsText}`);
  blocks.push(`## LOOKS TO PLAN\n${input.looks === 1 ? "exactly 1" : `up to ${input.looks}`}`);
  if (input.problems?.length) {
    blocks.push(
      `## VALIDATION PROBLEMS\nYour previous plan cannot run:\n${input.problems.map((problem) => `- ${problem}`).join("\n")}\nRebalance once and return the corrected plan.`
    );
  }
  return blocks.join("\n\n");
}

export interface ComposeDirection {
  theme: string;
  slots: SlotCandidates[];
}

export interface ComposeTurnInput {
  anchor: CatalogCandidate;
  kept: CatalogCandidate[];
  budget: number | null;
  /** One group per planned look, numbered from 1 in this order. */
  directions: ComposeDirection[];
  request?: string;
  /** The language the shopper is answered in. */
  language?: string | null;
  /** Pieces a swap takes out, so the reply can say how the replacements differ. */
  replacing?: CatalogCandidate[];
  styleGuide?: string | null;
  /** Candidates were already narrowed to the shopper's measurements. */
  sized?: boolean;
  /** No budget was named and the shopper has not been told yet: the reply invites one. */
  mentionBudget?: boolean;
}

export function renderComposeTurn(input: ComposeTurnInput): string {
  const fixedTotal = Math.round([input.anchor, ...input.kept].reduce((sum, item) => sum + (item.price ?? 0), 0) * 100) / 100;
  const blocks = [`## ANCHOR\n${renderProductRecord(input.anchor, { descriptionChars: 300, includeSizes: false })}`];
  if (input.kept.length > 0) {
    blocks.push(`## KEPT PIECES (already in the look — do not pick again)\n${input.kept.map(renderProductLine).join("\n")}`);
  }
  blocks.push(
    `## BUDGET\n${
      input.budget === null
        ? `none — the shopper named no budget; keep each piece within its slot ceiling. ${
            input.mentionBudget ? "Mention it once in the reply and invite a budget." : "They were already told — do not mention budgets."
          }`
        : `${input.budget} total; anchor${input.kept.length ? " and kept pieces" : ""} cost ${fixedTotal} → the new pieces of one look together may cost up to ${Math.max(0, Math.round((input.budget - fixedTotal) * 100) / 100)}. Slot ceilings overlap, so add the prices of every look before you return it.`
    }`
  );
  if (input.request) blocks.push(`## SHOPPER REQUEST\n${input.request}`);
  if (input.language?.trim()) blocks.push(`## REPLY LANGUAGE\n${input.language.trim()}`);
  if (input.replacing?.length) {
    blocks.push(`## REPLACING (taken out of the look — not a candidate)\n${input.replacing.map(renderProductLine).join("\n")}`);
  }
  const notes = renderStyleNotes(input.styleGuide);
  if (notes) blocks.push(notes);
  const renderSlot = (slot: SlotCandidates) =>
    [
      `#### slot: ${slot.slot} (ceiling ${slot.ceiling ?? "none"})`,
      slot.candidates.length > 0
        ? slot.candidates.map(renderProductLine).join("\n")
        : `(nothing in stock under this ceiling${input.sized ? " in the shopper's size" : ""})`,
    ].join("\n");
  blocks.push(
    `## CANDIDATES\n${input.directions
      .map((direction, index) =>
        [`### look ${index + 1}${direction.theme ? ` — ${direction.theme}` : ""}`, ...direction.slots.map(renderSlot)].join("\n\n")
      )
      .join("\n\n")}`
  );
  return blocks.join("\n\n");
}

export interface AnchorTurnInput {
  ctx: AgentContext;
  message: string;
  anchor: CatalogCandidate;
  budget: number | null;
  slotsText: string;
  /** What the shopper had asked of the looks before this message. */
  brief?: string;
  /** Pieces already shown around this anchor. */
  shownCount: number;
}

export function renderAnchorTurn(input: AnchorTurnInput): string {
  return [
    `## ANCHOR\n${renderProductRecord(input.anchor, { descriptionChars: 300, includeSizes: false })}`,
    `## BUDGET\n${input.budget ?? "none"}`,
    `## ASKED SO FAR\n${input.brief ?? "nothing yet"}`,
    `## LOOKS SHOWN\n${input.shownCount > 0 ? `yes — ${input.shownCount} pieces shown around the anchor so far` : "none yet"}`,
    `## PATH CONFIG\n${input.slotsText || "no other slots in stock"}`,
    `## CONVERSATION\n${renderHistory(input.ctx.history, FOLLOW_UP_TURNS)}`,
    `## MESSAGE\n${input.message}`,
  ].join("\n\n");
}

export interface FollowUpTurnInput {
  ctx: AgentContext;
  message: string;
  look: LookRecord;
  pieces: CatalogCandidate[];
  budget: number | null;
  slotsText: string;
  /** `renderStore` of the store's config. */
  store?: string;
}

export function renderFollowUpTurn(input: FollowUpTurnInput): string {
  const { look } = input;
  const slotLines = look.slots.map(
    (slot) => `- ${slot.slot}: path ${slot.path}, ceiling ${slot.priceMax ?? "none"}, query "${slot.query}"`
  );
  const blocks = [
    `## ATTACHED LOOK\ntotal: ${look.total}\n${input.pieces
      .map((piece) => `${piece.externalId === look.anchorId ? "ANCHOR " : ""}${renderProductRecord(piece, { descriptionChars: 200, includeSizes: false })}`)
      .join("\n---\n")}${look.rationale ? `\nwhy it works: ${look.rationale}` : ""}`,
    `## LOOK SLOTS\n${slotLines.join("\n") || "- none recorded"}`,
    `## ASKED SO FAR\n${look.brief ?? "not recorded"}`,
    `## BUDGET\n${input.budget ?? "none"}`,
  ];
  if (input.store) blocks.push(`## STORE\n${input.store}`);
  const notes = renderStyleNotes(input.ctx.styleGuide);
  if (notes) blocks.push(notes);
  blocks.push(
    `## PATH CONFIG\n${input.slotsText || "no other slots in stock"}`,
    `## CONVERSATION\n${renderHistory(input.ctx.history, FOLLOW_UP_TURNS)}`,
    `## MESSAGE\n${input.message}`
  );
  return blocks.join("\n\n");
}
