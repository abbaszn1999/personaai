/**
 * Runs many simulated shoppers against the Persona agent at once and reports turn times and errors,
 * to find the first limit (Gemini quota, ACS quota, the merchant store's API, the server) before
 * real traffic does.
 *
 *   In process, against a store's live catalog (no HTTP; tests Gemini, ACS and the store API):
 *     pnpm dlx tsx --env-file=.env.local scripts/load-test-chat.ts <ownerId>
 *
 *   Over HTTP, against a deployed chat endpoint (tests the whole stack, rate limits included):
 *     LOAD_BASE_URL=https://… LOAD_EMBED_TOKEN=… LOAD_SHOPPER_TOKEN=… pnpm dlx tsx scripts/load-test-chat.ts
 *
 * LOAD_SHOPPERS (default 20) conversations run at once; each sends LOAD_TURNS (default 3) messages.
 * Every turn is a paid model call and a catalog search: start small and raise it step by step.
 *
 * In process, every turn also carries the meter a real turn is charged from, and every request this
 * process sends to Google is priced a second time from Google's own answers: each reply's token
 * counts, each cache's create and expire times, each search attempt. The run fails when Google's
 * side comes to more than the meters: that is money Google bills that no store was charged for.
 */
import type { SessionMeter } from "@/lib/billing/session-meter";
import type { AgentEvent } from "@/lib/agents/types";
import type { ChatMessage } from "@/modules/commerce/types";

const SHOPPERS = Number(process.env.LOAD_SHOPPERS) || 20;
const TURNS = Number(process.env.LOAD_TURNS) || 3;
const MEASUREMENTS = { heightCm: 178, chestCm: 100, waistCm: 86, hipsCm: 100, shoeSizeEu: 43 };
const SCRIPTS = [
  ["show me polo shirts", "cheaper", "in navy"],
  ["عايز تيشيرت أبيض", "أرخص شوية", "وريني كمان"],
  ["a shirt for the office", "with short sleeves", "show me more"],
  ["Tom Tailor jeans", "in black", "any brand"],
  ["jackets", "the cheapest ones", "is the first one waterproof?"],
];

/** Google's published Standard-tier prices for Gemini 3.x Flash through 2026, nano-dollars per token,
 *  typed in from the pricing page rather than imported, so a wrong price in the app shows up here. */
const GOOGLE = { input: 750, output: 3_750, cachedInput: 75, storagePerTokenHour: 500, search: 2_500_000 };
const FLASH = /^gemini-3(?:\.\d+)?-flash/i;

/** What Google will bill for the requests this process sent, from its own responses. */
const ledger = {
  geminiCalls: 0,
  geminiNanos: 0,
  /** Sent and never answered (timed out, aborted): Google may have run them, and no usage came back. */
  geminiDropped: 0,
  geminiRejected: 0,
  geminiWithoutUsage: 0,
  models: new Map<string, number>(),
  cacheCreates: 0,
  cacheExtends: 0,
  cacheNanos: 0,
  searchesAnswered: 0,
  searchesDropped: 0,
  searchesRejected: 0,
  systemSearches: 0,
};
const recording: Promise<void>[] = [];
const cacheExpiry = new Map<string, number>();

function parse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return parse(await response.text());
  } catch {
    return null;
  }
}

async function recordGoogle(url: string, method: string, body: string, response: Response | null): Promise<void> {
  if (url.includes("retail.googleapis.com")) {
    if (!url.includes(":search")) return;
    if (String(parse(body)?.visitorId ?? "").startsWith("system:")) ledger.systemSearches += 1;
    else if (!response) ledger.searchesDropped += 1;
    else if (response.ok) ledger.searchesAnswered += 1;
    else ledger.searchesRejected += 1;
    return;
  }

  if (url.includes(":generateContent")) {
    if (!response) {
      ledger.geminiDropped += 1;
      return;
    }
    if (!response.ok) {
      ledger.geminiRejected += 1;
      return;
    }
    const json = await readJson(response);
    const usage = json?.usageMetadata as Record<string, number | undefined> | undefined;
    if (!usage) {
      ledger.geminiWithoutUsage += 1;
      return;
    }
    const model = String(json?.modelVersion ?? url.match(/models\/([^:]+):/)?.[1] ?? "unknown");
    ledger.models.set(model, (ledger.models.get(model) ?? 0) + 1);
    if (!FLASH.test(model)) console.error(`  unpriced model in the ledger: ${model}`);
    const prompt = usage.promptTokenCount ?? 0;
    const cached = Math.min(usage.cachedContentTokenCount ?? 0, prompt);
    const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
    ledger.geminiCalls += 1;
    ledger.geminiNanos += (prompt - cached) * GOOGLE.input + cached * GOOGLE.cachedInput + output * GOOGLE.output;
    return;
  }

  if (url.includes("/cachedContents") && (method === "POST" || method === "PATCH")) {
    if (!response?.ok) return;
    const json = await readJson(response);
    const name = String(json?.name ?? "");
    const tokens = Number((json?.usageMetadata as { totalTokenCount?: number } | undefined)?.totalTokenCount ?? 0);
    const expires = Date.parse(String(json?.expireTime ?? ""));
    const storage = (ms: number) => Math.ceil((tokens * GOOGLE.storagePerTokenHour * Math.max(ms, 0)) / 3_600_000);
    if (method === "POST") {
      ledger.cacheCreates += 1;
      ledger.cacheNanos += tokens * GOOGLE.input + storage(expires - Date.parse(String(json?.createTime ?? "")));
    } else {
      const previous = cacheExpiry.get(name) ?? Date.parse(String(json?.updateTime ?? ""));
      ledger.cacheExtends += 1;
      ledger.cacheNanos += storage(expires - previous);
    }
    cacheExpiry.set(name, expires);
  }
}

/** Sees every request to Google before the app's own code does anything with the answer. */
function installLedger(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("generativelanguage.googleapis.com") && !url.includes("retail.googleapis.com")) {
      return realFetch(input, init);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    try {
      const response = await realFetch(input, init);
      recording.push(recordGoogle(url, method, body, response.clone()));
      return response;
    } catch (error) {
      recording.push(recordGoogle(url, method, body, null));
      throw error;
    }
  };
}

interface TurnResult {
  ms: number;
  ok: boolean;
  error?: string;
  products: number;
}

type RetrievalState = { shownProductIds: string[]; lastSearch: unknown };

const meters: SessionMeter[] = [];

async function turnInProcess(ownerId: string, shopper: number, messages: ChatMessage[], state: RetrievalState) {
  const [{ getPlatformGeminiApiKey }, { dispatchTurn }, { buildAgentContext }, { createSessionMeter }] = await Promise.all([
    import("@/lib/ai/gemini"),
    import("@/lib/agents/dispatch"),
    import("@/lib/agents/shared/context"),
    import("@/lib/billing/session-meter"),
  ]);
  const meter = createSessionMeter();
  meters.push(meter);
  const context = await buildAgentContext({
    ownerId,
    visitorId: `load-${shopper}`,
    usageSource: "preview",
    geminiApiKey: getPlatformGeminiApiKey(),
    meter,
    messages,
    audience: "man",
    measurements: MEASUREMENTS,
    retrievalState: state,
  });
  const stored = context.pathConfig;
  if (stored?.geminiCacheName && stored.geminiCacheExpiresAt && !cacheExpiry.has(stored.geminiCacheName)) {
    cacheExpiry.set(stored.geminiCacheName, Date.parse(stored.geminiCacheExpiresAt));
  }
  let reply = "";
  let products = 0;
  let error: string | undefined;
  for await (const event of dispatchTurn(context) as AsyncIterable<AgentEvent>) {
    if (event.type === "text") reply += event.delta;
    else if (event.type === "products") products = event.products.length;
    else if (event.type === "error") error = event.message;
    else if (event.type === "retrieval_state") {
      state.shownProductIds = event.shownProductIds;
      state.lastSearch = event.lastSearch;
    }
  }
  return { reply, products, error };
}

async function turnOverHttp(shopper: number, messages: ChatMessage[], state: RetrievalState) {
  const response = await fetch(`${process.env.LOAD_BASE_URL}/api/embed/wearable`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LOAD_SHOPPER_TOKEN}` },
    body: JSON.stringify({
      embedToken: process.env.LOAD_EMBED_TOKEN,
      sessionId: `load-${shopper}`,
      messages,
      audience: "man",
      measurements: MEASUREMENTS,
      retrievalState: state,
    }),
  });
  if (!response.ok || !response.body) return { reply: "", products: 0, error: `HTTP ${response.status}` };
  const text = await response.text();
  let reply = "";
  let products = 0;
  let error: string | undefined;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const event = JSON.parse(line.slice(5)) as AgentEvent;
    if (event.type === "text") reply += event.delta;
    else if (event.type === "products") products = event.products.length;
    else if (event.type === "error") error = event.message;
    else if (event.type === "retrieval_state") {
      state.shownProductIds = event.shownProductIds;
      state.lastSearch = event.lastSearch;
    }
  }
  return { reply, products, error };
}

async function shopper(index: number, ownerId: string | undefined): Promise<TurnResult[]> {
  const script = SCRIPTS[index % SCRIPTS.length];
  const messages: ChatMessage[] = [];
  const state: RetrievalState = { shownProductIds: [], lastSearch: null };
  const results: TurnResult[] = [];
  for (let turn = 0; turn < Math.min(TURNS, script.length); turn++) {
    messages.push({ id: `load-${index}-u${turn}-${Date.now()}`, role: "user", content: script[turn], timestamp: new Date().toISOString() });
    const started = Date.now();
    try {
      const outcome = ownerId ? await turnInProcess(ownerId, index, messages, state) : await turnOverHttp(index, messages, state);
      results.push({ ms: Date.now() - started, ok: !outcome.error, error: outcome.error, products: outcome.products });
      messages.push({ id: `load-${index}-a${turn}-${Date.now()}`, role: "assistant", content: outcome.reply, timestamp: new Date().toISOString() });
    } catch (error) {
      results.push({ ms: Date.now() - started, ok: false, error: error instanceof Error ? error.message : String(error), products: 0 });
    }
  }
  return results;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

const usd = (nanos: number) => `$${(nanos / 1e9).toFixed(6)}`;

/** Compares what the meters charged with what Google bills; true when no request went uncharged. */
async function reportBilling(): Promise<boolean> {
  const { SESSION_UNIT_NANOS } = await import("@/lib/billing/pricing");
  // Every meter waits for its turn's stragglers exactly as the flush does before it charges.
  await Promise.all(meters.flatMap((meter) => meter.pending));
  for (let settled = 0; settled !== recording.length; ) {
    settled = recording.length;
    await Promise.all(recording);
  }

  const sum = (pick: (meter: SessionMeter) => number) => meters.reduce((total, meter) => total + pick(meter), 0);
  const charged = sum((meter) => meter.nanos);
  const searches = sum((meter) => meter.acsSearches);
  const tokenNanos = sum(
    (meter) =>
      (meter.inputTokens - meter.cachedTokens) * GOOGLE.input + meter.cachedTokens * GOOGLE.cachedInput + meter.outputTokens * GOOGLE.output
  );
  const cacheCharged = charged - tokenNanos - searches * GOOGLE.search;
  const googleSearches = ledger.searchesAnswered + ledger.searchesDropped;
  const billed = ledger.geminiNanos + ledger.cacheNanos + googleSearches * GOOGLE.search;

  console.log("\n=== billing");
  console.log(`models ${[...ledger.models].map(([model, count]) => `${model}×${count}`).join(", ") || "none"}`);
  console.log(`gemini calls   meters ${sum((meter) => meter.geminiCalls)}   google ${ledger.geminiCalls}` +
    `   (dropped ${ledger.geminiDropped}, rejected ${ledger.geminiRejected}, no usage ${ledger.geminiWithoutUsage})`);
  console.log(`gemini tokens  meters ${usd(tokenNanos)}   google ${usd(ledger.geminiNanos)}`);
  console.log(`caches         meters ${usd(cacheCharged)}   google ${usd(ledger.cacheNanos)}` +
    `   (${ledger.cacheCreates} created, ${ledger.cacheExtends} extended)`);
  console.log(`searches       meters ${searches}   google ${googleSearches}` +
    `   (answered ${ledger.searchesAnswered}, dropped ${ledger.searchesDropped}, rejected ${ledger.searchesRejected}, system ${ledger.systemSearches})`);
  console.log(`total          meters ${usd(charged)} (${charged} nanos)   google ${usd(billed)} (${billed} nanos)`);
  console.log(`units          ${Math.floor(charged / SESSION_UNIT_NANOS)} burned, ${charged % SESSION_UNIT_NANOS} nanos carried`);

  const uncharged = billed - charged;
  if (ledger.geminiCalls === 0) console.error("FAIL: the ledger saw no Gemini calls, so it was not watching them");
  else if (uncharged > 0) console.error(`FAIL: Google bills ${uncharged} nanos (${usd(uncharged)}) more than the meters charged`);
  else console.log(`PASS: nothing Google bills went uncharged (meters ahead by ${-uncharged} nanos)`);
  if (ledger.geminiDropped > 0) console.warn(`note: ${ledger.geminiDropped} Gemini request(s) never answered; Google may bill them and none reported usage`);
  return ledger.geminiCalls > 0 && uncharged <= 0;
}

async function main() {
  const ownerId = process.argv[2];
  if (!ownerId && !(process.env.LOAD_BASE_URL && process.env.LOAD_EMBED_TOKEN && process.env.LOAD_SHOPPER_TOKEN)) {
    throw new Error("usage: load-test-chat.ts <ownerId>, or set LOAD_BASE_URL, LOAD_EMBED_TOKEN and LOAD_SHOPPER_TOKEN");
  }
  if (ownerId) installLedger();
  console.log(`${SHOPPERS} shoppers × ${TURNS} turns, ${ownerId ? "in process" : `over HTTP to ${process.env.LOAD_BASE_URL}`}`);
  const started = Date.now();
  const results = (await Promise.all(Array.from({ length: SHOPPERS }, (_, index) => shopper(index, ownerId)))).flat();
  const elapsed = (Date.now() - started) / 1000;
  const times = results.map((result) => result.ms);
  const failed = results.filter((result) => !result.ok);
  const errors = new Map<string, number>();
  for (const result of failed) errors.set(result.error ?? "unknown", (errors.get(result.error ?? "unknown") ?? 0) + 1);

  console.log(`turns ${results.length} in ${elapsed.toFixed(1)}s (${(results.length / elapsed).toFixed(2)} turns/s)`);
  console.log(`p50 ${percentile(times, 0.5)}ms  p90 ${percentile(times, 0.9)}ms  p99 ${percentile(times, 0.99)}ms  max ${Math.max(...times)}ms`);
  console.log(`failed ${failed.length}`);
  for (const [error, count] of errors) console.log(`  ${count} × ${error}`);
  console.log(`turns with cards ${results.filter((result) => result.products > 0).length}`);

  if (ownerId && !(await reportBilling())) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
