/**
 * Drives the three chat agents end to end against a live store, the way the chat client does:
 * a Persona search, "Complete the look" on the first result, a question about an attached item,
 * and a follow-up on an attached look.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/smoke-agents.ts <ownerId> [audience] [first message]
 *
 * SMOKE_ONLY=persona stops after the first turn; SMOKE_ONLY=attribute after the item questions;
 * SMOKE_ONLY=bundle skips the item questions.
 * SMOKE_BUDGET=<n> is the budget for "Complete the look" and the follow-up (default: none).
 * SMOKE_MEASUREMENTS='{"heightCm":180,"chestCm":100,"waistCm":84,"hipsCm":98,"shoeSizeEu":43}'
 * sends onboarding measurements with every turn, so only fitting products come back.
 */
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { dispatchTurn } from "@/lib/agents/dispatch";
import { buildAgentContext } from "@/lib/agents/shared/context";
import type { AgentEvent, LookRecord } from "@/lib/agents/types";
import { isLookRecord } from "@/lib/agents/types";
import type { ChatMessage } from "@/modules/commerce/types";

const [ownerId, audience = "woman", firstMessage = "show me black trousers"] = process.argv.slice(2);
if (!ownerId) {
  console.error("usage: smoke-agents.ts <ownerId> [audience] [first message]");
  process.exit(1);
}

const measurements: unknown = process.env.SMOKE_MEASUREMENTS ? JSON.parse(process.env.SMOKE_MEASUREMENTS) : undefined;
const messages: ChatMessage[] = [];
const titles = new Map<string, string>();
const fits = new Map<string, string[]>();
let retrievalState: { shownProductIds: string[]; lastSearch: unknown } = { shownProductIds: [], lastSearch: null };

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: `${role}-${messages.length}`, role, content, timestamp: new Date().toISOString() };
}

async function turn(label: string, text: string, extra: { attachment?: unknown; trigger?: unknown; budget?: number } = {}) {
  console.log(`\n=== ${label}: "${text}"`);
  messages.push(message("user", text));
  const started = Date.now();
  const context = await buildAgentContext({
    ownerId,
    visitorId: "smoke-test-visitor",
    usageSource: "preview",
    geminiApiKey: getPlatformGeminiApiKey(),
    messages,
    audience,
    measurements,
    budget: extra.budget ?? null,
    retrievalState,
    attachment: extra.attachment,
    trigger: extra.trigger,
  });

  let reply = "";
  const out: { products: string[]; looks: LookRecord[] } = { products: [], looks: [] };
  for await (const event of dispatchTurn(context) as AsyncIterable<AgentEvent>) {
    switch (event.type) {
      case "text":
        reply += event.delta;
        break;
      case "product_recommendations":
        out.products = event.productIds;
        break;
      case "bundle":
        out.looks = event.bundles.filter(isLookRecord);
        for (const product of event.products) {
          titles.set(product.id, product.name);
          if (product.fitSizes) fits.set(product.id, product.fitSizes);
        }
        break;
      case "retrieval_state":
        retrievalState = { shownProductIds: event.shownProductIds, lastSearch: event.lastSearch };
        break;
      case "products":
        for (const product of event.products) {
          titles.set(product.id, product.name);
          if (product.fitSizes) fits.set(product.id, product.fitSizes);
        }
        break;
      default:
        if (event.type !== "done") console.log(`  [${event.type}]`, JSON.stringify(event).slice(0, 240));
    }
  }
  messages.push(message("assistant", reply));
  console.log(`  reply (${Date.now() - started}ms): ${reply}`);
  const fitNote = (id: string) => (measurements ? ` [fits: ${fits.get(id)?.join("/") ?? "NONE"}]` : "");
  for (const id of out.products) console.log(`  product ${id.split("/").pop()} ${titles.get(id) ?? ""}${fitNote(id)}`);
  for (const look of out.looks) {
    console.log(`  look "${look.label}" ${look.id} = ${look.total}`);
    for (const item of look.items) {
      console.log(
        `    ${item.category ?? "?"} ${item.price} ${item.productId.split("/").pop()} ${titles.get(item.productId) ?? ""}${fitNote(item.productId)}`
      );
    }
  }
  return out;
}

async function main() {
  const budget = Number(process.env.SMOKE_BUDGET) > 0 ? Number(process.env.SMOKE_BUDGET) : undefined;
  const search = await turn("persona", firstMessage);
  const anchor = search.products[0];
  if (!anchor) return console.log("\nno products — stopping");
  if (process.env.SMOKE_ONLY === "persona") return;

  if (process.env.SMOKE_ONLY !== "bundle") {
    await turn("attribute", "what colours does it come in?", { attachment: { kind: "item", productId: anchor } });
    await turn("attribute open", "is it breathable enough for summer?", { attachment: { kind: "item", productId: anchor } });
    await turn("attribute handoff", "show me something similar but in black", { attachment: { kind: "item", productId: anchor } });
    if (process.env.SMOKE_ONLY === "attribute") return;
  }
  await turn("bundle ask budget", "Complete the look", { trigger: { type: "complete_look", productId: anchor, askBudget: true }, budget });
  const complete = await turn("bundle", budget ? `My budget is ${budget}` : "No budget limit", {
    trigger: { type: "complete_look", productId: anchor },
    budget,
  });
  const look = complete.looks[0];
  if (look) await turn("bundle follow-up", "cheaper shoes please", { attachment: { kind: "look", look }, budget });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
