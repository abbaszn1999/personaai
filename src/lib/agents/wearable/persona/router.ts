import { createChatCompletion, type ToolDefinition } from "@/lib/ai/gemini-chat";
import { addTokenCost, type SessionMeter } from "@/lib/billing/session-meter";
import { RETRIEVAL_MODES, isRetrievalMode, type AnchorState, type BundleState, type ConversationTurn, type RetrievalMode } from "@/lib/retrieval/types";
import { loadSkill, renderSkill } from "../load-skill";
import { describeSkillsForRouter } from "./registry";

const routeTool: ToolDefinition = {
  type: "function",
  name: "route_request",
  description: "Selects which retrieval mode handles this shopper message.",
  parameters: {
    type: "object",
    properties: {
      mode: { type: "string", enum: [...RETRIEVAL_MODES] },
      /** Only meaningful for ask_info; kept on the same call so a clarifying question doesn't
       *  cost a second round trip before the shopper sees anything. */
      missing: {
        type: "string",
        enum: ["category", "budget", "occasion", "size", "scope"],
        description: "For ask_info only: the single thing that must be known before acting.",
      },
    },
    required: ["mode"],
  },
};

/**
 * Assembled per call rather than once at import, so that editing `routing.md` or any mode's
 * description takes effect on the next turn in development. In production `loadSkill` caches,
 * making this a map lookup and a string join.
 */
function routerSystemPrompt(): string {
  return renderSkill(loadSkill("persona/skills/routing.md").body, { modes: describeSkillsForRouter() });
}

export interface RouteInput {
  query: string;
  recentTurns: ConversationTurn[];
  anchor: AnchorState | null;
  bundle: BundleState | null;
  apiKey: string;
  meter?: SessionMeter;
}

export interface RouteResult {
  mode: RetrievalMode;
  missing?: "category" | "budget" | "occasion" | "size" | "scope";
}

/**
 * Picks the mode for one turn.
 *
 * The single highest-leverage call in the system — every mode below it depends on being
 * reached — so the output is a hard enum rather than free text, and the anchor and recent
 * turns are always in scope so follow-ups and pronouns resolve to the right mode.
 */
export async function routeRequest(input: RouteInput): Promise<RouteResult> {
  const conversation = input.recentTurns
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  const context = [
    input.anchor
      ? `Currently selected item: "${input.anchor.title}" (${input.anchor.subcategory ?? input.anchor.category ?? "uncategorised"}${input.anchor.brand ? `, ${input.anchor.brand}` : ""}).`
      : "No item is currently selected.",
    input.bundle
      ? `A bundle is in progress. Scope: ${input.bundle.scope.join(", ") || "unspecified"}. Already chosen: ${Object.keys(input.bundle.locked).join(", ") || "nothing yet"}.`
      : "",
    // Stated as its own line because it decides a routing question the scope line can't: with an
    // outfit already on screen, "different pants" is a scoped swap (cosine) while "another
    // outfit" is a fresh build (bundle), and the pieces in play are what separate them.
    input.bundle?.discussed?.length
      ? `The shopper has pinned one assembled outfit to discuss, made up of: ${input.bundle.discussed
          .map((item) => item.category)
          .join(", ")}. A request to change or replace one of those pieces is cosine, not bundle.`
      : "",
    conversation ? `\nRecent conversation:\n${conversation}` : "",
    `\nCurrent message: ${input.query}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await createChatCompletion(
      input.apiKey,
      [
        { role: "system", content: routerSystemPrompt() },
        { role: "user", content: context },
      ],
      {
        tools: [routeTool],
        toolChoice: { type: "function", name: "route_request" },
        thinking: "minimal",
        timeoutMs: 12_000,
      }
    );
    addTokenCost(input.meter, response.usage?.inputTokens ?? 0, response.usage?.outputTokens ?? 0);

    const call = response.toolCalls[0];
    if (!call) return { mode: "cosine" };

    const args = JSON.parse(call.function.arguments) as { mode?: unknown; missing?: unknown };
    if (!isRetrievalMode(args.mode)) return { mode: "cosine" };

    return {
      mode: args.mode,
      missing: typeof args.missing === "string" ? (args.missing as RouteResult["missing"]) : undefined,
    };
  } catch (err) {
    console.error("[persona routeRequest]", err);
    // Cosine is the safe default for the same reason it wins ties above: it is a superset of
    // filter, so falling back to it costs an embedding call rather than the shopper's intent.
    return { mode: "cosine" };
  }
}
