import type { ToolCall, ToolDefinition } from "@/lib/ai/gemini-chat";
import { addToCartTool, handleAddToCart } from "./add-to-cart";
import { recordIntakeFieldTool, handleRecordIntakeField } from "./record-intake-field";
import { searchCatalogTool, handleSearchCatalog } from "./search-catalog";
import type { ToolRuntimeState, UnwearableAgentEvent, UnwearableChatContext } from "../types";

export const UNWEARABLE_AGENT_TOOLS: ToolDefinition[] = [
  searchCatalogTool,
  addToCartTool,
  recordIntakeFieldTool,
];

type ToolHandler = (
  args: Record<string, unknown>,
  context: UnwearableChatContext,
  runtime: ToolRuntimeState
) => Promise<{ resultForModel: string; events: UnwearableAgentEvent[] }>;

const HANDLERS: Record<string, ToolHandler> = {
  search_catalog: handleSearchCatalog,
  add_to_cart: handleAddToCart,
  record_intake_field: handleRecordIntakeField,
};

export async function dispatchToolCall(
  call: ToolCall,
  context: UnwearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: UnwearableAgentEvent[] }> {
  const handler = HANDLERS[call.function.name];
  if (!handler) {
    return { resultForModel: JSON.stringify({ error: `Unknown tool: ${call.function.name}` }), events: [] };
  }

  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return { resultForModel: JSON.stringify({ error: "Invalid tool arguments." }), events: [] };
  }

  try {
    return await handler(args, context, runtime);
  } catch (err) {
    console.error(`[unwearable-chat-agent tool ${call.function.name}]`, err);
    return { resultForModel: JSON.stringify({ error: "Tool execution failed." }), events: [] };
  }
}
