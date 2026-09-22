import { createChatCompletion, type ChatCompletionMessage } from "@/lib/ai/gemini-chat";
import { addTokenCost } from "@/lib/billing/session-meter";
import type { BundleSuggestion, ChatMessage, Product } from "@/modules/commerce/types";
import { buildSystemPrompt } from "./prompt";
import { dispatchToolCall, WEARABLE_AGENT_TOOLS } from "./tools";
import type { ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "./types";

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

/** Paced to read like typing without adding real wait. Each word carries its own trailing
 *  whitespace rather than being emitted as a separate piece — splitting them doubled the number
 *  of ticks, so a short reply spent seconds here after every other part of the turn had already
 *  finished. */
const TEXT_STREAM_TICK_MS = 12;

async function* simulateTextStream(text: string): AsyncGenerator<string> {
  for (const piece of text.match(/\S+\s*/g) ?? []) {
    yield piece;
    await new Promise((resolve) => setTimeout(resolve, TEXT_STREAM_TICK_MS));
  }
}

function formatMoney(product: Product): string {
  return `$${product.price}`;
}

/**
 * Builds the grounded attachment facts the model must describe — computed before the final
 * reply is streamed so chat text cannot invent different pairings than the UI cards.
 *
 * Bundles now come from the retrieval engine, which assembled them with a real cross-item
 * styling judgement, rather than from a rule that inferred "this looks like an outfit request"
 * from the shape of the tool calls. Every stylist-validated outfit is kept, not just the
 * strongest one — the client renders them side by side in a horizontally scrollable row rather
 * than hiding all but one behind carousel arrows.
 */
function buildAttachmentPlan(runtime: ToolRuntimeState): {
  bundles: BundleSuggestion[];
  bundleProducts: Product[];
  alternativeIds: string[];
  note: string | undefined;
} {
  const searches = runtime.searchCallsThisTurn.filter((call) => call.products.length > 0);
  const note = searches.find((call) => call.note)?.note;

  const bundles: BundleSuggestion[] = [];
  const bundleProductIds = new Set<string>();

  runtime.bundlesThisTurn.forEach((option, index) => {
    const products = option.externalIds
      .map((id) => runtime.knownProducts.get(id))
      .filter((product): product is Product => Boolean(product));
    // A bundle missing a resolved product is incomplete, not minimal — showing it would look
    // like the agent forgot an item, so it's dropped rather than shown partial. Logged because
    // dropping silently here is indistinguishable downstream from the stylist never proposing
    // anything: both surface as loose product cards, and only one of them is a bug worth
    // chasing. A whole assembled outfit disappearing should never be a silent event.
    if (products.length < 2 || products.length !== option.externalIds.length) {
      const missing = option.externalIds.filter((id) => !runtime.knownProducts.has(id));
      console.warn(
        `[persona attachments] dropped outfit ${index + 1}: ${products.length}/${option.externalIds.length} ` +
          `products resolved, missing ${JSON.stringify(missing)}`
      );
      return;
    }

    for (const product of products) bundleProductIds.add(product.id);

    bundles.push({
      id: `bundle-${Date.now()}-${index}`,
      label: "Complete Look",
      productIds: products.map((product) => product.id),
      items: option.items.map((item) => ({
        productId: item.externalId,
        category: item.category,
        price: item.price ?? runtime.knownProducts.get(item.externalId)?.price ?? 0,
      })),
      rationale: option.rationale,
    });
  });

  const bundleProducts = [...bundleProductIds]
    .map((id) => runtime.knownProducts.get(id))
    .filter((product): product is Product => Boolean(product));

  // A Complete Look bundle and standalone product cards are mutually exclusive — showing both
  // together produced a bundle description in chat plus a second, separate set of cards for
  // the same products.
  const alternativeIds: string[] = [];
  if (bundles.length === 0) {
    const seen = new Set<string>();
    for (const call of searches) {
      for (const product of call.products.slice(0, 4)) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        alternativeIds.push(product.id);
        if (alternativeIds.length >= 8) break;
      }
      if (alternativeIds.length >= 8) break;
    }
  }

  return { bundles, bundleProducts, alternativeIds, note };
}

type AttachmentPlan = ReturnType<typeof buildAttachmentPlan>;

/**
 * Describes the cards the UI is about to render, for the model to write around.
 *
 * Injected into the conversation as soon as the tools that decided those cards have run, rather
 * than used to rewrite a reply the model has already written. The rewrite was a second
 * full-history model call on every turn that showed a product — the single largest avoidable
 * cost in a turn — and it bought nothing the model could not have been told up front.
 *
 * Returns null when this turn will render no cards, which is also the signal not to inject.
 */
function describeAttachments(plan: AttachmentPlan, runtime: ToolRuntimeState): string | null {
  if (plan.bundleProducts.length === 0 && plan.alternativeIds.length === 0) return null;
  return buildAttachmentFacts(plan.bundles, plan.bundleProducts, plan.alternativeIds, runtime, {
    note: plan.note,
  });
}

function buildAttachmentFacts(
  bundles: BundleSuggestion[],
  bundleProducts: Product[],
  alternativeIds: string[],
  runtime: ToolRuntimeState,
  extras: { note?: string }
): string {
  const bundleSections = bundles
    .map((bundle, index) => {
      const lines = bundle.productIds
        .map((id) => runtime.knownProducts.get(id))
        .filter((p): p is Product => !!p)
        .map((p) => `  - ${p.name} (${formatMoney(p)}, id ${p.id})`)
        .join("\n");
      return `Outfit option ${index + 1}:\n${lines}${bundle.rationale ? `\n  Why these work together: ${bundle.rationale}` : ""}`;
    })
    .join("\n\n");

  const altProducts = alternativeIds
    .map((id) => runtime.knownProducts.get(id))
    .filter((p): p is Product => !!p);
  const altLines = altProducts.map((p) => `- ${p.name} (${formatMoney(p)})`).join("\n");

  return [
    "SYSTEM ATTACHMENT FACTS — the UI will render exactly these cards alongside your next reply. Write it to match them.",
    "Rules:",
    "- Do NOT invent extra named bundles, pairings or outfit options that are not listed below.",
    bundles.length > 1
      ? `- ${bundles.length} outfit options are shown side by side in a scrollable row — mention that there are several to compare, without describing every one in full.`
      : bundles.length === 1
        ? "- Describe that ONE look only (those exact items)."
        : "",
    "- You may briefly mention a few alternatives from the alternatives list.",
    "- If an alternative obviously doesn't match what the shopper asked for (e.g. a jacket showing up when they asked for shoes), just leave it out of your reply — never call out or apologize for a mismatched item, silently omit it instead.",
    "- Keep it concise (2-4 sentences).",
    // Said plainly rather than softened. A widened result presented as an exact match is the
    // thing that erodes trust fastest.
    extras.note ? `- You MUST mention this honestly: ${extras.note}` : "",
    bundleProducts.length > 0 ? bundleSections : "No Complete Look bundle cards will be shown.",
    altProducts.length > 0 ? `Alternative product cards:\n${altLines}` : "No alternative product cards.",
  ]
    .filter(Boolean)
    .join("\n");
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
    anchor: context.anchor,
    bundleState: context.bundleState,
    shownProductIds: [...context.shownProductIds],
    bundlesThisTurn: [],
    pendingQuestion: null,
    lastAttributionToken: undefined,
    searchResultCacheThisTurn: new Map(),
  };

  let finalContent: string | null = null;
  /** Facts already in the conversation, so a round that changes nothing about the cards doesn't
   *  repeat the whole block into the prompt. */
  let injectedFacts: string | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const allowTools = round < MAX_TOOL_ROUNDS - 1;

      const { content, toolCalls, usage } = await createChatCompletion(context.geminiApiKey, messages, {
        tools: allowTools ? WEARABLE_AGENT_TOOLS : undefined,
      });
      addTokenCost(context.meter, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);

      if (toolCalls.length === 0) {
        finalContent = content ?? "";
        break;
      }

      messages.push({ role: "assistant", content, tool_calls: toolCalls });

      for (const call of toolCalls) {
        // A carried, not-yet-discussed multi-category bundle means this search_catalog call is
        // crossing the completed intake gate into the expensive retrieve → allocate → style
        // pipeline. Mark that explicitly so the client can show truthful bundle progress.
        const activity =
          call.function.name === "search_catalog" &&
          runtime.bundleState &&
          runtime.bundleState.scope.length > 1 &&
          !runtime.bundleState.discussed
            ? ("bundle" as const)
            : undefined;
        yield { type: "tool", tool: call.function.name, status: "start", ...(activity ? { activity } : {}) };
        const { resultForModel, events } = await dispatchToolCall(call, context, runtime);
        for (const event of events) yield event;
        messages.push({ role: "tool", tool_call_id: call.id, content: resultForModel });
        yield { type: "tool", tool: call.function.name, status: "end", ...(activity ? { activity } : {}) };
      }

      // Every card this turn will show is already decided by the tools that just ran, so the
      // model gets the facts before it writes rather than after.
      const facts = describeAttachments(buildAttachmentPlan(runtime), runtime);
      if (facts && facts !== injectedFacts) {
        messages.push({ role: "user", content: facts });
        injectedFacts = facts;
      }
    }
  } catch (err) {
    console.error("[persona runWearableChatAgent]", err);
    yield { type: "error", message: err instanceof Error ? err.message : "The style assistant hit an error." };
    yield { type: "done" };
    return;
  }

  if (finalContent === null) {
    finalContent = "Sorry, I'm having trouble putting that together right now — could you try rephrasing?";
  }

  const plan = buildAttachmentPlan(runtime);

  for await (const chunk of simulateTextStream(finalContent)) {
    yield { type: "text", delta: chunk };
  }

  if (plan.bundles.length > 0 && plan.bundleProducts.length > 0) {
    yield { type: "bundle", bundles: plan.bundles, products: plan.bundleProducts };
  }

  if (plan.alternativeIds.length > 0) {
    yield {
      type: "product_recommendations",
      productIds: plan.alternativeIds,
      note: plan.note,
    };
  }

  if (runtime.pendingQuestion && runtime.pendingQuestion.quickOptions.length > 0) {
    yield { type: "quick_options", options: runtime.pendingQuestion.quickOptions };
  }

  // The client stores this and sends it back next turn — cross-turn state without server
  // sessions, extending the pattern the intake and outfit already use.
  yield {
    type: "retrieval_state",
    anchorId: runtime.anchor?.externalId ?? null,
    bundleState: runtime.bundleState,
    shownProductIds: runtime.shownProductIds,
  };

  yield { type: "done" };
}
