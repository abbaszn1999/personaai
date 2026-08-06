import { createChatCompletion, type ChatCompletionMessage } from "@/lib/ai/openai";
import type { BundleSuggestion, ChatMessage, Product } from "@/modules/shopping-agent/types";
import { buildSystemPrompt } from "./prompt";
import { buildBundleFromSearches } from "./skills/outfit-matching";
import { dispatchToolCall, WEARABLE_AGENT_TOOLS } from "./tools";
import type { SearchCallResult, ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "./types";

/** Tool round-trips + the guaranteed tool-free final round. Generous enough for a multi-
 *  category "complete outfit" request (a few search_catalog calls) without letting a
 *  confused model loop indefinitely. */
const MAX_TOOL_ROUNDS = 5;

function toCompletionMessages(context: WearableChatContext, history: ChatMessage[]): ChatCompletionMessage[] {
  const historyMessages: ChatCompletionMessage[] = history
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  return [{ role: "system", content: buildSystemPrompt(context) }, ...historyMessages];
}

async function* simulateTextStream(text: string): AsyncGenerator<string> {
  const pieces = text.split(/(\s+)/).filter((p) => p.length > 0);
  for (const piece of pieces) {
    yield piece;
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}

function formatMoney(product: Product): string {
  return `$${product.price}`;
}

/** Builds the grounded attachment facts the model must describe — computed before the final
 *  reply is streamed so chat text cannot invent different pairings than the UI cards. */
function buildAttachmentPlan(
  runtime: ToolRuntimeState,
  context: WearableChatContext
): {
  bundle: BundleSuggestion | null;
  bundleProducts: Product[];
  alternativeIds: string[];
  matchType: SearchCallResult["matchType"] | undefined;
} {
  const targetedSearches = runtime.searchCallsThisTurn.filter(
    (call) => call.matchType === "exact" || call.matchType === "partial"
  );
  const allSearches = runtime.searchCallsThisTurn.filter((call) => call.products.length > 0);

  let bundle: BundleSuggestion | null = null;
  let bundleProducts: Product[] = [];

  if (targetedSearches.length >= 2) {
    bundle = buildBundleFromSearches(
      targetedSearches.map((c) => c.products),
      runtime.intake,
      context.profile,
      context.categories,
      context.outfitItems
    );
    if (bundle) {
      bundleProducts = bundle.productIds
        .map((id) => runtime.knownProducts.get(id))
        .filter((p): p is Product => !!p);
    }
  }

  // A Complete Look bundle and standalone product cards are mutually exclusive — showing both
  // together is what caused the reported bug (bundle description in chat plus a second,
  // separate set of product cards for the same search). When a bundle was built, it's the only
  // attachment this turn; alternatives only ever show up when there's no bundle to show instead.
  const searchesForCards = targetedSearches.length > 0 ? targetedSearches : allSearches;
  const alternativeIds: string[] = [];
  if (!bundle) {
    const seen = new Set<string>();
    for (const call of searchesForCards) {
      for (const product of call.products.slice(0, 4)) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        alternativeIds.push(product.id);
        if (alternativeIds.length >= 8) break;
      }
      if (alternativeIds.length >= 8) break;
    }
  }

  const matchType = searchesForCards[0]?.matchType;
  return { bundle, bundleProducts, alternativeIds, matchType };
}

function buildAlignmentPrompt(bundleProducts: Product[], alternativeIds: string[], runtime: ToolRuntimeState): string {
  const bundleLines = bundleProducts.map((p) => `- ${p.name} (${formatMoney(p)}, id ${p.id})`).join("\n");
  const altProducts = alternativeIds
    .map((id) => runtime.knownProducts.get(id))
    .filter((p): p is Product => !!p);
  const altLines = altProducts.map((p) => `- ${p.name} (${formatMoney(p)})`).join("\n");

  return [
    "SYSTEM ATTACHMENT FACTS — the UI will render exactly these cards. Rewrite your reply to match them.",
    "Rules:",
    "- Do NOT invent extra named bundles or pairings that are not listed below.",
    "- If a Complete Look bundle is listed, describe that ONE look only (those exact items).",
    "- You may briefly mention a few alternatives from the alternatives list.",
    "- If an alternative obviously doesn't match what the shopper asked for (e.g. a jacket showing up when they asked for shoes), just leave it out of your reply — never call out or apologize for a mismatched item, silently omit it instead.",
    "- Keep it concise (2-4 sentences).",
    bundleProducts.length > 0
      ? `Complete Look bundle (exactly these ${bundleProducts.length} items):\n${bundleLines}`
      : "No Complete Look bundle card will be shown.",
    altProducts.length > 0 ? `Alternative product cards:\n${altLines}` : "No alternative product cards.",
  ].join("\n");
}

/** Runs one full chat turn: resolves any tool calls the model makes, then yields the final
 *  reply's text incrementally, followed by any structured attachments (products, bundle,
 *  try-on render, etc.) gathered from this turn's tool activity. */
export async function* runWearableChatAgent(
  context: WearableChatContext,
  history: ChatMessage[]
): AsyncGenerator<WearableAgentEvent, void, unknown> {
  const messages = toCompletionMessages(context, history);

  const runtime: ToolRuntimeState = {
    knownProducts: new Map(context.knownProducts.map((p) => [p.id, p])),
    searchCallsThisTurn: [],
    intake: { ...context.intake },
    creditsRemaining: context.creditsRemaining,
    profilePatch: {},
  };

  let finalContent: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const allowTools = round < MAX_TOOL_ROUNDS - 1;

      const { content, toolCalls } = await createChatCompletion(context.openaiApiKey, messages, {
        tools: allowTools ? WEARABLE_AGENT_TOOLS : undefined,
      });

      if (toolCalls.length === 0) {
        finalContent = content ?? "";
        break;
      }

      messages.push({ role: "assistant", content, tool_calls: toolCalls });

      for (const call of toolCalls) {
        yield { type: "tool", tool: call.function.name, status: "start" };
        const { resultForModel, events } = await dispatchToolCall(call, context, runtime);
        for (const event of events) yield event;
        messages.push({ role: "tool", tool_call_id: call.id, content: resultForModel });
        yield { type: "tool", tool: call.function.name, status: "end" };
      }
    }
  } catch (err) {
    console.error("[wearable-chat-agent runWearableChatAgent]", err);
    yield { type: "error", message: err instanceof Error ? err.message : "The style assistant hit an error." };
    yield { type: "done" };
    return;
  }

  if (finalContent === null) {
    finalContent = "Sorry, I'm having trouble putting that together right now — could you try rephrasing?";
  }

  const plan = buildAttachmentPlan(runtime, context);

  // When the UI will show a system-built bundle / product cards, rewrite the closing copy so
  // it cannot invent different pairings than the cards (the bug in the screenshots).
  if (plan.bundleProducts.length > 0 || plan.alternativeIds.length > 0) {
    try {
      const aligned = await createChatCompletion(
        context.openaiApiKey,
        [
          ...messages,
          { role: "assistant", content: finalContent },
          { role: "user", content: buildAlignmentPrompt(plan.bundleProducts, plan.alternativeIds, runtime) },
        ],
        { toolChoice: "none" }
      );
      if (aligned.content?.trim()) {
        finalContent = aligned.content.trim();
      }
    } catch (err) {
      console.error("[wearable-chat-agent alignment rewrite]", err);
      // Fall through with the original finalContent rather than failing the turn.
    }
  }

  for await (const chunk of simulateTextStream(finalContent)) {
    yield { type: "text", delta: chunk };
  }

  if (plan.bundle && plan.bundleProducts.length > 0) {
    yield { type: "bundle", bundle: plan.bundle, products: plan.bundleProducts };
  }

  if (plan.alternativeIds.length > 0) {
    yield {
      type: "product_recommendations",
      productIds: plan.alternativeIds,
      matchType: plan.matchType,
    };
  }

  yield { type: "done" };
}
