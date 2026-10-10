import { findNode } from "@/lib/catalog/path-config/lookup";
import { renderTiers } from "@/lib/catalog/path-config/render";
import { savePersonaGeminiCache } from "@/lib/db/persona-path-configs";
import { recordPersonaTurn } from "@/lib/db/persona-turn-metrics";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { describeSpec, type SearchSpec } from "../shared/acs-translator";
import { bodyMeasurements, describeFit } from "../shared/fit";
import { resolvePrefixCache } from "@/lib/ai/gemini-cache";
import { toProducts } from "../shared/hydrate";
import { resolveReferencedItem } from "../shared/referenced-item";
import { isDisplayable, recordShown, searchCatalog, verifyForDisplay } from "../shared/search";
import { cleanQuickOptions, textEvents } from "../shared/stream";
import { addTokenCost, trackPendingCost } from "@/lib/billing/session-meter";
import { agentModel, callStructured, hedged, type ThinkingMode } from "../shared/structured-call";
import { suggestPaths } from "../shared/validate-intent";
import type { AgentContext, AgentEvent, LastSearch } from "../types";
import { buildPersonaPrefix, renderPersonaTurn, type PersonaTurnExtras } from "./prompt";
import { normalizeDecision, PERSONA_SCHEMA, type PersonaDecision } from "./schema";
import { gateOnConfidence, mergeRefinement, planDecision, type DecisionPlan, type PlannedSearch } from "./validate";

/** Candidates fetched per search; verification drops some, the rest are ranked by ACS. */
const SEARCH_PAGE = 24;
const MAX_SHOWN = 8;
/** The most cards a run of "show me more" keeps on screen, matching what the context hydrates. */
const SHOWN_LIMIT = 24;

/** A decision normally takes a few seconds; one that has not answered by now has stalled. */
const HEDGE_AFTER_MS = 8_000;
const DECISION_TIMEOUT_MS = 25_000;
const HEDGE_TIMEOUT_MS = 17_000;
/**
 * The whole turn — decision, corrective retry, search and the wording of an empty result — has to
 * finish inside this. A follow-up model call that could not finish in what is left is skipped for a
 * fixed reply in the shopper's language rather than leaving them watching a spinner.
 */
const TURN_BUDGET_MS = 25_000;
const RETRY_NEEDS_MS = 8_000;
const WORDING_NEEDS_MS = 6_000;
/**
 * Backup requests in flight per instance. A backup only helps when one request stalls; when
 * Gemini as a whole is slow, every turn would send one and double the load that is slowing it.
 */
const MAX_CONCURRENT_HEDGES = 16;
let hedgesInFlight = 0;

class TurnBudgetSpent extends Error {}

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
    // The cache holds this store's prefix, so creating and keeping it is this store's cost: it lands
    // on the turn that started it, which waits for the create to finish before charging.
    onCost: (charge) => {
      if (ctx.meter) ctx.meter.nanos += charge.nanos;
    },
    track: (task) => trackPendingCost(ctx.meter, task),
  });
}

/** Buttons on the cards and the profile menu. Tapping a quick option only sends its words as a
 *  message, so one named after a button would do nothing the shopper expects. */
const BUTTON_NAMES = /^(complete the look|add profile|ask about this item|try on|add to cart)$/i;

/** Arabic is always answered in Modern Standard Arabic. A tapped button is sent as the shopper's own
 *  words, so a dialect opener the model let slip is put in standard form, and a button still in
 *  dialect after that is dropped rather than shown. */
const DIALECT_OPENERS: Array<[RegExp, string]> = [
  [/^(?:وريني|ورّيني|ورينى)(?![\p{L}])/u, "أرني"],
  [/^(?:عايز|عايزة|عاوز|عاوزة)(?![\p{L}])/u, "أريد"],
];
const DIALECT_WORD = /(?:^|[^\p{L}])(?:عايز|عايزة|إيه|كده|دلوقتي|عشان|بتاع|وريني|مش|ده|دي|دول|بدي|شو|ليش)(?![\p{L}])/u;

function standardArabic(option: string): string | null {
  let text = option.trim();
  for (const [pattern, standard] of DIALECT_OPENERS) text = text.replace(pattern, standard);
  return DIALECT_WORD.test(text) ? null : text;
}

function quickOptions(options: readonly string[]): string[] {
  return cleanQuickOptions(
    options
      .filter((option) => !BUTTON_NAMES.test(option.trim()))
      .map(standardArabic)
      .filter((option): option is string => option !== null)
  );
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
    ...(search.alsoPaths.length ? { alsoPaths: search.alsoPaths } : {}),
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
    ...(search.spec.excludeBrands?.length ? { excludeBrands: search.spec.excludeBrands } : {}),
    ...(search.spec.excludeAttributes?.length
      ? { excludeAttributes: search.spec.excludeAttributes.map((attribute) => ({ key: attribute.key, values: attribute.values })) }
      : {}),
  };
}

function searchKey(search: LastSearch): string {
  const sorted = (values: readonly string[]) => [...values].map((value) => value.toLowerCase()).sort();
  const constraints = (list: LastSearch["attributes"]) =>
    list.map((attribute) => [attribute.key.toLowerCase(), sorted(attribute.values)]).sort();
  return JSON.stringify([
    search.path,
    sorted(search.alsoPaths ?? []),
    sorted(search.brands),
    sorted(search.excludeBrands ?? []),
    search.priceMin,
    search.priceMax,
    constraints(search.attributes),
    constraints(search.excludeAttributes ?? []),
    sorted(search.sizes ?? []),
    search.query.trim().toLowerCase().replace(/\s+/g, " "),
  ]);
}

type FallbackLanguage = "en" | "ar" | "fr";

const FRENCH_HINT = /\b(je|tu|vous|une?|des|les|pour|avec|moins|cher|chemise|veste|pantalon|bonjour|merci|encore)\b/i;

/** The language of the fixed replies used when no model call can word one. */
function fallbackLanguage(message: string): FallbackLanguage {
  if (/[\u0600-\u06FF]/.test(message)) return "ar";
  return FRENCH_HINT.test(message) ? "fr" : "en";
}

const FALLBACK = {
  en: {
    generic: "How can I help you find something today?",
    found: "Here's what I found.",
    preparing: "The store's products are still being prepared — please check back in a few minutes.",
    notFound: "I couldn't find that in this store. Want to try one of these instead?",
    notFoundPlain: "I couldn't find that in this store — try another category, colour or price.",
    nothing: "Nothing in stock matches all of that right now. Loosen one of those and I'll look again.",
    exhausted: "That's everything the store has for this right now.",
    noSize: "Nothing matching comes in your size right now — try another colour, category or price.",
    anyPrice: "Any price",
    anyBrand: "Any brand",
    anyKey: (key: string) => `Any ${key}`,
  },
  ar: {
    generic: "كيف يمكنني مساعدتك في العثور على ما تبحث عنه اليوم؟",
    found: "إليك ما وجدته.",
    preparing: "ما زالت منتجات المتجر قيد التجهيز — يُرجى المحاولة بعد بضع دقائق.",
    notFound: "لم أجد ذلك في هذا المتجر. هل تودّ تجربة أحد هذه الخيارات؟",
    notFoundPlain: "لم أجد ذلك في هذا المتجر — جرّب قسمًا أو لونًا أو سعرًا آخر.",
    nothing: "لا يتوفر حاليًا ما يطابق كل هذه الشروط. خفّف أحدها وسأبحث مجددًا.",
    exhausted: "هذا كل ما يتوفر في المتجر لهذا الطلب حاليًا.",
    noSize: "لا يتوفر حاليًا ما يطابق طلبك بمقاسك — جرّب لونًا أو قسمًا أو سعرًا آخر.",
    anyPrice: "أي سعر",
    anyBrand: "أي علامة تجارية",
    anyKey: (key: string) => (/colou?r/i.test(key) ? "أي لون" : `أي ${key}`),
  },
  fr: {
    generic: "Comment puis-je vous aider à trouver quelque chose aujourd'hui ?",
    found: "Voici ce que j'ai trouvé.",
    preparing: "Les produits de la boutique sont en cours de préparation — revenez dans quelques minutes.",
    notFound: "Je n'ai pas trouvé cela dans cette boutique. Voulez-vous essayer l'une de ces options ?",
    notFoundPlain: "Je n'ai pas trouvé cela dans cette boutique — essayez une autre catégorie, couleur ou un autre prix.",
    nothing: "Rien en stock ne correspond à tout cela pour le moment. Assouplissez un critère et je cherche à nouveau.",
    exhausted: "C'est tout ce que la boutique propose pour cela en ce moment.",
    noSize: "Rien de correspondant n'est disponible dans votre taille pour le moment — essayez une autre couleur, catégorie ou un autre prix.",
    anyPrice: "Tous les prix",
    anyBrand: "Toutes les marques",
    anyKey: (key: string) => (/colou?r/i.test(key) ? "Toutes les couleurs" : `Tout ${key}`),
  },
} satisfies Record<FallbackLanguage, unknown>;

/** The same search the cards on screen came from: "show me more" or a repeat of it. */
export function isRepeatSearch(last: LastSearch | null, next: LastSearch): boolean {
  return last !== null && searchKey(last) === searchKey(next);
}

function logTurn(ctx: AgentContext, fields: Record<string, string | number | boolean | null>): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[agents persona] store=${ctx.connection?.id ?? "none"} ${parts.join(" ")}`);
}

/** One row per shopper turn for the live quality numbers. Merchant previews and evals are left out
 *  so the numbers describe real shoppers only. */
function measure(
  ctx: AgentContext,
  turn: { action: string; outcome: string; results?: number; shown?: number; retried: boolean; started: number; cachedTokens: number }
): void {
  if (!ctx.connection || ctx.usageSource === "preview") return;
  recordPersonaTurn({
    connectionId: ctx.connection.id,
    action: turn.action,
    outcome: turn.outcome,
    results: turn.results ?? 0,
    shown: turn.shown ?? 0,
    retried: turn.retried,
    ms: Date.now() - turn.started,
    cachedTokens: turn.cachedTokens,
  });
}

/** The full decision and the filter it became, for evaluating the agent — off unless asked for. */
function trace(entry: Record<string, unknown>): void {
  if (process.env.PERSONA_TRACE !== "1") return;
  // A shopper's words never reach production logs, even with tracing switched on there.
  const logged = process.env.NODE_ENV === "production" ? { ...entry, message: "[redacted]" } : entry;
  console.log(`[persona trace] ${JSON.stringify(logged)}`);
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
  const deadline = started + TURN_BUDGET_MS;
  const text = FALLBACK[fallbackLanguage(message)];

  const decide: Decide = async (extras, needsMs = 0) => {
    const left = deadline - Date.now();
    if (left < needsMs) throw new TurnBudgetSpent("not enough of the turn left for another model call");
    const userText = renderPersonaTurn(ctx, { message, referenced, onScreen: shown, canSearch, ...extras });
    // Every request is charged when it settles, the backup that loses the race included: Google
    // bills both, so both reach the store's meter. The route waits for stragglers before charging.
    const call = (cache: string | null, timeoutMs: number) => {
      const request = callStructured<Partial<PersonaDecision>>({
        apiKey: ctx.geminiApiKey,
        model,
        prefix,
        cacheName: cache,
        userText,
        schema: PERSONA_SCHEMA,
        thinking,
        timeoutMs,
        label: "persona",
        signal: ctx.signal,
      });
      trackPendingCost(
        ctx.meter,
        request.then((result) => addTokenCost(ctx.meter, result.usage, undefined, model))
      );
      return request;
    };
    const result = await hedged(
      () => call(cacheName, Math.max(1_000, Math.min(DECISION_TIMEOUT_MS, left))),
      () => {
        const remaining = deadline - Date.now();
        if (hedgesInFlight >= MAX_CONCURRENT_HEDGES || remaining < 2_000) {
          return Promise.reject(new Error("backup request skipped"));
        }
        console.warn("[agents persona] decision is slow, sending a second request");
        hedgesInFlight += 1;
        // The cache may have finished creating while the first call ran with the prefix inline.
        return call(prefixCache(ctx, prefix, model), Math.min(HEDGE_TIMEOUT_MS, remaining)).finally(() => {
          hedgesInFlight -= 1;
        });
      },
      HEDGE_AFTER_MS
    );
    return { decision: normalizeDecision(result.value), cachedTokens: result.usage.cachedTokens };
  };

  const department = ctx.session.department;
  const planFor = (candidate: PersonaDecision): DecisionPlan => {
    if (candidate.action === "answer" || candidate.action === "ask") return { kind: "reply" };
    if (!canSearch) return { kind: "invalid", problems: [CATALOG_UNAVAILABLE] };
    return planDecision(ctx.pathConfig!.config, candidate, department);
  };

  let { decision, cachedTokens } = await decide({});
  decision = mergeRefinement(decision, ctx.lastSearch);
  const firstDecision = decision;
  let plan = gateOnConfidence(planFor(decision), decision.confidence);
  let retried = false;
  let firstProblems: string[] = [];

  if (plan.kind === "invalid") {
    retried = true;
    firstProblems = plan.problems;
    let second: DecisionPlan;
    try {
      ({ decision, cachedTokens } = await decide({ problems: plan.problems }, RETRY_NEEDS_MS));
      decision = mergeRefinement(decision, ctx.lastSearch);
      second = planFor(decision);
    } catch (error) {
      if (!(error instanceof TurnBudgetSpent)) throw error;
      second = plan;
    }
    if (second.kind === "invalid") {
      logTurn(ctx, { action: "invalid", problems: second.problems.length, cached: cachedTokens });
      trace({ message, first: firstDecision, firstProblems, second: decision, secondProblems: second.problems, ms: Date.now() - started });
      yield* cannotSearch(ctx, decide, decision, second.problems, canSearch, text);
      measure(ctx, { action: "invalid", outcome: "invalid", retried, started, cachedTokens });
      yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch: ctx.lastSearch };
      return;
    }
    plan = second;
  }

  if (plan.kind === "reply") {
    logTurn(ctx, { action: decision.action, cached: cachedTokens, retried });
    trace({ message, first: firstDecision, firstProblems, final: retried ? decision : undefined, ms: Date.now() - started });
    yield* textEvents(decision.reply || text.generic);
    const quick = quickOptions(decision.quick_options);
    if (quick.length) yield { type: "quick_options", options: quick };
    measure(ctx, { action: decision.action, outcome: "reply", retried, started, cachedTokens });
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
  // Only cards that can be shown are worth a live check: one without an image or price would take
  // a slot of the few checked and leave the shopper with fewer cards than the search found.
  const showable = outcome.candidates.filter(isDisplayable);
  const verified = (await verifyForDisplay(ctx, showable.slice(0, MAX_SHOWN * 2), spec)).slice(0, MAX_SHOWN);
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

  const results = outcome.candidates.length;
  if (verified.length === 0) {
    const sizeOnly = !repeat && Boolean(ctx.session.measurements) && (await stockedWithoutFit(ctx, spec, search.query));
    yield* emptyResult(ctx, decide, spec, { exhausted: repeat, sizeOnly }, text);
    measure(ctx, {
      action: decision.action,
      outcome: repeat ? "exhausted" : sizeOnly ? "empty_size" : "empty",
      results,
      retried,
      started,
      cachedTokens,
    });
    yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch };
    return;
  }

  const ids = verified.map((candidate) => candidate.externalId);
  recordShown(ctx, search.query || search.path, outcome.attributionToken, ids);
  yield* textEvents(decision.reply || text.found);
  yield { type: "products", products: toProducts(verified) };
  yield { type: "product_recommendations", productIds: ids };
  const quick = quickOptions(decision.quick_options);
  if (quick.length) yield { type: "quick_options", options: quick };
  measure(ctx, { action: decision.action, outcome: "shown", results, shown: verified.length, retried, started, cachedTokens });
  // A run of "show me more" keeps the earlier cards in the on-screen list, newest first, so the
  // next "more" excludes them too and ordinals still point at the newest batch.
  const nextShown = repeat ? [...new Set([...ids, ...ctx.shownProductIds])].slice(0, SHOWN_LIMIT) : ids;
  yield { type: "retrieval_state", shownProductIds: nextShown, lastSearch };
}

type Decide = (
  extras: Omit<PersonaTurnExtras, "message" | "referenced" | "onScreen" | "canSearch">,
  needsMs?: number
) => Promise<{ decision: PersonaDecision; cachedTokens: number }>;

type FallbackText = (typeof FALLBACK)[FallbackLanguage];

/** Whether the same search finds anything once the shopper's fit is left out: if it does, fit is
 *  what emptied it, and the shopper is told so instead of being sent to loosen something else. */
async function stockedWithoutFit(ctx: AgentContext, spec: SearchSpec, query: string): Promise<boolean> {
  try {
    const outcome = await searchCatalog(ctx, spec, query, MAX_SHOWN, { skipFit: true });
    return outcome.candidates.some(isDisplayable);
  } catch (error) {
    console.warn("[agents persona] fit check failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * The decision still could not become a search after its corrective retry. The model words the
 * honest answer itself, in the shopper's language; a fixed line in that language is only for when
 * that call fails, the turn has no time left, or the model insists on searching.
 */
async function* cannotSearch(
  ctx: AgentContext,
  decide: Decide,
  decision: PersonaDecision,
  problems: string[],
  canSearch: boolean,
  text: FallbackText
): AsyncGenerator<AgentEvent> {
  const config = ctx.pathConfig?.config;
  const nearby = canSearch && config && decision.path ? suggestPaths(config, decision.path, 4) : [];
  try {
    const { decision: honest } = await decide({ unavailable: { problems, nearby } }, WORDING_NEEDS_MS);
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
    yield* textEvents(text.preparing);
    return;
  }
  yield* textEvents(nearby.length ? text.notFound : text.notFoundPlain);
  const quick = cleanQuickOptions(nearby.map(slotLabel));
  if (quick.length) yield { type: "quick_options", options: quick };
}

/**
 * Nothing came back. The model names what to loosen; code never loosens it by itself. After a
 * "show me more", nothing new means everything matching is already on screen.
 */
async function* emptyResult(
  ctx: AgentContext,
  decide: Decide,
  spec: SearchSpec,
  state: { exhausted: boolean; sizeOnly: boolean },
  text: FallbackText
): AsyncGenerator<AgentEvent> {
  const constraints = describeSpec(spec, ctx.pathConfig?.config.currency ?? null);
  if (ctx.session.measurements) constraints.push(describeFit(bodyMeasurements(ctx.session.measurements)));
  try {
    const { decision } = await decide(
      { empty: { constraints, nearby: nearbyStock(ctx, spec), exhausted: state.exhausted, sizeOnly: state.sizeOnly } },
      WORDING_NEEDS_MS
    );
    yield* textEvents(decision.reply || (state.sizeOnly ? text.noSize : text.nothing));
    const quick = quickOptions(decision.quick_options);
    if (quick.length) yield { type: "quick_options", options: quick };
  } catch (error) {
    console.warn("[agents persona] empty-result reply failed:", error instanceof Error ? error.message : error);
    yield* textEvents(state.exhausted ? text.exhausted : state.sizeOnly ? text.noSize : text.nothing);
    const quick: string[] = [];
    if (spec.priceMax !== null) quick.push(text.anyPrice);
    if (spec.brands.length > 0) quick.push(text.anyBrand);
    if (spec.attributes.length > 0) quick.push(text.anyKey(spec.attributes[0].key));
    if (quick.length) yield { type: "quick_options", options: quick };
  }
}
