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
import { agentModel, callStructured } from "../shared/structured-call";
import { suggestPaths } from "../shared/validate-intent";
import type { AgentContext, AgentEvent, LastSearch } from "../types";
import { buildPersonaPrefix, renderPersonaTurn, type PersonaTurnExtras } from "./prompt";
import { normalizeDecision, PERSONA_SCHEMA, type PersonaDecision } from "./schema";
import { gateOnConfidence, planDecision, type PlannedSearch } from "./validate";

/** Candidates fetched per search; verification drops some, the rest are ranked by ACS. */
const SEARCH_PAGE = 24;
const MAX_SHOWN = 8;

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

function logTurn(ctx: AgentContext, fields: Record<string, string | number | boolean | null>): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[agents persona] store=${ctx.connection?.id ?? "none"} ${parts.join(" ")}`);
}

/**
 * The main shopping agent: one structured decision per turn, then code runs whatever it decided.
 * Every catalog value the model wrote is validated against the store's path config first; one
 * corrective retry is allowed, then the turn answers honestly.
 */
export async function* runPersona(ctx: AgentContext, options: RunPersonaOptions = {}): AsyncGenerator<AgentEvent> {
  yield { type: "agent", agent: "persona" };
  yield { type: "status", stage: "thinking" };

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

  const decide = async (extras: Omit<PersonaTurnExtras, "message" | "referenced" | "onScreen">) => {
    const { value, usage } = await callStructured<Partial<PersonaDecision>>({
      apiKey: ctx.geminiApiKey,
      model,
      prefix,
      cacheName,
      userText: renderPersonaTurn(ctx, { message, referenced, onScreen: shown, ...extras }),
      schema: PERSONA_SCHEMA,
      thinking: "off",
      meter: ctx.meter,
      label: "persona",
    });
    return { decision: normalizeDecision(value), cachedTokens: usage.cachedTokens };
  };

  let { decision, cachedTokens } = await decide({});
  let plan = canSearch
    ? gateOnConfidence(planDecision(ctx.pathConfig!.config, decision), decision.confidence)
    : ({ kind: "reply" } as const);
  let retried = false;

  if (plan.kind === "invalid") {
    retried = true;
    ({ decision, cachedTokens } = await decide({ problems: plan.problems }));
    const second = planDecision(ctx.pathConfig!.config, decision);
    if (second.kind === "invalid") {
      const suggestions = decision.path ? suggestPaths(ctx.pathConfig!.config, decision.path, 4) : [];
      logTurn(ctx, { action: "invalid", problems: second.problems.length, cached: cachedTokens });
      yield* textEvents(
        `I couldn't find that in this store — ${second.problems[0]}.${suggestions.length ? " Want to try one of these instead?" : ""}`
      );
      const options = cleanQuickOptions(suggestions.map(slotLabel));
      if (options.length) yield { type: "quick_options", options };
      yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch: ctx.lastSearch };
      return;
    }
    plan = second;
  }

  // A search action on a store with no usable config degrades to its reply.
  if (!canSearch && decision.action !== "answer" && decision.action !== "ask") {
    decision = { ...decision, reply: "The store's products are still being prepared — please check back in a few minutes." };
  }

  if (plan.kind === "reply") {
    logTurn(ctx, { action: decision.action, cached: cachedTokens, retried });
    yield* textEvents(decision.reply || "How can I help you find something today?");
    const quick = cleanQuickOptions(decision.quick_options);
    if (quick.length) yield { type: "quick_options", options: quick };
    yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch: ctx.lastSearch };
    return;
  }

  yield { type: "status", stage: "searching" };
  const { search } = plan;
  const outcome = await searchCatalog(ctx, search.spec, search.query, SEARCH_PAGE);
  const verified = (await verifyForDisplay(ctx, outcome.candidates.slice(0, MAX_SHOWN * 2), search.spec)).slice(0, MAX_SHOWN);
  logTurn(ctx, {
    action: decision.action,
    path: search.path,
    ...(search.spec.sizes.length ? { sizes: search.spec.sizes.join("|") } : {}),
    results: outcome.candidates.length,
    shown: verified.length,
    cached: cachedTokens,
    retried,
  });

  if (verified.length === 0) {
    yield* emptyResult(ctx, decide, search.spec);
    yield { type: "retrieval_state", shownProductIds: ctx.shownProductIds, lastSearch: toLastSearch(decision, search) };
    return;
  }

  const ids = verified.map((candidate) => candidate.externalId);
  recordShown(ctx, search.query || search.path, outcome.attributionToken, ids);
  yield* textEvents(decision.reply || "Here's what I found.");
  yield { type: "products", products: toProducts(verified) };
  yield { type: "product_recommendations", productIds: ids };
  const quick = cleanQuickOptions(decision.quick_options);
  if (quick.length) yield { type: "quick_options", options: quick };
  yield { type: "retrieval_state", shownProductIds: ids, lastSearch: toLastSearch(decision, search) };
}

type Decide = (
  extras: Omit<PersonaTurnExtras, "message" | "referenced" | "onScreen">
) => Promise<{ decision: PersonaDecision; cachedTokens: number }>;

/** Nothing came back. The model names what to loosen; code never loosens it by itself. */
async function* emptyResult(ctx: AgentContext, decide: Decide, spec: SearchSpec): AsyncGenerator<AgentEvent> {
  const constraints = describeSpec(spec, ctx.pathConfig?.config.currency ?? null);
  if (ctx.session.measurements) constraints.push(describeFit(bodyMeasurements(ctx.session.measurements)));
  try {
    const { decision } = await decide({ empty: { constraints, nearby: nearbyStock(ctx, spec) } });
    yield* textEvents(decision.reply || "Nothing in stock matches all of that right now.");
    const quick = cleanQuickOptions(decision.quick_options);
    if (quick.length) yield { type: "quick_options", options: quick };
  } catch (error) {
    console.warn("[agents persona] empty-result reply failed:", error instanceof Error ? error.message : error);
    yield* textEvents(
      `Nothing in stock matches all of that right now (${constraints.join("; ")}). Loosen one of those and I'll look again.`
    );
    const quick: string[] = [];
    if (spec.priceMax !== null) quick.push("Any price");
    if (spec.brands.length > 0) quick.push("Any brand");
    if (spec.attributes.length > 0) quick.push(`Any ${spec.attributes[0].key}`);
    if (quick.length) yield { type: "quick_options", options: quick };
  }
}
