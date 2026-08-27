import {
  getCatalogFacets,
  getCatalogProductsByExternalIds,
  type CategoryScope,
} from "@/lib/catalog/acs/catalog-reads";
import { allocateBudget } from "../budget-allocator";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import type {
  BundleState,
  CatalogCandidate,
  CatalogFacets,
  CatalogFilter,
  RetrievalContext,
  RetrievalMode,
  RetrievalResult,
} from "@/lib/retrieval/types";
import { describeAnchorKnowledge, toAnchor } from "./anchor";
import { hydrateLiveFacts, toProducts } from "./hydrate";
import { routeRequest } from "./router";
import { askForMissingInfo } from "./modes/ask";
import {
  assembleBundles,
  buildCandidatePools,
  detectBundleScope,
  poolProducts,
  remainingCategories,
} from "./modes/bundle";
import { resolveBundleSwapTargets } from "./anchor";
import { MAX_RESULTS, type ModeOutcome } from "./modes/mode-outcome";
import { DIRECT_SKILLS } from "./registry";

/**
 * Runs one retrieval request end to end: route, execute the chosen mode, hydrate the
 * finalists, and return.
 *
 * This sits *inside* the `search_catalog` tool rather than replacing the tool layer. The
 * agent's loop, try-on, cart and intake are untouched — a single message carrying two intents
 * still resolves as two tool calls in one round, which is what keeps the router a single
 * strict enum per request instead of something that has to parse compound requests.
 */
export async function runRetrieval(
  connection: StoreConnectionRow,
  context: RetrievalContext
): Promise<RetrievalResult> {
  // Pinning an assembled outfit to talk about it deliberately does *not* lock its categories.
  // The two states answer different questions: `discussed` is "which outfit are we talking
  // about", read by cosine's swap resolution and by the system prompt; `locked` is "which
  // categories of the outfit being built are settled", read by `remainingCategories` to decide
  // what still needs retrieving. Conflating them meant that pinning a three-piece outfit marked
  // all three categories settled, so the next "build me another outfit" found nothing left to
  // fill and dead-ended on "Every category in this bundle is already filled" — a reply that is
  // never useful to someone who just asked for an outfit. Nothing needed the locks: the swap
  // path reads `discussed` directly, and the router is told about the pinned outfit separately.
  const route = await routeRequest({
    query: context.query,
    recentTurns: context.recentTurns,
    anchor: context.anchor,
    bundle: context.bundle,
    apiKey: context.apiKey,
  });
  console.log(
    `[persona route] mode=${route.mode}` +
      (route.mode === "ask_info" ? ` missing=${route.missing ?? "category"}` : "") +
      ` bundle=${context.bundle ? "in_progress" : "none"}`
  );

  if (route.mode === "ask_info") {
    return askForMissingInfo(route.missing, context);
  }

  if (route.mode === "bundle") {
    return runBundleTurn(connection, context);
  }

  // Both remaining branches above returned, so what's left is exactly the set of modes that are
  // a single retrieval call — which is what makes this lookup total rather than defaulting.
  const retrievalContext = await withCatalogFacets(context);
  const startedAt = Date.now();
  const outcome: ModeOutcome = await DIRECT_SKILLS[route.mode].run(retrievalContext);
  logRetrieval(route.mode, retrievalContext, outcome, startedAt);

  if (outcome.candidates.length === 0) {
    return noCandidates(route.mode, retrievalContext, outcome);
  }

  const hydrated = await hydrateLiveFacts(connection, outcome.candidates.slice(0, MAX_RESULTS));

  return {
    mode: route.mode,
    products: toProducts(hydrated),
    note: outcome.note,
    anchor: context.anchor,
    bundleState: context.bundle,
  };
}

/** Load the expensive catalog-wide facet snapshot only once a turn has definitely crossed an
 * intake gate and is about to retrieve products. Context construction intentionally supplies an
 * empty placeholder so question-only turns do not browse up to 2,000 ACS products. */
async function withCatalogFacets(context: RetrievalContext): Promise<RetrievalContext> {
  const facets = await getCatalogFacets(context.connectionId, context.categoryScope);
  return { ...context, facets };
}

/**
 * `excludeExternalIds` grows with every product shown and would swamp the line; its length is
 * the only part worth reading back.
 */
function summariseFilter(filter: CatalogFilter | undefined): string {
  if (!filter) return "n/a";
  const { excludeExternalIds, ...rest } = filter;
  return JSON.stringify({ ...rest, excluded: excludeExternalIds?.length ?? 0 });
}

/**
 * One line per retrieval.
 *
 * There was previously nothing at all between "the router chose cosine" and "the engine got zero
 * candidates", which is how an unreachable catalog spent a day looking like a working one: an
 * empty result set and a healthy one are the same HTTP 200 with the same empty list. The per-rung
 * counts are what separate a filter that was too tight from a scope that holds nothing.
 */
function logRetrieval(mode: RetrievalMode, context: RetrievalContext, outcome: ModeOutcome, startedAt: number): void {
  const rungs = outcome.steps?.map((step) => `${step.relaxed ?? "none"}:${step.count}`).join(",") ?? "n/a";

  console.log(
    `[persona retrieval] mode=${mode} scope=${context.categoryScope.length} ` +
      `candidates=${outcome.candidates.length} rungs=${rungs} ` +
      `elapsed=${Date.now() - startedAt}ms filter=${summariseFilter(outcome.filter)}`
  );
}

/** The per-turn facet read already browses the whole scope, so an empty facet set is free
 *  evidence that the scope holds no products at all — as distinct from holding products none of
 *  which matched this particular query. */
function isScopeEmpty(facets: CatalogFacets): boolean {
  return facets.categories.length === 0 && facets.brands.length === 0 && facets.priceRange === null;
}

/**
 * What to do when a mode finds nothing.
 *
 * Three unrelated failures used to collapse into the same clarifying question, and only the last
 * of them is a question worth asking. Asking a shopper about the occasion when the real problem
 * is that no categories are switched on wastes their turn and hides the fault from whoever has to
 * fix it — so the first two say what actually happened and log it as an error.
 */
function noCandidates(mode: RetrievalMode, context: RetrievalContext, outcome: ModeOutcome): RetrievalResult {
  if (context.categoryScope.length === 0) {
    console.error(`[persona retrieval] no categories selected for connection ${context.connectionId}`);
    return {
      mode,
      products: [],
      note: "No product categories are switched on for this store yet, so there is nothing for me to search.",
    };
  }

  if (isScopeEmpty(context.facets)) {
    console.error(
      `[persona retrieval] connection ${context.connectionId}: scope of ${context.categoryScope.length} ` +
        "categories returned no facets — the catalog is empty or ACS is unreachable"
    );
    return {
      mode,
      products: [],
      note: "I can't reach this store's catalog right now, so I can't point you at anything real yet.",
    };
  }

  // A variant lookup that finds nothing is an answer, not a question. The shopper already named
  // the item and asked what else it comes in — "what's the occasion?" responds to a request they
  // didn't make, and the mode has already tried both grouped siblings and a scoped fallback
  // search, so there is nothing left to widen the way there is for an open-ended miss. Leading
  // with whatever is already known about the anchor (description + attributes) turns the miss
  // into a real answer instead of a dead end, without naming which attribute was actually asked
  // about.
  if (mode === "attribute_variant") {
    const itemName = context.anchor?.title ? ` for "${context.anchor.title}"` : " for this item";
    const known = context.anchor ? describeAnchorKnowledge(context.anchor) : null;
    const note = known
      ? `I couldn't find any other options${itemName} in this store's catalog. Here's what I do know about it: ${known}`
      : `I couldn't find any other options${itemName} in this store's catalog.`;
    return {
      mode,
      products: [],
      note,
      anchor: context.anchor,
      bundleState: context.bundle,
    };
  }

  // The catalog is genuinely there and this query genuinely missed. By now the relaxation ladder
  // has already been walked, so widening further is not the answer — a question is.
  const asked = askForMissingInfo("occasion", context);
  return { ...asked, note: outcome.note };
}

/** Bundle mode's complete-outfit pipeline: gate on categories + total budget, then retrieve all
 * remaining categories, allocate the budget, and ask the stylist for complete outfit options in
 * this same turn. There is deliberately no starting-item or pace state machine. */
async function runBundleTurn(
  connection: StoreConnectionRow,
  context: RetrievalContext
): Promise<RetrievalResult> {
  const scope = context.bundle?.scope.length ? context.bundle.scope : detectBundleScope(context.query);
  const state: BundleState = context.bundle ?? { scope, locked: {} };
  state.scope = scope;

  // Strict intake gate: both categories and a budget are required before any retrieval runs,
  // asked for directly and separately rather than inferred or softened into one combined ask.
  if (scope.length === 0) {
    console.log("[persona bundle] gate=category retrieval=skipped");
    return { ...askForMissingInfo("category", context), bundleState: state };
  }
  if (context.budgetMax === undefined) {
    console.log(`[persona bundle] gate=budget categories=${scope.join(",")} retrieval=skipped`);
    return { ...askForMissingInfo("budget", context), bundleState: state };
  }

  // An explicitly selected item can still be a fixed input to a bundle, but the agent never asks
  // the shopper to choose one. Fresh from-scratch bundles normally have no anchor and retrieve
  // every category together.
  if (context.anchor?.garmentCategory && !(context.anchor.garmentCategory in state.locked)) {
    state.locked = { ...state.locked, [context.anchor.garmentCategory]: context.anchor.externalId };
  }

  const anchorCandidate = context.anchor
    ? (await getCatalogProductsByExternalIds(context.connectionId, [context.anchor.externalId], context.categoryScope))[0] ??
      null
    : null;

  // Falling back to the whole scope when nothing is left to fill: the shopper is asking for an
  // outfit, so an already-complete one means "build me this again", not "there is nothing to do".
  // Answering with no products because the categories were already settled tells them about
  // internal state they never set and can't see.
  const remaining = remainingCategories(state);
  const targets = remaining.length > 0 ? remaining : scope;

  console.log(`[persona bundle] retrieval=starting categories=${targets.join(",")}`);
  const retrievalContext = await withCatalogFacets(context);
  const pools = await buildCandidatePools(retrievalContext, targets);

  const emptyCategories = pools.filter((pool) => pool.candidates.length === 0).map((pool) => pool.category);
  if (pools.length === 0 || emptyCategories.length > 0) {
    const available = poolProducts(
      pools.filter((pool) => pool.candidates.length > 0),
      anchorCandidate
    ).slice(0, MAX_RESULTS);
    const hydrated = await hydrateLiveFacts(connection, available);
    return {
      mode: "bundle",
      products: toProducts(hydrated),
      note:
        emptyCategories.length > 0
          ? `I couldn't build a complete outfit because no matching ${emptyCategories.join(" or ")} were found within these constraints.`
          : "Nothing in the catalog fits the requested outfit categories under these constraints.",
      anchor: context.anchor,
      bundleState: state,
    };
  }

  // Retrieve wide, allocate, then trim: each pool was retrieved against the *total* budget as
  // its ceiling, so on a multi-category outfit every category is still competing for the same
  // headroom. The allocator splits that budget per category before the vision call ever sees
  // the pools, so a $50 coat and a $50 pair of socks stop being treated the same. Passes
  // straight through, untrimmed, when no budget was ever stated.
  const allocated = await allocateBudget({
    pools,
    totalBudget: retrievalContext.budgetMax ?? null,
    styleGuide: retrievalContext.styleGuide,
    query: retrievalContext.query,
    apiKey: retrievalContext.apiKey,
  });

  const bundles = await assembleBundles(retrievalContext, allocated, anchorCandidate);

  if (bundles.length === 0) {
    // Every proposal was rejected — by the store's own combination rules, or because the model
    // returned nothing usable. Showing the narrowed candidates beats showing nothing.
    const fallbackProducts = poolProducts(allocated, anchorCandidate).slice(0, MAX_RESULTS);
    const hydrated = await hydrateLiveFacts(connection, fallbackProducts);
    return {
      mode: "bundle",
      products: toProducts(hydrated),
      note: "Couldn't assemble a full set within the store's rules — here are the strongest individual matches.",
      anchor: context.anchor,
      bundleState: state,
    };
  }

  const shown = poolProducts(allocated, anchorCandidate).filter((candidate) =>
    bundles.some((bundle) => bundle.externalIds.includes(candidate.externalId))
  );
  const hydrated = await hydrateLiveFacts(connection, shown);

  return {
    mode: "bundle",
    products: toProducts(hydrated),
    bundles,
    anchor: context.anchor,
    bundleState: state,
  };
}

/** Re-reads anchor details from the index so the caller doesn't have to carry them client-side. */
export async function rehydrateAnchor(connectionId: string, externalId: string, scope: CategoryScope) {
  const [candidate] = await getCatalogProductsByExternalIds(connectionId, [externalId], scope);
  return candidate ? toAnchor(candidate) : null;
}

/** Rehydrates products the client sent back as ids only. */
export async function rehydrateProducts(
  connectionId: string,
  externalIds: string[],
  scope: CategoryScope
): Promise<CatalogCandidate[]> {
  return getCatalogProductsByExternalIds(connectionId, externalIds, scope);
}
