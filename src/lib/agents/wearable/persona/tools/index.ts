import type { ToolCall, ToolDefinition } from "@/lib/ai/gemini-chat";
import { addToCartTool, handleAddToCart } from "./add-to-cart";
import { recordIntakeFieldTool, handleRecordIntakeField } from "./record-intake-field";
import { searchCatalogTool, handleSearchCatalog } from "./search-catalog";
import { tryOnTool, handleTryOn } from "./try-on";
import { updateMeasurementsTool, handleUpdateMeasurements } from "./update-measurements";
import type { ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "../types";

export const WEARABLE_AGENT_TOOLS: ToolDefinition[] = [
  searchCatalogTool,
  tryOnTool,
  addToCartTool,
  recordIntakeFieldTool,
  updateMeasurementsTool,
];

type ToolHandler = (
  args: Record<string, unknown>,
  context: WearableChatContext,
  runtime: ToolRuntimeState
) => Promise<{ resultForModel: string; events: WearableAgentEvent[] }>;

const HANDLERS: Record<string, ToolHandler> = {
  search_catalog: handleSearchCatalog,
  try_on: handleTryOn,
  add_to_cart: handleAddToCart,
  record_intake_field: handleRecordIntakeField,
  update_measurements: handleUpdateMeasurements,
};

export async function dispatchToolCall(
  call: ToolCall,
  context: WearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: WearableAgentEvent[] }> {
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
    console.error(`[persona tool ${call.function.name}]`, err);
    return { resultForModel: JSON.stringify({ error: "Tool execution failed." }), events: [] };
  }
}
