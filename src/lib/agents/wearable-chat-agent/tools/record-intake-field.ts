import type { ToolDefinition } from "@/lib/ai/openai";
import type { IntakeField, ToolRuntimeState, WearableAgentEvent, WearableChatContext } from "../types";

const VALID_FIELDS: IntakeField[] = ["occasion", "style", "budget"];

export const recordIntakeFieldTool: ToolDefinition = {
  type: "function",
  name: "record_intake_field",
  description: "Records one shopper preference — occasion, style, or budget — as soon as they mention it, without interrupting the conversation.",
  parameters: {
    type: "object",
    properties: {
      field: { type: "string", enum: VALID_FIELDS },
      value: { type: "string", description: "A short label for what the shopper said, e.g. 'Business meeting', 'Smart casual', 'Under $300'." },
    },
    required: ["field", "value"],
  },
};

export async function handleRecordIntakeField(
  args: Record<string, unknown>,
  _context: WearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: WearableAgentEvent[] }> {
  const field = typeof args.field === "string" && (VALID_FIELDS as string[]).includes(args.field) ? (args.field as IntakeField) : null;
  const value = typeof args.value === "string" ? args.value.trim() : "";

  if (!field || !value) {
    return { resultForModel: JSON.stringify({ error: "Invalid field or value." }), events: [] };
  }

  runtime.intake = { ...runtime.intake, [field]: value };

  return {
    resultForModel: JSON.stringify({ success: true }),
    events: [{ type: "intake", intake: runtime.intake }],
  };
}
