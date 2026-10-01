import { ThinkingLevel } from "@google/genai";
import { getGeminiClient } from "@/lib/ai/gemini";
import { GeminiChatError, readGeminiTokenUsage, type GeminiTokenUsage } from "@/lib/ai/gemini-chat";
import { addTokenCost, type SessionMeter } from "@/lib/billing/session-meter";
import { createTimeoutSignal } from "@/lib/catalog/timeout";
import { forgetPrefixCache, resolvePrefixCache } from "@/lib/ai/gemini-cache";

export const DEFAULT_AGENT_MODEL = "gemini-3.6-flash";

export function agentModel(): string {
  return process.env.GEMINI_CHAT_MODEL ?? DEFAULT_AGENT_MODEL;
}

/** The Attribute agent's model: a lighter one when configured, otherwise the chat model. */
export function attributeModel(): string {
  return process.env.GEMINI_ATTRIBUTE_MODEL ?? agentModel();
}

export interface StructuredCallInput {
  apiKey: string;
  model: string;
  /** The fixed system prefix. Sent inline unless `cacheName` names a cache holding it. */
  prefix: string;
  cacheName?: string | null;
  /** For merchant-agnostic prefixes: cache them per model under this name when no `cacheName`
   *  is given. */
  cacheAs?: string;
  /** Everything after the cached boundary for this turn. */
  userText: string;
  schema: Record<string, unknown>;
  thinking?: "off" | "on";
  timeoutMs?: number;
  meter?: SessionMeter;
  label: string;
}

export interface StructuredCallResult<T> {
  value: T;
  usage: GeminiTokenUsage & { cachedTokens: number };
}

function isMissingCacheError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cached ?content|CachedContent/i.test(message) && /not found|expired|invalid|permission/i.test(message);
}

/** Models that reject MINIMAL thinking (gemini-3.8-flash does); "off" runs them at LOW. */
const modelsWithoutMinimalThinking = new Set<string>();

export function isMinimalThinkingUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /thinking level MINIMAL is not supported/i.test(message);
}

function offThinkingLevel(model: string): ThinkingLevel {
  return modelsWithoutMinimalThinking.has(model) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
}

async function generate(input: StructuredCallInput, useCache: boolean) {
  try {
    return await send(input, useCache);
  } catch (error) {
    if (input.thinking === "on" || modelsWithoutMinimalThinking.has(input.model) || !isMinimalThinkingUnsupportedError(error)) {
      throw error;
    }
    modelsWithoutMinimalThinking.add(input.model);
    return send(input, useCache);
  }
}

async function send(input: StructuredCallInput, useCache: boolean) {
  const ai = getGeminiClient(input.apiKey);
  const { signal, cancel } = createTimeoutSignal(input.timeoutMs ?? 25_000);
  try {
    return await ai.models.generateContent({
      model: input.model,
      contents: [{ role: "user", parts: [{ text: input.userText }] }],
      config: {
        abortSignal: signal,
        ...(useCache && input.cacheName ? { cachedContent: input.cacheName } : { systemInstruction: input.prefix }),
        responseMimeType: "application/json",
        responseJsonSchema: input.schema,
        ...(input.thinking === "on" ? {} : { thinkingConfig: { thinkingLevel: offThinkingLevel(input.model) } }),
      },
    });
  } finally {
    cancel();
  }
}

/**
 * One structured-output Gemini call. The response schema is enforced by the API, so a reply is
 * valid JSON of the declared shape or the call fails — never loosely formatted prose.
 */
export async function callStructured<T>(request: StructuredCallInput): Promise<StructuredCallResult<T>> {
  const input =
    request.cacheName || !request.cacheAs
      ? request
      : {
          ...request,
          cacheName: resolvePrefixCache({
            apiKey: request.apiKey,
            model: request.model,
            prefix: request.prefix,
            displayName: request.cacheAs,
          }),
        };
  let response;
  try {
    response = await generate(input, true);
  } catch (error) {
    if (input.cacheName && isMissingCacheError(error)) {
      forgetPrefixCache(input.cacheName);
      response = await generate(input, false);
    } else {
      throw toAgentError(error);
    }
  }

  const usage = readGeminiTokenUsage(response.usageMetadata);
  const cachedTokens = response.usageMetadata?.cachedContentTokenCount ?? 0;
  addTokenCost(input.meter, usage.inputTokens, usage.outputTokens);

  const text = response.text?.trim();
  if (!text) throw new GeminiChatError(`${input.label}: the model returned no content.`);
  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch {
    throw new GeminiChatError(`${input.label}: the model returned invalid JSON.`);
  }
  return { value, usage: { ...usage, cachedTokens } };
}

function toAgentError(error: unknown): GeminiChatError {
  if (error instanceof GeminiChatError) return error;
  if (error instanceof Error && error.name === "AbortError") return new GeminiChatError("The request to Gemini timed out.");
  const message = error instanceof Error ? error.message : "Gemini request failed.";
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(message)) {
    return new GeminiChatError("The shopping assistant is temporarily busy. Please try again in a moment.", 429, true);
  }
  return new GeminiChatError(message, typeof status === "number" ? status : undefined);
}
