import { findNode } from "@/lib/catalog/path-config/lookup";
import { renderTiers } from "@/lib/catalog/path-config/render";
import { savePersonaGeminiCache } from "@/lib/db/persona-path-configs";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { describeSpec, type SearchSpec } from "../shared/acs-translator";
import { bodyMeasurements, describeFit } from "../shared/fit";
import { resolvePrefixCache } from "@/lib/ai/gemini-cache";
import { toProducts } from "../shared/hydrate";
import { resolveReferencedItem } from "../shared/referenced-item";
import { recordShown, searchCatalog, verifyForDisplay } from "../shared/search";
import { cleanQuickOptions, textEvents } from "../shared/stream";
import { addTokenCost } from "@/lib/billing/session-meter";
import { agentModel, callStructured, hedged, type ThinkingMode } from "../shared/structured-call";
import { suggestPaths } from "../shared/validate-intent";
import type { AgentContext, AgentEvent, LastSearch } from "../types";
import { buildPersonaPrefix, renderPersonaTurn, type PersonaTurnExtras } from "./prompt";
import { normalizeDecision, PERSONA_SCHEMA, type PersonaDecision } from "./schema";
import { gateOnConfidence, planDecision, type DecisionPlan, type PlannedSearch } from "./validate";

/** Candidates fetched per search; verification drops some, the rest are ranked by ACS. */
const SEARCH_PAGE = 24;
const MAX_SHOWN = 8;
/** The most cards a run of "show me more" keeps on screen, matching what the context hydrates. */
const SHOWN_LIMIT = 24;

/** A decision normally takes a few seconds; one that has not answered by now has stalled. */
const HEDGE_AFTER_MS = 10_000;
const DECISION_TIMEOUT_MS = 30_000;
const HEDGE_TIMEOUT_MS = 20_000;

const CATALOG_UNAVAILABLE =
  "the store's catalog cannot be searched right now: return action \"answer\" and tell the shopper, in their language, that products will be available again shortly";

export interface RunPersonaOptions {
  /** A message handed over by another agent — the shopper never retypes it. */
  message?: string;
  /** The item the message is about, when the handing agent already knows it. */
  referenced?: CatalogCandidate | null;
}

function onScreen(ctx: AgentContext): CatalogCandidate[] {
  return ctx.shownProductIds
    .map((id) => ctx.products.get(id))
    .filter((candidate): candidate is CatalogCandidate => Boolean(candidate));
}

function prefixCache(ctx: AgentContext, prefix: string, model: string): string | null {
  const stored = ctx.pathConfig;
  const connectionId = ctx.connection?.id;
  return resolvePrefixCache({
    apiKey: ctx.geminiApiKey,
    model,
    prefix,
    displayName: `persona:${connectionId ?? "none"}`,
    stored:
      stored?.geminiCacheName && stored.geminiCacheKey && stored.geminiCacheExpiresAt
        ? { name: stored.geminiCacheName, key: stored.geminiCacheKey, expiresAt: stored.geminiCacheExpiresAt }
        : null,
    persist: connectionId && stored ? (entry) => savePersonaGeminiCache(connectionId, entry) : undefined,
  });
}

/** Buttons on the cards and the profile menu. Tapping a quick option only sends its words as a
 *  message, so one named after a button would do nothing the shopper expects. */
const BUTTON_NAMES = /^(complete the look|add profile|ask about this item|try on|add to cart)$/i;

function quickOptions(options: readonly string[]): string[] {
  return cleanQuickOptions(options.filter((option) => !BUTTON_NAMES.test(option.trim())));
}

/** How hard the model thinks before deciding; `off` unless the deployment sets otherwise. */
export function personaThinking(): ThinkingMode {
  const value = process.env.PERSONA_THINKING;
  return value === "low" || value === "on" ? value : "off";
}

function slotLabel(path: string): string {
  const leaf = path.split(" > ").pop() ?? path;
  return leaf.charAt(0).toUpperCase() + leaf.slice(1).replace(/-/g, " ");
}

/** What the store actually has around an empty search — the facts an honest "nothing" needs. */
function nearbyStock(ctx: AgentContext, spec: SearchSpec): string[] {
  const config = ctx.pathConfig?.config;
  if (!config) return [];
  const lines: string[] = [];
  for (const path of spec.paths) {
    const node = findNode(config, path);
    if (!node) continue;
    lines.push(`${node.path}: ${node.inStock} in stock, prices ${renderTiers(node.tiers)}`);
    if (spec.brands.length > 0) {
      lines.push(`${node.path} brands: ${node.brands.slice(0, 10).map((brand) => brand.name).join(", ")}`);
    }
    for (const attribute of spec.attributes) {
      const stocked = node.attributes.find((entry) => entry.key === attribute.key);
      if (stocked?.values) lines.push(`${node.path} ${attribute.key}: ${stocked.values.join(", ")}`);
      else if (stocked?.range) lines.push(`${node.path} ${attribute.key}: ${stocked.range.min}..${stocked.range.max}`);
    }
  }
  return lines;
}

function toLastSearch(decision: PersonaDecision, search: PlannedSearch): LastSearch {
  return {
    action: decision.action === "cosine" ? "cosine" : "filter",
    path: search.path,
    brands: search.spec.brands,
    priceMin: search.spec.priceMin,
    priceMax: search.spec.priceMax,
    attributes: search.spec.attributes.map((attribute) =>
      attribute.kind === "text"
        ? { key: attribute.key, values: attribute.values }
        : { key: attribute.key, values: [`${attribute.min ?? ""}..${attribute.max ?? ""}`] }
    ),
    sizes: search.spec.sizes,
    query: search.query,
  };
}

function searchKey(search: LastSearch): string {
  const sorted = (values: readonly string[]) => [...values].map((value) => value.toLowerCase()).sort();
  return JSON.stringify([
    search.path,
    sorted(search.brands),
    search.priceMin,
    search.priceMax,
    search.attributes.map((attribute) => [attribute.key.toLowerCase(), sorted(attribute.values)]).sort(),
    sorted(search.sizes ?? []),
    search.query.trim().toLowerCase().replace(/\s+/g, " "),
  ]);
}

/** The same search the cards on screen came from: "show me more" or a repeat of it. */
export function isRepeatSearch(last: LastSearch | null, next: LastSearch): boolean {
  return last !== null && searchKey(last) === searchKey(next);
}

function logTurn(ctx: AgentContext, fields: Record<string, string | number | boolean | null>): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[agents persona] store=${ctx.connection?.id ?? "none"} ${parts.join(" ")}`);
}

/** The full decision and the filter it became, for evaluating the agent — off unless asked for. */
function trace(entry: Record<string, unknown>): void {
  if (process.env.PERSONA_TRACE === "1") console.log(`[persona trace] ${JSON.stringify(entry)}`);
}

/**
 * The main shopping agent: one structured decision per turn, then code runs whatever it decided.
 * Every catalog value the model wrote is validated against the store's path config first; one
 * corrective retry is allowed, then the turn answers honestly in the shopper's own words.
 */
export async function* runPersona(ctx: AgentContext, options: RunPersonaOptions = {}): AsyncGenerator<AgentEvent> {
  yield { type: "agent", agent: "persona" };
  yield { type: "status", stage: "thinking" };

  const started = Date.now();
  const message = options.message ?? ctx.message;
  const shown = onScreen(ctx);
  const referenced =
    options.referenced ??
    (ctx.referencedItemId ? ctx.products.get(ctx.referencedItemId) : undefined) ??
    resolveReferencedItem({ message, lastShown: shown });
  const model = agentModel();
  const prefix = buildPersonaPrefix(ctx.pathConfig?.renderedText ?? null, ctx.styleGuide);
  const cacheName = prefixCache(ctx, prefix, model);
  const canSearch = Boolean(ctx.catalogReady && ctx.pathConfig && ctx.connection && ctx.categoryScope.length > 0);
  const thinking = personaThinking();

  const decide: Decide = async (extras) => {
    const userText = renderPersonaTurn(ctx, { message, referenced, onScreen: shown, canSearch, ...extras });
    // Metered by hand below, so a hedge that loses is never billed to the store.
    const call = (cache: string | null, timeoutMs: number) =>
      callStructured<Partial<PersonaDecision>>({
        apiKey: ctx.geminiApiKey,
        model,
        prefix,
        cacheName: cache,
        userText,
        schema: PERSONA_SCHEMA,
        thinking,
        timeoutMs,
        label: "persona",
      });
    const result = await hedged(
      () => call(cacheName, DECISION_TIMEOUT_MS),
      () => {
        console.warn("[agents persona] decision is slow, sending a second request");
        // The cache may have finished creating while the first call ran with the prefix inline.
        return call(prefixCache(ctx, prefix, model), HEDGE_TIMEOUT_MS);
      },
      HEDGE_AFTER_MS
    );
    addTokenCost(ctx.meter, result.usage);
    return { decision: normalizeDecision(result.value), cachedTokens: result.usage.cachedTokens };
  };

  const department = ctx.session.department;
  const planFor = (candidate: PersonaDecision): DecisionPlan => {
    if (candidate.action === "answer" || candidate.action === "ask") return { kind: "reply" };
    if (!canSearch) return { kind: "invalid", problems: [CATALOG_UNAVAILABLE] };
    return planDecision(ctx.pathConfig!.config, candidate, department);
  };

  let { decision, cachedTokens } = await decide({});
  const firstDecision = decision;
  let plan = gateOnConfidence(planFor(decision), decision.confidence);
  let retried = false;
  let firstProblems: string[] = [];

  if (plan.kind === "invalid") {
    retried = true;
    firstProblems = plan.problems;
    ({ decision, cachedTokens } = await decide({ problems: plan.problems }));
    const second = planFor(decision);
    if (second.kind === "invalid") {
      logTurn(ctx, { action: "invalid", problems: second.problems.length, cached: cachedTokens });
      trace({ message, first: firstDecision, firstProblems, second: decision, secondProblems: second.problems, ms: Date.now() - started });
      yield* cannotSearch(ctx, decide, decision, second.problems, canSearch);
      yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch: ctx.lastSearch };
      return;
    }
    plan = second;
  }

  if (plan.kind === "reply") {
    logTurn(ctx, { action: decision.action, cached: cachedTokens, retried });
    trace({ message, first: firstDecision, firstProblems, final: retried ? decision : undefined, ms: Date.now() - started });
    yield* textEvents(decision.reply || "How can I help you find something today?");
    const quick = quickOptions(decision.quick_options);
    if (quick.length) yield { type: "quick_options", options: quick };
    yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch: ctx.lastSearch };
    return;
  }

  yield { type: "status", stage: "searching" };
  const { search } = plan;
  const lastSearch = toLastSearch(decision, search);
  // "Show me more" must never repeat a card, whether or not the model listed every id on screen.
  const repeat = isRepeatSearch(ctx.lastSearch, lastSearch) && ctx.shownProductIds.length > 0;
  const spec: SearchSpec = repeat
    ? { ...search.spec, excludeIds: [...new Set([...search.spec.excludeIds, ...ctx.shownProductIds])] }
    : search.spec;
  const outcome = await searchCatalog(ctx, spec, search.query, SEARCH_PAGE);
  const verified = (await verifyForDisplay(ctx, outcome.candidates.slice(0, MAX_SHOWN * 2), spec)).slice(0, MAX_SHOWN);
  logTurn(ctx, {
    action: decision.action,
    path: search.path,
    ...(spec.sizes.length ? { sizes: spec.sizes.join("|") } : {}),
    results: outcome.candidates.length,
    shown: verified.length,
    cached: cachedTokens,
    retried,
    ...(repeat ? { repeat: true } : {}),
  });
  trace({
    message,
    first: firstDecision,
    firstProblems,
    final: retried ? decision : undefined,
    filter: outcome.filter,
    query: search.query,
    repeat,
    results: outcome.candidates.length,
    shown: verified.length,
    fitSizes: verified.map((candidate) => [candidate.externalId, candidate.fitSizes ?? []]),
    ms: Date.now() - started,
  });

  if (verified.length === 0) {
    yield* emptyResult(ctx, decide, spec, repeat);
    yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch };
    return;
  }

  const ids = verified.map((candidate) => candidate.externalId);
  recordShown(ctx, search.query || search.path, outcome.attributionToken, ids);
  yield* textEvents(decision.reply || "Here's what I found.");
  yield { type: "products", products: toProducts(verified) };
  yield { type: "product_recommendations", productIds: ids };
  const quick = quickOptions(decision.quick_options);
  if (quick.length) yield { type: "quick_options", options: quick };
  // A run of "show me more" keeps the earlier cards in the on-screen list, newest first, so the
  // next "more" excludes them too and ordinals still point at the newest batch.
  const nextShown = repeat ? [...new Set([...ids, ...ctx.shownProductIds])].slice(0, SHOWN_LIMIT) : ids;
  yield { type: "retrieval_state", shownProductIds: nextShown, lastSearch };
}

type Decide = (
  extras: Omit<PersonaTurnExtras, "message" | "referenced" | "onScreen" | "canSearch">
) => Promise<{ decision: PersonaDecision; cachedTokens: number }>;

/**
 * The decision still could not become a search after its corrective retry. The model words the
 * honest answer itself, in the shopper's language; the fixed English line is only for when that
 * call fails or the model insists on searching.
 */
async function* cannotSearch(
  ctx: AgentContext,
  decide: Decide,
  decision: PersonaDecision,
  problems: string[],
  canSearch: boolean
): AsyncGenerator<AgentEvent> {
  const config = ctx.pathConfig?.config;
  const nearby = canSearch && config && decision.path ? suggestPaths(config, decision.path, 4) : [];
  try {
    const { decision: honest } = await decide({ unavailable: { problems, nearby } });
    if ((honest.action === "answer" || honest.action === "ask") && honest.reply) {
      yield* textEvents(honest.reply);
      const quick = quickOptions(honest.quick_options);
      if (quick.length) yield { type: "quick_options", options: quick };
      return;
    }
  } catch (error) {
    console.warn("[agents persona] cannot-search reply failed:", error instanceof Error ? error.message : error);
  }
  if (!canSearch) {
    yield* textEvents("The store's products are still being prepared — please check back in a few minutes.");
    return;
  }
  yield* textEvents(
    `I couldn't find that in this store — ${problems[0]}.${nearby.length ? " Want to try one of these instead?" : ""}`
  );
  const quick = cleanQuickOptions(nearby.map(slotLabel));
  if (quick.length) yield { type: "quick_options", options: quick };
}

/**
 * Nothing came back. The model names what to loosen; code never loosens it by itself. After a
 * "show me more", nothing new means everything matching is already on screen.
 */
async function* emptyResult(ctx: AgentContext, decide: Decide, spec: SearchSpec, exhausted: boolean): AsyncGenerator<AgentEvent> {
  const constraints = describeSpec(spec, ctx.pathConfig?.config.currency ?? null);
  if (ctx.session.measurements) constraints.push(describeFit(bodyMeasurements(ctx.session.measurements)));
  try {
    const { decision } = await decide({ empty: { constraints, nearby: nearbyStock(ctx, spec), exhausted } });
    yield* textEvents(decision.reply || "Nothing in stock matches all of that right now.");
    const quick = quickOptions(decision.quick_options);
    if (quick.length) yield { type: "quick_options", options: quick };
  } catch (error) {
    console.warn("[agents persona] empty-result reply failed:", error instanceof Error ? error.message : error);
    yield* textEvents(
      exhausted
        ? "That's everything the store has for this right now."
        : `Nothing in stock matches all of that right now (${constraints.join("; ")}). Loosen one of those and I'll look again.`
    );
    const quick: string[] = [];
    if (spec.priceMax !== null) quick.push("Any price");
    if (spec.brands.length > 0) quick.push("Any brand");
    if (spec.attributes.length > 0) quick.push(`Any ${spec.attributes[0].key}`);
    if (quick.length) yield { type: "quick_options", options: quick };
  }
}
