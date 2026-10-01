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
  return `none (fallback to anchor tier ${line.tier ?? "unknown"}: ${ceilings}). Use these ceilings; do not invent a total.`;
}

export interface PlanTurnInput {
  anchor: CatalogCandidate;
  department: string;
  budget: BudgetLine;
  slotsText: string;
  /** How many looks to plan: up to five on "Complete the look", exactly one on a follow-up. */
  looks: number;
  request?: string;
  problems?: string[];
}

export function renderPlanTurn(input: PlanTurnInput): string {
  const blocks = [
    `## ANCHOR\n${renderProductRecord(input.anchor, { descriptionChars: 400, includeSizes: false })}`,
    `## BUDGET\n${renderBudget(input.budget)}`,
    `## SESSION\ndepartment: ${input.department}`,
  ];
  if (input.request) blocks.push(`## SHOPPER REQUEST\n${input.request}`);
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
  /** Pieces a swap takes out, so the reply can say how the replacements differ. */
  replacing?: CatalogCandidate[];
  styleGuide?: string | null;
  /** Candidates were already narrowed to the shopper's measurements. */
  sized?: boolean;
}

export function renderComposeTurn(input: ComposeTurnInput): string {
  const fixedTotal = [input.anchor, ...input.kept].reduce((sum, item) => sum + (item.price ?? 0), 0);
  const blocks = [`## ANCHOR\n${renderProductRecord(input.anchor, { descriptionChars: 300, includeSizes: false })}`];
  if (input.kept.length > 0) {
    blocks.push(`## KEPT PIECES (already in the look — do not pick again)\n${input.kept.map(renderProductLine).join("\n")}`);
  }
  blocks.push(
    `## BUDGET\n${
      input.budget === null
        ? "none — keep each piece within its slot ceiling"
        : `${input.budget} total; anchor${input.kept.length ? " and kept pieces" : ""} cost ${fixedTotal} → up to ${Math.max(0, input.budget - fixedTotal)} for the new pieces`
    }`
  );
  if (input.request) blocks.push(`## SHOPPER REQUEST\n${input.request}`);
  if (input.replacing?.length) {
    blocks.push(`## REPLACING (taken out of the look — not a candidate)\n${input.replacing.map(renderProductLine).join("\n")}`);
  }
  const guide = input.styleGuide?.trim();
  if (guide) blocks.push(`## STORE STYLE NOTES (from the merchant — lean on them, never break the doctrine)\n${guide}`);
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

export interface FollowUpTurnInput {
  ctx: AgentContext;
  message: string;
  look: LookRecord;
  pieces: CatalogCandidate[];
  budget: number | null;
  slotsText: string;
}

export function renderFollowUpTurn(input: FollowUpTurnInput): string {
  const { look } = input;
  const slotLines = look.slots.map(
    (slot) => `- ${slot.slot}: path ${slot.path}, ceiling ${slot.priceMax ?? "none"}, query "${slot.query}"`
  );
  return [
    `## ATTACHED LOOK\ntotal: ${look.total}\n${input.pieces
      .map((piece) => `${piece.externalId === look.anchorId ? "ANCHOR " : ""}${renderProductRecord(piece, { descriptionChars: 200, includeSizes: false })}`)
      .join("\n---\n")}${look.rationale ? `\nwhy it works: ${look.rationale}` : ""}`,
    `## LOOK SLOTS\n${slotLines.join("\n") || "- none recorded"}`,
    `## BUDGET\n${input.budget ?? "none"}`,
    `## PATH CONFIG\n${input.slotsText || "no other slots in stock"}`,
    `## CONVERSATION\n${renderHistory(input.ctx.history, FOLLOW_UP_TURNS)}`,
    `## MESSAGE\n${input.message}`,
  ].join("\n\n");
}
