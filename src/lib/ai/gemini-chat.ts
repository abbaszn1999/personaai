import { FunctionCallingConfigMode, ThinkingLevel, type Content, type FunctionCall, type FunctionDeclaration, type Part, type ToolConfig } from "@google/genai";
import { createTimeoutSignal } from "@/lib/catalog/timeout";
import { getGeminiClient } from "./gemini";

const DEFAULT_MODEL = "gemini-3.6-flash";

/** Marks an id we invented locally because the model returned a `functionCall` without one.
 *  Synthetic ids must never be echoed back to Gemini — only ids it actually issued. */
const LOCAL_ID_PREFIX = "__local:";

export class GeminiChatError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** Free-tier keys pass setup then fail under load, so callers surface this distinctly
     *  instead of reporting a generic agent failure. */
    public isRateLimit = false
  ) {
    super(message);
    this.name = "GeminiChatError";
  }
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /** Gemini 3 returns an opaque reasoning signature on the same `Part` as each function call and
   *  requires it echoed back when that call is replayed in history. Carried through our
   *  provider-neutral shape because dropping it 400s the next turn — see `toGeminiContents`. */
  thoughtSignature?: string;
}

/** Kept structurally identical to the OpenAI module's tool schema so tool definitions move
 *  across unchanged. `parameters` is plain JSON Schema, handed to Gemini as
 *  `parametersJsonSchema` (not `parameters`, which expects its own uppercase `Type` enum). */
export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

/** Identical to the OpenAI module's message union on purpose — agent.ts's tool loop and every
 *  tool handler build and read this shape, so switching providers is an import change. All
 *  Gemini-specific translation (system -> `systemInstruction`, assistant -> `model`, tool
 *  results -> `functionResponse` parts) happens inside this module. */
export type ChatCompletionMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

interface CreateChatCompletionOpts {
  model?: string;
  tools?: ToolDefinition[];
  /** `{ type: "function", name }` forces that exact tool, for structured-output calls that
   *  must not fall back to prose. Maps to `FunctionCallingConfigMode.ANY`. */
  toolChoice?: "auto" | "none" | { type: "function"; name: string };
  timeoutMs?: number;
  /** Gemini 3.x reasons by default and bills those tokens as output. Structured-output calls
   *  (routing, filter building) get nothing from it, so they pass "minimal". */
  thinking?: "minimal" | "default";
}

export interface CreateChatCompletionResult {
  content: string | null;
  toolCalls: ToolCall[];
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isFunctionResponsePart(part: Part): boolean {
  return part.functionResponse !== undefined;
}

/**
 * Translates our stable message union into Gemini `contents` plus a top-level
 * `systemInstruction`.
 *
 * Two invariants matter here and both fail loudly at the API rather than degrading:
 *
 * 1. Every `functionResponse` carries the `id` of the `functionCall` it answers. Gemini 3
 *    issues a unique id per call, and matching by function *name* instead drops responses
 *    whenever one turn calls the same tool more than once — which bundle mode does routinely.
 * 2. A turn must contain exactly as many `functionResponse` parts as `functionCall` parts, so
 *    consecutive tool results are merged into a single `user` content instead of one content
 *    each. Splitting them across separate contents is what produces a 400. A user text message
 *    after that group — the agent loop appends this turn's attachment facts there — closes it,
 *    so the next round's tool results correctly start a content of their own.
 * 3. Every replayed `functionCall` carries back the `thoughtSignature` Gemini issued with it.
 *    The signature lives on the enclosing `Part`, not inside `FunctionCall`, so rebuilding the
 *    part from name/args/id alone silently loses it — and the request fails on the *next* turn
 *    with "Function call is missing a thought_signature", naming a position in history rather
 *    than anything about the current message.
 */
export function toGeminiContents(messages: ChatCompletionMessage[]): {
  systemInstruction?: string;
  contents: Content[];
} {
  let systemInstruction: string | undefined;
  const contents: Content[] = [];
  // Gemini's functionResponse needs the function's name, but our tool messages only carry the
  // call id, so the name is recovered from the assistant turn that requested it.
  const nameByCallId = new Map<string, string>();

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        systemInstruction = systemInstruction ? `${systemInstruction}\n${msg.content}` : msg.content;
        break;

      case "user":
        contents.push({ role: "user", parts: [{ text: msg.content }] });
        break;

      case "assistant": {
        const parts: Part[] = [];
        if (msg.content) parts.push({ text: msg.content });

        for (const call of msg.tool_calls ?? []) {
          nameByCallId.set(call.id, call.function.name);
          const functionCall: FunctionCall = {
            name: call.function.name,
            args: parseArguments(call.function.arguments),
          };
          if (!call.id.startsWith(LOCAL_ID_PREFIX)) functionCall.id = call.id;

          const part: Part = { functionCall };
          if (call.thoughtSignature) part.thoughtSignature = call.thoughtSignature;
          parts.push(part);
        }

        if (parts.length > 0) contents.push({ role: "model", parts });
        break;
      }

      case "tool": {
        const part: Part = {
          functionResponse: {
            name: nameByCallId.get(msg.tool_call_id) ?? "unknown_function",
            response: { output: msg.content },
          },
        };
        if (!msg.tool_call_id.startsWith(LOCAL_ID_PREFIX)) {
          part.functionResponse!.id = msg.tool_call_id;
        }

        const previous = contents[contents.length - 1];
        const previousIsResponseGroup =
          previous?.role === "user" &&
          previous.parts !== undefined &&
          previous.parts.length > 0 &&
          previous.parts.every(isFunctionResponsePart);

        if (previousIsResponseGroup) {
          previous.parts!.push(part);
        } else {
          contents.push({ role: "user", parts: [part] });
        }
        break;
      }
    }
  }

  return { systemInstruction, contents };
}

/**
 * Reads the model's function calls off the raw response parts.
 *
 * Takes parts rather than the SDK's `response.functionCalls` convenience accessor because that
 * accessor returns bare `FunctionCall` objects, and the reasoning signature each call must be
 * replayed with sits on the enclosing `Part` instead — so the accessor cannot express a complete
 * tool call.
 */
export function toToolCalls(parts: Part[]): ToolCall[] {
  const calls: ToolCall[] = [];

  for (const part of parts) {
    const call = part.functionCall;
    if (!call) continue;

    calls.push({
      id: call.id ?? `${LOCAL_ID_PREFIX}${calls.length}`,
      type: "function" as const,
      function: {
        name: call.name ?? "",
        arguments: JSON.stringify(call.args ?? {}),
      },
      ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
    });
  }

  return calls;
}

function toFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }));
}

function toToolConfig(toolChoice: CreateChatCompletionOpts["toolChoice"]): ToolConfig {
  if (toolChoice === "none") {
    return { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } };
  }
  if (toolChoice && toolChoice !== "auto") {
    return {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: [toolChoice.name],
      },
    };
  }
  return { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } };
}

function toChatError(err: unknown): GeminiChatError {
  if (err instanceof GeminiChatError) return err;

  if (err instanceof Error && err.name === "AbortError") {
    return new GeminiChatError("The request to Gemini timed out.");
  }

  const message = err instanceof Error ? err.message : "Gemini request failed.";
  const rawStatus = (err as { status?: unknown } | null)?.status;
  const status = typeof rawStatus === "number" ? rawStatus : undefined;

  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(message)) {
    return new GeminiChatError(
      "The shopping assistant is temporarily busy. Please try again in a moment.",
      status ?? 429,
      true
    );
  }

  return new GeminiChatError(message, status);
}

/**
 * Non-streamed Gemini call with optional tool/function calling — used for every round of the
 * agent loop. Callers pass the platform GEMINI_API_KEY (or a test double).
 */
export async function createChatCompletion(
  apiKey: string,
  messages: ChatCompletionMessage[],
  opts?: CreateChatCompletionOpts
): Promise<CreateChatCompletionResult> {
  if (!apiKey) {
    throw new GeminiChatError("No Gemini API key was provided for this account.");
  }

  const ai = getGeminiClient(apiKey);
  const { systemInstruction, contents } = toGeminiContents(messages);
  const { signal, cancel } = createTimeoutSignal(opts?.timeoutMs ?? 20_000);

  try {
    const response = await ai.models.generateContent({
      model: opts?.model ?? process.env.GEMINI_CHAT_MODEL ?? DEFAULT_MODEL,
      contents,
      config: {
        abortSignal: signal,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(opts?.tools?.length
          ? {
              tools: [{ functionDeclarations: toFunctionDeclarations(opts.tools) }],
              toolConfig: toToolConfig(opts.toolChoice),
            }
          : {}),
        ...(opts?.thinking === "minimal" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
      },
    });

    return {
      content: response.text ?? null,
      toolCalls: toToolCalls(response.candidates?.[0]?.content?.parts ?? []),
    };
  } catch (err) {
    throw toChatError(err);
  } finally {
    cancel();
  }
}
