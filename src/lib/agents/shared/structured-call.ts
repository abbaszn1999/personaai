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

/** `off` is the lowest level the model accepts, `low` a short think, `on` the model's default. */
export type ThinkingMode = "off" | "low" | "on";

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
  thinking?: ThinkingMode;
  timeoutMs?: number;
  meter?: SessionMeter;
  label: string;
  /** Aborts the call when the shopper's connection closes. */
  signal?: AbortSignal;
}

export interface StructuredCallResult<T> {
  value: T;
  usage: GeminiTokenUsage;
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
  // Decided from what this attempt sends, not from the shared set at failure time: concurrent
  // calls all sent MINIMAL before the first rejection taught the set, and each must retry.
  const sentMinimal =
    input.thinking !== "on" && input.thinking !== "low" && !modelsWithoutMinimalThinking.has(input.model);
  try {
    return await send(input, useCache);
  } catch (error) {
    if (!sentMinimal || !isMinimalThinkingUnsupportedError(error)) throw error;
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
        abortSignal: input.signal ? AbortSignal.any([signal, input.signal]) : signal,
        ...(useCache && input.cacheName ? { cachedContent: input.cacheName } : { systemInstruction: input.prefix }),
        responseMimeType: "application/json",
        responseJsonSchema: input.schema,
        ...(input.thinking === "on"
          ? {}
          : {
              thinkingConfig: {
                thinkingLevel: input.thinking === "low" ? ThinkingLevel.LOW : offThinkingLevel(input.model),
              },
            }),
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
  const started = Date.now();
  let explicit = Boolean(input.cacheName);
  let response;
  try {
    response = await generate(input, true);
  } catch (error) {
    if (input.cacheName && isMissingCacheError(error)) {
      forgetPrefixCache(input.cacheName);
      explicit = false;
      response = await generate(input, false);
    } else {
      throw toAgentError(error);
    }
  }

  const usage = readGeminiTokenUsage(response.usageMetadata);
  addTokenCost(input.meter, usage, undefined, input.model);
  console.log(
    `[gemini usage] label=${input.label} model=${input.model} cache=${explicit ? "explicit" : "inline"} ` +
      `prompt=${usage.inputTokens} cached=${usage.cachedTokens} out=${usage.outputTokens} ms=${Date.now() - started}`
  );

  const text = response.text?.trim();
  if (!text) throw new GeminiChatError(`${input.label}: the model returned no content.`);
  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch {
    throw new GeminiChatError(`${input.label}: the model returned invalid JSON.`);
  }
  return { value, usage };
}

const TIMEOUT_STATUS = 504;

/** The call ran out of time, as opposed to being refused. */
export function isStructuredCallTimeout(error: unknown): boolean {
  return error instanceof GeminiChatError && error.status === TIMEOUT_STATUS;
}

/** Gemini was briefly unable to answer (500, 503 "UNAVAILABLE"): the same request sent again
 *  usually goes through. A 429 is deliberately not one — retrying into a quota makes it worse. */
function isTransientFailure(error: unknown): boolean {
  if (!(error instanceof GeminiChatError)) return false;
  return error.status === 500 || error.status === 503 || /UNAVAILABLE|overloaded/i.test(error.message);
}

type Settled<T> = { kind: "value"; value: T } | { kind: "error"; error: unknown } | { kind: "late" };

/**
 * Runs `first`; if it has not answered within `hedgeAfterMs`, or timed out before then, starts
 * `second` and takes whichever answers first. An occasional model call stalls far past its normal
 * few seconds while the same request sent again is answered in normal time, so a second request
 * is the cure for that tail rather than a longer wait. A brief outage (500/503) gets the same
 * second request. Any other failure is thrown as is.
 */
export async function hedged<T>(first: () => Promise<T>, second: () => Promise<T>, hedgeAfterMs: number): Promise<T> {
  const one = first();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const early = await Promise.race<Settled<T>>([
    one.then(
      (value) => ({ kind: "value", value }),
      (error) => ({ kind: "error", error })
    ),
    new Promise<Settled<T>>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "late" }), hedgeAfterMs);
    }),
  ]);
  clearTimeout(timer);
  if (early.kind === "value") return early.value;
  if (early.kind === "error") {
    if (!isStructuredCallTimeout(early.error) && !isTransientFailure(early.error)) throw early.error;
    return second();
  }
  try {
    return await Promise.any([one, second()]);
  } catch (error) {
    throw error instanceof AggregateError ? error.errors[0] : error;
  }
}

function toAgentError(error: unknown): GeminiChatError {
  if (error instanceof GeminiChatError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new GeminiChatError("The request to Gemini timed out.", TIMEOUT_STATUS);
  }
  const message = error instanceof Error ? error.message : "Gemini request failed.";
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(message)) {
    return new GeminiChatError("The shopping assistant is temporarily busy. Please try again in a moment.", 429, true);
  }
  return new GeminiChatError(message, typeof status === "number" ? status : undefined);
}
