import type { ToolDefinition } from "@/lib/ai/gemini-chat";
import type { IntakeField, ToolRuntimeState, UnwearableAgentEvent, UnwearableChatContext } from "../types";

const VALID_FIELDS: IntakeField[] = ["useCase", "budget", "priority"];

export const recordIntakeFieldTool: ToolDefinition = {
  type: "function",
  name: "record_intake_field",
  description:
    "Records one shopper preference — useCase (what they're trying to accomplish), budget, or priority (what matters most: value, quality, a brand) — as soon as they mention it, without interrupting the conversation.",
  parameters: {
    type: "object",
    properties: {
      field: { type: "string", enum: VALID_FIELDS },
      value: { type: "string", description: "A short label for what the shopper said, e.g. 'Home office setup', 'Under $300', 'Best value for money'." },
    },
    required: ["field", "value"],
  },
};

export async function handleRecordIntakeField(
  args: Record<string, unknown>,
  _context: UnwearableChatContext,
  runtime: ToolRuntimeState
): Promise<{ resultForModel: string; events: UnwearableAgentEvent[] }> {
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
