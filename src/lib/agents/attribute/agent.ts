import { getProductGroup } from "@/lib/catalog/acs/catalog-reads";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { renderHistory } from "../shared/history";
import { loadSkill } from "../shared/load-skill";
import { renderProductRecord } from "../shared/product-record";
import { STRING_ARRAY } from "../shared/schema";
import { cleanQuickOptions, formatMoney, textEvents } from "../shared/stream";
import { attributeModel, callStructured } from "../shared/structured-call";
import { runPersona } from "../persona/agent";
import type { AgentContext, AgentEvent } from "../types";
import { acceptedOffer, answerFromTemplate, isHandoffRequest, type VariantGroup } from "./templates";

const HISTORY_TURNS = 3;

interface AttributeResponse {
  action: "answer" | "handoff";
  reply: string;
  handoff_message: string;
  quick_options: string[];
}

const ATTRIBUTE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["answer", "handoff"] },
    reply: { type: "string" },
    handoff_message: { type: "string" },
    quick_options: STRING_ARRAY,
  },
  required: ["action", "reply", "handoff_message", "quick_options"],
} as const;

function log(ctx: AgentContext, fields: Record<string, string | number | boolean | null>): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[agents attribute] store=${ctx.connection?.id ?? "none"} ${parts.join(" ")}`);
}

async function loadGroup(ctx: AgentContext, item: CatalogCandidate): Promise<VariantGroup> {
  if (!ctx.connection || !item.productGroupId) return { item, siblings: [] };
  try {
    const members = await getProductGroup(ctx.connection.id, item.productGroupId, ctx.categoryScope);
    const seen = new Set([item.externalId]);
    const siblings = members.filter((member) => {
      if (seen.has(member.externalId)) return false;
      seen.add(member.externalId);
      return true;
    });
    return { item, siblings };
  } catch (error) {
    console.warn("[agents attribute] variant group lookup failed:", error instanceof Error ? error.message : error);
    return { item, siblings: [] };
  }
}

function renderGroup(group: VariantGroup): string {
  if (group.siblings.length === 0) return "no other colourways listed";
  return group.siblings
    .map((sibling) => {
      const colours = sibling.attributes?.color?.join("/") ?? "colour not listed";
      const sizes = sibling.attributes?.size?.join(", ");
      return `- ${sibling.title} · ${colours} · ${formatMoney(sibling.price, sibling.currency)} · ${sibling.inStock ? "in stock" : "out of stock"}${sizes ? ` · sizes ${sizes}` : ""}`;
    })
    .join("\n");
}

function lastAssistant(ctx: AgentContext): string | null {
  for (let index = ctx.history.length - 1; index >= 0; index--) {
    if (ctx.history[index].role === "assistant") return ctx.history[index].content;
  }
  return null;
}

async function* handOff(ctx: AgentContext, item: CatalogCandidate, message: string, reply?: string): AsyncGenerator<AgentEvent> {
  yield { type: "attachment", attachment: null };
  if (reply) yield* textEvents(`${reply.trim()} `);
  yield* runPersona({ ...ctx, attachment: null }, { message, referenced: item });
}

/**
 * Questions about one attached product. Structured questions are answered from the record in
 * code; only open ones reach the model. Anything about other products detaches the item and
 * hands the same message to Persona — the shopper never retypes.
 */
export async function* runAttribute(ctx: AgentContext, productId: string): AsyncGenerator<AgentEvent> {
  yield { type: "agent", agent: "attribute" };
  const item = ctx.products.get(productId);
  if (!item) {
    yield { type: "attachment", attachment: null };
    yield* textEvents("That item isn't available anymore. ");
    yield* runPersona({ ...ctx, attachment: null });
    return;
  }

  const offer = acceptedOffer(ctx.message, lastAssistant(ctx));
  if (offer) {
    log(ctx, { route: "accepted_offer" });
    yield* handOff(ctx, item, offer);
    return;
  }
  if (isHandoffRequest(ctx.message)) {
    log(ctx, { route: "handoff_pattern" });
    yield* handOff(ctx, item, ctx.message);
    return;
  }

  const group = await loadGroup(ctx, item);
  const template = answerFromTemplate(ctx.message, group);
  if (template) {
    log(ctx, { route: "template" });
    yield* textEvents(template.reply);
    const quick = cleanQuickOptions(template.quickOptions);
    if (quick.length) yield { type: "quick_options", options: quick };
    return;
  }

  yield { type: "status", stage: "thinking" };
  const { value } = await callStructured<AttributeResponse>({
    apiKey: ctx.geminiApiKey,
    model: attributeModel(),
    prefix: loadSkill("attribute/skills/attribute.md"),
    cacheAs: "attribute",
    userText: [
      `## PRODUCT\n${renderProductRecord(item, { descriptionChars: 1500 })}\nproduct page: ${item.productUrl ?? "not listed"}`,
      `## VARIANT GROUP\n${renderGroup(group)}`,
      `## CONVERSATION\n${renderHistory(ctx.history, HISTORY_TURNS)}`,
      `## MESSAGE\n${ctx.message}`,
    ].join("\n\n"),
    schema: ATTRIBUTE_SCHEMA,
    thinking: "off",
    timeoutMs: 15_000,
    meter: ctx.meter,
    label: "attribute",
  });
  log(ctx, { route: "model", action: value.action });

  if (value.action === "handoff") {
    yield* handOff(ctx, item, value.handoff_message?.trim() || ctx.message, value.reply);
    return;
  }
  yield* textEvents(value.reply?.trim() || "That detail isn't listed for this product — the product page may have more.");
  const quick = cleanQuickOptions(value.quick_options);
  if (quick.length) yield { type: "quick_options", options: quick };
}
