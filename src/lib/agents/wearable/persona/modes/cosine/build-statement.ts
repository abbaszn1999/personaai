import { createChatCompletion } from "@/lib/ai/gemini-chat";
import type { AnchorState, ConversationTurn } from "@/lib/retrieval/types";
import { loadSkill } from "../../../load-skill";

/**
 * Turns a shopper's request into the text that actually gets searched.
 *
 * This is a reasoning task, not a formatting step, and it gets its own call for that reason.
 * See `skills/cosine.md` for why the wording of that call carries as much weight as it does.
 */

export interface BuildStatementInput {
  query: string;
  recentTurns: ConversationTurn[];
  anchor: AnchorState | null;
  /** The merchant's soft taste guidance. Leans the ranking; never excludes anything. */
  styleGuide: string | null;
  /** Set in bundle mode: the category currently being resolved. */
  targetCategory?: string | null;
  apiKey: string;
}

export async function buildQueryStatement(input: BuildStatementInput): Promise<string> {
  const conversation = input.recentTurns
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  const parts = [
    conversation ? `Recent conversation:\n${conversation}` : "",
    input.anchor
      ? `Already selected — describe something that goes with this:\n"${input.anchor.title}"${
          input.anchor.enrichedDescription ? `\n${input.anchor.enrichedDescription}` : ""
        }`
      : "",
    input.targetCategory ? `You are describing the ideal ${input.targetCategory} for this shopper.` : "",
    input.styleGuide
      ? `The store's aesthetic, which should lean the description without narrowing it:\n${input.styleGuide}`
      : "",
    `Shopper's request: ${input.query}`,
  ].filter(Boolean);

  try {
    const response = await createChatCompletion(
      input.apiKey,
      [
        { role: "system", content: loadSkill("persona/skills/cosine.md").body },
        { role: "user", content: parts.join("\n\n") },
      ],
      { timeoutMs: 15_000 }
    );

    const statement = response.content?.trim();
    if (statement) return statement;
  } catch (err) {
    console.error("[persona cosine buildQueryStatement]", err);
  }

  return fallbackStatement(input);
}

/**
 * Used only when the reasoning call fails. Deliberately still not keyword extraction — it
 * keeps the shopper's full sentence and staples on whatever context is known, which ranks
 * worse than a written statement but far better than a stripped bag of words.
 */
export function fallbackStatement(input: BuildStatementInput): string {
  return [
    input.targetCategory ? `A ${input.targetCategory}.` : "",
    input.query,
    input.anchor ? `Should coordinate with ${input.anchor.title}.` : "",
    input.styleGuide ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}
