import { createTimeoutSignal } from "@/lib/catalog/timeout";

const DEFAULT_MODEL = "gpt-4o-mini";
const RESPONSES_URL = "https://api.openai.com/v1/responses";

export class OpenAiApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "OpenAiApiError";
  }
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Responses API function-tool schema — flat/"internally tagged", unlike Chat Completions'
 *  nested `{ type: "function", function: {...} }` shape. `strict` defaults to `false` (set
 *  centrally below) so existing non-strict-compatible parameter schemas keep working as-is. */
export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

/** Kept identical to the old Chat Completions message union on purpose — every caller
 *  (agent.ts's tool loop, all tool handlers) builds/reads this shape unchanged. The
 *  Responses-specific translation (system -> `instructions`, tool_calls -> `function_call`
 *  items, tool results -> `function_call_output` items) happens only inside this module. */
export type ChatCompletionMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

interface ResponsesOutputContentPart {
  type: string;
  text?: string;
}

interface ResponsesOutputItem {
  type: string;
  role?: string;
  content?: ResponsesOutputContentPart[];
  call_id?: string;
  name?: string;
  arguments?: string;
}

interface ResponsesApiResponse {
  output?: ResponsesOutputItem[];
  error?: { message?: string };
}

interface CreateChatCompletionOpts {
  model?: string;
  tools?: ToolDefinition[];
  /** `{ type: "function", name }` forces that exact tool — used by single-purpose
   *  structured-output calls (e.g. garment classification) that must not fall back to text. */
  toolChoice?: "auto" | "none" | { type: "function"; name: string };
  timeoutMs?: number;
}

export interface CreateChatCompletionResult {
  content: string | null;
  toolCalls: ToolCall[];
}

/** Translates our stable message union into a Responses `input` item array + top-level
 *  `instructions` string. A leading system message becomes `instructions` (Responses has no
 *  `role: "system"` input item); assistant tool-call turns become `function_call` items;
 *  tool-result turns become `function_call_output` items linked by `call_id`. */
function toResponsesInput(messages: ChatCompletionMessage[]): { instructions?: string; input: unknown[] } {
  let instructions: string | undefined;
  const input: unknown[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        instructions = instructions ? `${instructions}\n${msg.content}` : msg.content;
        break;
      case "user":
        input.push({ role: "user", content: msg.content });
        break;
      case "assistant":
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const call of msg.tool_calls) {
            input.push({
              type: "function_call",
              call_id: call.id,
              name: call.function.name,
              arguments: call.function.arguments,
            });
          }
        } else if (msg.content) {
          input.push({ role: "assistant", content: msg.content });
        }
        break;
      case "tool":
        input.push({ type: "function_call_output", call_id: msg.tool_call_id, output: msg.content });
        break;
    }
  }

  return { instructions, input };
}

/** Concatenates every `output_text` content part across all `message` output items — the
 *  raw-REST equivalent of the official SDK's `output_text` convenience getter. */
function extractOutputText(output: ResponsesOutputItem[]): string | null {
  const parts: string[] = [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

function extractToolCalls(output: ResponsesOutputItem[]): ToolCall[] {
  return output
    .filter((item): item is ResponsesOutputItem & { call_id: string; name: string } =>
      item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string"
    )
    .map((item) => ({
      id: item.call_id,
      type: "function" as const,
      function: { name: item.name, arguments: item.arguments ?? "{}" },
    }));
}

function buildRequestBody(
  messages: ChatCompletionMessage[],
  opts?: CreateChatCompletionOpts,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const { instructions, input } = toResponsesInput(messages);

  const body: Record<string, unknown> = {
    model: opts?.model ?? process.env.OPENAI_CHAT_MODEL ?? DEFAULT_MODEL,
    input,
    // Stateless by design — this app resends the full turn history itself on every request
    // and never persists conversations server-side, so there's nothing for OpenAI to retain.
    store: false,
    ...extra,
  };
  if (instructions) body.instructions = instructions;
  if (opts?.tools?.length) {
    body.tools = opts.tools.map((tool) => ({ ...tool, strict: tool.strict ?? false }));
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  return body;
}

/**
 * Non-streamed Responses API call with optional tool/function calling — used for every
 * round of an agent loop except the final answer-only turn (see {@link streamChatCompletion}).
 * Takes the caller's already-decrypted API key as a parameter (BYO — mirrors the
 * Shopify/WordPress credential pattern) and never reads a platform-level OpenAI key.
 */
export async function createChatCompletion(
  apiKey: string,
  messages: ChatCompletionMessage[],
  opts?: CreateChatCompletionOpts
): Promise<CreateChatCompletionResult> {
  if (!apiKey) {
    throw new OpenAiApiError("No OpenAI API key was provided for this account.");
  }

  const { signal, cancel } = createTimeoutSignal(opts?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(messages, opts)),
      signal,
    });

    const data: ResponsesApiResponse | null = await res.json().catch(() => null);

    if (!res.ok || !data) {
      throw new OpenAiApiError(data?.error?.message || `OpenAI request failed (${res.status})`, res.status);
    }

    const output = data.output ?? [];
    return { content: extractOutputText(output), toolCalls: extractToolCalls(output) };
  } catch (err) {
    if (err instanceof OpenAiApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenAiApiError("The request to OpenAI timed out.");
    }
    throw new OpenAiApiError(err instanceof Error ? err.message : "OpenAI request failed.");
  } finally {
    cancel();
  }
}

/** Convenience wrapper over {@link createChatCompletion} for simple, tool-free, string-only
 *  replies — throws if the model returned no text (e.g. because it called a tool instead). */
export async function generateChatCompletion(
  apiKey: string,
  messages: ChatCompletionMessage[],
  opts?: { model?: string }
): Promise<string> {
  const { content } = await createChatCompletion(apiKey, messages, opts);
  if (!content) {
    throw new OpenAiApiError("OpenAI returned an empty response.");
  }
  return content;
}

interface StreamChatCompletionOpts {
  model?: string;
  timeoutMs?: number;
}

interface ResponsesStreamEvent {
  type?: string;
  delta?: string;
  response?: { error?: { message?: string } };
  error?: { message?: string };
}

/**
 * Streamed Responses API call — used only for the final, tool-free turn once the agent
 * loop has resolved every tool call, so the shopper sees tokens arrive as they're generated
 * instead of waiting for the whole reply. Responses streams typed SSE events rather than
 * Chat Completions' plain token deltas — this only consumes `response.output_text.delta` for
 * text and stops at `response.completed`/`error`.
 */
export async function* streamChatCompletion(
  apiKey: string,
  messages: ChatCompletionMessage[],
  opts?: StreamChatCompletionOpts
): AsyncGenerator<string, void, unknown> {
  if (!apiKey) {
    throw new OpenAiApiError("No OpenAI API key was provided for this account.");
  }

  const { signal, cancel } = createTimeoutSignal(opts?.timeoutMs ?? 45_000);
  try {
    const res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(messages, { model: opts?.model }, { stream: true })),
      signal,
    });

    if (!res.ok || !res.body) {
      const data: ResponsesApiResponse | null = await res.json().catch(() => null);
      throw new OpenAiApiError(data?.error?.message || `OpenAI request failed (${res.status})`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          const event: ResponsesStreamEvent = JSON.parse(payload);
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            yield event.delta;
          } else if (event.type === "error" || event.type === "response.failed") {
            throw new OpenAiApiError(event.error?.message || event.response?.error?.message || "OpenAI stream failed.");
          } else if (event.type === "response.completed") {
            return;
          }
        } catch (parseErr) {
          if (parseErr instanceof OpenAiApiError) throw parseErr;
          // SSE keep-alive/comment lines aren't valid JSON — safe to skip.
        }
      }
    }
  } catch (err) {
    if (err instanceof OpenAiApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenAiApiError("The request to OpenAI timed out.");
    }
    throw new OpenAiApiError(err instanceof Error ? err.message : "OpenAI request failed.");
  } finally {
    cancel();
  }
}
