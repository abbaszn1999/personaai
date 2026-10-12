import { createHash } from "node:crypto";
import { findNode, unisexDepartmentFor } from "@/lib/catalog/path-config/lookup";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { parseHardRules } from "../shared/hard-rules";
import { hydrateLiveFacts, toProducts } from "../shared/hydrate";
import { categoryOf, departmentOf, personaPathOf } from "../shared/product-record";
import { searchCatalog } from "../shared/search";
import { formatMoney, textEvents } from "../shared/stream";
import { GeminiChatError } from "@/lib/ai/gemini-chat";
import { addTokenCost, trackPendingCost } from "@/lib/billing/session-meter";
import { agentModel, callStructured, hedged, type StructuredCallInput, type ThinkingMode } from "../shared/structured-call";
import { runPersona } from "../persona/agent";
import type { AgentAttachment, AgentContext, AgentEvent, LookRecord, LookSlot } from "../types";
import { distinctLooks, lookTotal, naiveLook, verifyLook, type ComposedLook, type SlotCandidates } from "./compose";
import { bundleLanguage, bundleMessages } from "./messages";
import {
  MAX_DIRECTIONS,
  fallbackSlotPlan,
  validateLookPlan,
  validateSlotPlan,
  type DirectionPlan,
  type LookDirection,
  type PlanLimits,
  type SlotSearch,
} from "./plan";
import {
  composePrefix,
  anchorPrefix,
  followUpPrefix,
  planPrefix,
  renderAnchorTurn,
  renderComposeTurn,
  renderFollowUpTurn,
  renderPlanTurn,
  renderStore,
  type AnchorTier,
  type BudgetLine,
} from "./prompt";
import {
  ANCHOR_SCHEMA,
  COMPOSE_SCHEMA,
  FOLLOW_UP_SCHEMA,
  PLAN_SCHEMA,
  type AnchorResponse,
  type BundleSlotIntent,
  type ComposeResponse,
  type FollowUpResponse,
  type PlanResponse,
} from "./schema";
import { fallbackCeilings, isOutfitLeaf, premiumFloors, renderSlotsInPlay, slotsInPlay, tierOf, type SlotInPlay } from "./slots";

const SLOT_PAGE = 20;
/** Smaller pages when several looks are searched at once — each slot is searched per look. */
const DIRECTION_SLOT_PAGE = 10;
const MAX_LOOKS = MAX_DIRECTIONS;
/** With a single planned look (a follow-up), compose may still offer a few alternatives. */
const SINGLE_DIRECTION_LOOKS = 3;
/** A slot's soft constraints (premium company, pieces not shown yet) are let go below this many
 *  candidates — the slot then searches without them, the softly preferred ones ranked first. */
const MIN_SOFT_CANDIDATES = 3;
/** Pieces Bundle remembers having shown around one anchor. */
const MAX_SHOWN_PIECES = 60;
const CHEAPER = /\b(cheaper|less expensive|lower[- ]priced|more affordable)\b/i;

function log(ctx: AgentContext, fields: Record<string, string | number | boolean | null>): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[agents bundle] store=${ctx.connection?.id ?? "none"} ${parts.join(" ")}`);
}

function thinkingFrom(value: string | undefined, fallback: ThinkingMode): ThinkingMode {
  return value === "off" || value === "low" || value === "on" ? value : fallback;
}

/** BUNDLE_PLAN_THINKING=off|low|on — the plan call writes every look's searches. */
function planThinking(): ThinkingMode {
  return thinkingFrom(process.env.BUNDLE_PLAN_THINKING, "low");
}

/** BUNDLE_COMPOSE_THINKING=off|low|on — the compose call picks every look's pieces. Low scored
 *  the same as the model's full thinking on the stylist eval, in about half the time. */
function composeThinking(): ThinkingMode {
  return thinkingFrom(process.env.BUNDLE_COMPOSE_THINKING, "low");
}

/** The first call of a turn (what does the message ask for?) answers in a few seconds; one that
 *  has not by now has stalled, and the same request sent again is answered in normal time. */
const DECISION_HEDGE_AFTER_MS = 7_000;
const DECISION_TIMEOUT_MS = 20_000;
/** Backup requests in flight per instance — when Gemini as a whole is slow, a backup for every
 *  turn would double the load that is slowing it. */
const MAX_CONCURRENT_HEDGES = 16;
let hedgesInFlight = 0;

type DecisionRequest = Omit<StructuredCallInput, "apiKey" | "model" | "meter" | "signal" | "timeoutMs">;

async function decide<T>(ctx: AgentContext, request: DecisionRequest): Promise<T> {
  const model = agentModel();
  // Every request is charged when it settles, a backup that loses the race included.
  const call = (timeoutMs: number) => {
    const pending = callStructured<T>({ ...request, apiKey: ctx.geminiApiKey, model, timeoutMs, signal: ctx.signal });
    trackPendingCost(
      ctx.meter,
      pending.then((result) => addTokenCost(ctx.meter, result.usage, undefined, model))
    );
    return pending;
  };
  const result = await hedged(
    () => call(DECISION_TIMEOUT_MS),
    () => {
      if (hedgesInFlight >= MAX_CONCURRENT_HEDGES) return Promise.reject(new Error("backup request skipped"));
      console.warn("[agents bundle] decision is slow, sending a second request");
      hedgesInFlight += 1;
      return call(DECISION_TIMEOUT_MS).finally(() => {
        hedgesInFlight -= 1;
      });
    },
    DECISION_HEDGE_AFTER_MS
  );
  return result.value;
}

/** A decision that could not be had at all — both requests timed out or failed. A quota is not
 *  one: the shopper is told the assistant is busy. */
function decisionFailed(ctx: AgentContext, error: unknown): null {
  if (error instanceof GeminiChatError && error.isRateLimit) throw error;
  if (ctx.signal?.aborted) throw error;
  console.warn("[agents bundle] decision failed:", error instanceof Error ? error.message : error);
  return null;
}

interface KeptPiece {
  slot: string;
  item: CatalogCandidate;
  record: LookSlot | null;
}

interface BuildInput {
  anchor: CatalogCandidate;
  department: string;
  budget: number | null;
  /** The slots to search this time. */
  slots: SlotInPlay[];
  kept: KeptPiece[];
  /** Slot intents the follow-up call already wrote; the plan call runs when absent or invalid. */
  intents?: BundleSlotIntent[];
  /** Everything the shopper has asked of the looks, in their words. */
  request?: string;
  /** The language the reply is written in. */
  language?: string | null;
  /** No budget named and the shopper not told yet — the reply invites one. */
  mentionBudget?: boolean;
  /** Pieces a swap is replacing — never offered back. */
  replacing?: CatalogCandidate[];
  /** Pieces already shown that the shopper wants something other than — avoided while the slot
   *  still has enough else to choose from. */
  avoid?: string[];
  caps?: Map<string, number>;
}

interface BuildOutput {
  looks: LookRecord[];
  products: CatalogCandidate[];
  reply: string;
}

interface SearchedDirection extends LookDirection {
  slots: SlotCandidates[];
}

/** A verified look and the index of the direction it was built from. */
type DirectedLook = ComposedLook & { direction: number };

function lookId(ids: string[]): string {
  return `look-${createHash("sha1").update(ids.join("|")).digest("hex").slice(0, 10)}`;
}

function toLookSlot(search: SlotSearch): LookSlot {
  return {
    slot: search.slot,
    path: search.path,
    priceMax: search.spec.priceMax,
    query: search.query,
    attributes: search.spec.attributes.map((attribute) =>
      attribute.kind === "text"
        ? { key: attribute.key, values: attribute.values }
        : { key: attribute.key, values: [`${attribute.min ?? ""}..${attribute.max ?? ""}`] }
    ),
  };
}

function toLookRecord(
  index: number,
  anchor: CatalogCandidate,
  kept: KeptPiece[],
  look: ComposedLook,
  direction: LookDirection,
  input: { budget: number | null; department: string; request?: string }
): LookRecord {
  const pieces = [anchor, ...kept.map((piece) => piece.item), ...look.picks.map((pick) => pick.item)];
  const ids = pieces.map((piece) => piece.externalId);
  const searches = direction.searches;
  return {
    id: lookId(ids),
    label: direction.theme ? direction.theme.charAt(0).toUpperCase() + direction.theme.slice(1) : `Look ${index + 1}`,
    productIds: ids,
    items: pieces.map((piece) => ({ productId: piece.externalId, category: categoryOf(piece), price: piece.price ?? 0 })),
    rationale: look.reason,
    anchorId: anchor.externalId,
    total: lookTotal(pieces),
    budget: input.budget,
    department: input.department,
    slots: [
      ...kept.map((piece) => piece.record).filter((record): record is LookSlot => record !== null),
      ...searches.filter((search) => look.picks.some((pick) => pick.slot === search.slot)).map(toLookSlot),
    ],
    ...(input.request ? { brief: input.request } : {}),
  };
}

/**
 * Up to five looks on "Complete the look", one on a follow-up. Each look's queries are written
 * together as a chain (every slot matches the anchor and the slots before it), so the searches
 * can all run at once afterwards.
 */
async function planLooks(
  ctx: AgentContext,
  input: BuildInput,
  limits: PlanLimits,
  budgetLine: BudgetLine,
  anchorTier: AnchorTier | null
): Promise<DirectionPlan> {
  const config = ctx.pathConfig!.config;
  const single = input.intents !== undefined;
  if (input.intents?.length) {
    const direct = validateSlotPlan(config, input.slots, input.intents, limits);
    if (direct.ok) return { ok: true, directions: [{ theme: "", searches: direct.searches, skipped: direct.skipped }] };
  }

  const slotsText = renderSlotsInPlay(config, input.slots);
  const looks = single ? 1 : MAX_DIRECTIONS;
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { value } = await callStructured<PlanResponse>({
        apiKey: ctx.geminiApiKey,
        model: agentModel(),
        prefix: planPrefix(),
        cacheAs: "bundle-plan",
        userText: renderPlanTurn({
          anchor: input.anchor,
          anchorTier,
          department: input.department,
          budget: budgetLine,
          store: renderStore(config),
          slotsText,
          looks,
          request: input.request,
          language: input.language,
          styleGuide: ctx.styleGuide,
          problems,
        }),
        schema: PLAN_SCHEMA,
        thinking: planThinking(),
        meter: ctx.meter,
        label: "bundle plan",
        signal: ctx.signal,
      });
      const plan = validateLookPlan(config, input.slots, value.looks ?? [], limits, looks);
      if (plan.ok) return plan;
      problems = plan.problems;
    } catch (error) {
      console.warn("[agents bundle] plan call failed:", error instanceof Error ? error.message : error);
      break;
    }
  }
  const fallback = fallbackSlotPlan(config, input.slots, input.anchor, limits);
  return fallback.ok
    ? { ok: true, directions: [{ theme: "", searches: fallback.searches, skipped: fallback.skipped }] }
    : fallback;
}

async function composeLooks(
  ctx: AgentContext,
  input: BuildInput,
  directions: SearchedDirection[]
): Promise<{ looks: DirectedLook[]; reply: string }> {
  const rules = {
    fixed: [input.anchor, ...input.kept.map((piece) => piece.item)],
    budget: input.budget,
    department: input.department,
    hardRules: parseHardRules(ctx.connection?.hardRules),
  };
  const perDirection = directions.length === 1 ? SINGLE_DIRECTION_LOOKS : 1;
  try {
    const { value } = await callStructured<ComposeResponse>({
      apiKey: ctx.geminiApiKey,
      model: agentModel(),
      prefix: composePrefix(),
      cacheAs: "bundle-compose",
      userText: renderComposeTurn({
        anchor: input.anchor,
        kept: input.kept.map((piece) => piece.item),
        budget: input.budget,
        directions: directions.map((direction) => ({ theme: direction.theme, slots: direction.slots })),
        request: input.request,
        language: input.language,
        replacing: input.replacing,
        styleGuide: ctx.styleGuide,
        sized: ctx.session.measurements !== null,
        mentionBudget: input.mentionBudget === true,
      }),
      schema: COMPOSE_SCHEMA,
      thinking: composeThinking(),
      timeoutMs: 40_000,
      meter: ctx.meter,
      label: "bundle compose",
      signal: ctx.signal,
    });
    const rejected: string[] = [];
    const counts = new Map<number, number>();
    const verified: DirectedLook[] = [];
    for (const look of value.looks ?? []) {
      const index = Math.round(look.look ?? 1) - 1;
      const direction = directions[index];
      if (!direction) {
        rejected.push(`unknown look ${look.look}`);
        continue;
      }
      if ((counts.get(index) ?? 0) >= perDirection) {
        rejected.push(`extra look for ${index + 1}`);
        continue;
      }
      const checked = verifyLook(look, direction.slots, rules, (reason) => rejected.push(`look ${index + 1}: ${reason}`));
      if (!checked) continue;
      counts.set(index, (counts.get(index) ?? 0) + 1);
      verified.push({ ...checked, direction: index });
    }
    const looks = distinctLooks(verified).slice(0, MAX_LOOKS);
    if (rejected.length > 0) log(ctx, { compose_rejected: rejected.join(" | ") });
    if (looks.length > 0) return { looks, reply: (value.reply ?? "").trim() };
    log(ctx, { compose: "no_valid_look", proposed: value.looks?.length ?? 0 });
  } catch (error) {
    console.warn("[agents bundle] compose call failed:", error instanceof Error ? error.message : error);
  }
  const naive = directions
    .map((direction, index) => {
      const look = naiveLook(direction.slots, rules);
      return look ? { ...look, direction: index } : null;
    })
    .filter((look): look is DirectedLook => look !== null);
  return { looks: distinctLooks(naive).slice(0, MAX_LOOKS), reply: "" };
}

/** Live price and stock for every piece about to be shown; a look with a piece that changed
 *  out from under it is dropped. */
async function verifyLive(
  ctx: AgentContext,
  input: BuildInput,
  looks: DirectedLook[],
  directions: SearchedDirection[]
): Promise<DirectedLook[]> {
  if (!ctx.connection || looks.length === 0) return looks;
  const pieces = new Map<string, CatalogCandidate>();
  for (const item of [input.anchor, ...input.kept.map((piece) => piece.item), ...looks.flatMap((look) => look.picks.map((pick) => pick.item))]) {
    pieces.set(item.externalId, item);
  }
  const live = new Map((await hydrateLiveFacts(ctx.connection, [...pieces.values()])).map((item) => [item.externalId, item]));
  const fixed = [input.anchor, ...input.kept.map((piece) => piece.item)].map((item) => live.get(item.externalId) ?? item);
  if (fixed.some((item) => !item.inStock)) return [];

  return looks
    .map((look) => ({ ...look, picks: look.picks.map((pick) => ({ ...pick, item: live.get(pick.item.externalId) ?? pick.item })) }))
    .filter((look) => {
      if (look.picks.some((pick) => !pick.item.inStock || pick.item.price === null)) return false;
      if (look.picks.some((pick) => {
        const ceiling = directions[look.direction]?.slots.find((slot) => slot.slot === pick.slot)?.ceiling ?? null;
        return ceiling !== null && (pick.item.price ?? 0) > ceiling;
      })) return false;
      return input.budget === null || lookTotal([...fixed, ...look.picks.map((pick) => pick.item)]) <= input.budget;
    });
}

function showable(candidates: CatalogCandidate[]): CatalogCandidate[] {
  return candidates.filter((candidate) => candidate.inStock && candidate.imageUrl && candidate.price !== null);
}

async function buildLooks(ctx: AgentContext, input: BuildInput): Promise<BuildOutput> {
  const config = ctx.pathConfig!.config;
  const currency = config.currency ?? input.anchor.currency;
  const say = bundleMessages(bundleLanguage(input.language, ctx.message));
  const committed = lookTotal([input.anchor, ...input.kept.map((piece) => piece.item)]);
  const remaining = input.budget === null ? null : Math.round((input.budget - committed) * 100) / 100;

  if (remaining !== null && remaining <= 0) {
    return {
      looks: [],
      products: [],
      reply: say.budgetUsedUp(formatMoney(input.anchor.price, currency), formatMoney(input.budget, currency)),
    };
  }

  const anchorPath = personaPathOf(input.anchor);
  const anchorNode = anchorPath ? findNode(config, anchorPath) : null;
  const tier = anchorNode ? tierOf(anchorNode.tiers, input.anchor.price) : null;
  const anchorTier: AnchorTier | null = anchorNode && tier ? { path: anchorNode.path, tier } : null;
  const ceilings = fallbackCeilings(anchorNode, input.anchor.price, input.slots);
  const limits: PlanLimits = {
    remaining,
    fallbackCeilings: ceilings,
    anchorTier: tier?.label ?? null,
    excludeIds: [input.anchor.externalId, ...input.kept.map((piece) => piece.item.externalId), ...(input.replacing ?? []).map((piece) => piece.externalId)],
    caps: input.caps,
  };
  const budgetLine: BudgetLine =
    input.budget === null ? { kind: "fallback", tier: tier?.label ?? null, ceilings } : { kind: "budget", budget: input.budget, committed };

  const plan = await planLooks(ctx, input, limits, budgetLine, anchorTier);
  if (!plan.ok) {
    log(ctx, { plan: "failed", problems: plan.problems.join(" | ") });
    // "Cheaper shoes" when these already are the cheapest: the cap sits below everything in stock.
    const capped = [...(input.caps?.keys() ?? [])].filter((slot) => input.slots.some((entry) => entry.slot === slot && entry.floor !== null && input.caps!.get(slot)! < entry.floor));
    return {
      looks: [],
      products: [],
      reply:
        capped.length > 0
          ? say.alreadyCheapest(capped)
          : input.budget === null
            ? say.noPiecesNoBudget
            : say.budgetTooSmall(formatMoney(input.budget, currency)),
    };
  }

  const pageSize = plan.directions.length > 1 ? DIRECTION_SLOT_PAGE : SLOT_PAGE;
  const floors = premiumFloors(tier, input.slots);
  const avoid = input.avoid ?? [];
  let softened = 0;
  const searchSlot = async (search: SlotSearch): Promise<SlotCandidates> => {
    const floor = floors.get(search.slot) ?? null;
    const priceMin = floor !== null && (search.spec.priceMax === null || floor < search.spec.priceMax) ? floor : null;
    const excludeIds = avoid.filter((id) => !search.spec.excludeIds.includes(id));
    let candidates: CatalogCandidate[] = [];
    if (priceMin !== null || excludeIds.length > 0) {
      const spec = { ...search.spec, priceMin: priceMin ?? search.spec.priceMin, excludeIds: [...search.spec.excludeIds, ...excludeIds] };
      candidates = showable((await searchCatalog(ctx, spec, search.query, pageSize)).candidates);
      if (candidates.length < MIN_SOFT_CANDIDATES) {
        softened += 1;
        const preferred = new Set(candidates.map((candidate) => candidate.externalId));
        const rest = showable((await searchCatalog(ctx, search.spec, search.query, pageSize)).candidates);
        candidates = [...candidates, ...rest.filter((candidate) => !preferred.has(candidate.externalId))];
      }
    } else {
      candidates = showable((await searchCatalog(ctx, search.spec, search.query, pageSize)).candidates);
    }
    return { slot: search.slot, ceiling: search.spec.priceMax, candidates };
  };
  const searched: SearchedDirection[] = await Promise.all(
    plan.directions.map(async (direction) => ({ ...direction, slots: await Promise.all(direction.searches.map(searchSlot)) }))
  );
  const filled = new Set(searched.flatMap((direction) => direction.slots.filter((slot) => slot.candidates.length > 0).map((slot) => slot.slot)));
  // A slot the plan skipped on purpose (no jacket for the beach) is not missing; one it searched
  // and found nothing for is.
  const searchedSlots = new Set(searched.flatMap((direction) => direction.searches.map((search) => search.slot)));
  const missing = input.slots.map((slot) => slot.slot).filter((slot) => searchedSlots.has(slot) && !filled.has(slot));
  const describe = (direction: LookDirection) =>
    `${direction.theme || "-"}: ${direction.searches
      .map((search) => `${search.slot}=${search.path}<=${search.spec.priceMax ?? "any"}${search.query ? `~"${search.query}"` : ""}`)
      .join(" > ")}`;

  if (filled.size === 0) {
    log(ctx, { directions: searched.length, candidates: 0, searches: searched.map(describe).join(" | ") });
    const inSize = ctx.session.measurements !== null;
    return {
      looks: [],
      products: [],
      reply: input.replacing?.length ? say.noOtherPiece(missing, inSize) : say.nothingInStock(missing, input.budget !== null, inSize),
    };
  }

  const composable = searched.filter((direction) => direction.slots.some((slot) => slot.candidates.length > 0));
  const composed = await composeLooks(ctx, input, composable);
  const verified = await verifyLive(ctx, input, composed.looks, composable);
  log(ctx, {
    directions: searched.length,
    searches: searched.map(describe).join(" | "),
    candidates: searched.reduce((sum, direction) => sum + direction.slots.reduce((n, slot) => n + slot.candidates.length, 0), 0),
    floors: [...floors].map(([slot, value]) => `${slot}>=${value}`).join(",") || "none",
    avoided: avoid.length,
    softened,
    composed: composed.looks.length,
    shown: verified.length,
    missing: missing.join(",") || "none",
  });

  if (verified.length === 0) {
    return { looks: [], products: [], reply: say.changedWhileChecking };
  }

  const looks = verified.map((look, index) =>
    toLookRecord(index, input.anchor, input.kept, look, composable[look.direction], {
      budget: input.budget,
      department: input.department,
      request: input.request,
    })
  );
  const products = new Map<string, CatalogCandidate>();
  for (const item of [input.anchor, ...input.kept.map((piece) => piece.item), ...verified.flatMap((look) => look.picks.map((pick) => pick.item))]) {
    products.set(item.externalId, item);
  }

  // The model's reply already names a missing piece in the shopper's language; code's own reply
  // says it.
  if (composed.reply) return { looks, products: [...products.values()], reply: composed.reply };
  const totals = looks.map((look) => formatMoney(look.total, currency)).join(", ");
  const unnamed = missing.filter((slot) => !looks[0].items.some((item) => item.category === slot));
  const reply = `${say.looksBuilt(looks.length, totals)}${unnamed.length > 0 ? say.missingAfterLooks(unnamed) : ""}`;
  return { looks, products: [...products.values()], reply };
}

function* emitLooks(output: BuildOutput): Generator<AgentEvent> {
  if (output.looks.length === 0) return;
  yield { type: "bundle", bundles: output.looks, products: toProducts(output.products) };
}

type AnchorSetup = { ok: true; department: string; slots: SlotInPlay[] } | { ok: false; message: string };

/** A unisex piece is completed from the shopper's own department (its unisex twin rides along),
 *  so a unisex tee on a man is paired with men's trousers, not only the few unisex ones. */
function lookDepartment(anchor: CatalogCandidate, shopper: string | null): string | null {
  const own = departmentOf(anchor);
  if (own && shopper && unisexDepartmentFor(shopper) === own) return shopper;
  return own ?? shopper;
}

/** Whether looks can be built around this piece at all, and with which slots. */
function setUpAnchor(ctx: AgentContext, anchor: CatalogCandidate): AnchorSetup {
  const say = bundleMessages(bundleLanguage(null, ctx.message));
  if (!anchor.inStock) return { ok: false, message: say.unavailable };
  const anchorLeaf = personaPathOf(anchor)?.split(" > ")[2] ?? null;
  if (!isOutfitLeaf(anchorLeaf)) {
    log(ctx, { anchor: anchor.externalId, skipped: anchorLeaf });
    return { ok: false, message: say.notAnOutfitPiece };
  }
  const department = lookDepartment(anchor, ctx.session.department);
  const slots = department ? slotsInPlay(ctx.pathConfig!.config, department, categoryOf(anchor)) : [];
  if (!department || slots.length === 0) {
    log(ctx, { anchor: anchor.externalId, slots: 0 });
    return { ok: false, message: say.nothingToPair };
  }
  return { ok: true, department, slots };
}

function cleanBrief(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** 0 is how the model says "no limit"; null means the shopper named no amount. */
function namedBudget(value: number | null | undefined): { named: boolean; budget: number | null } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { named: false, budget: null };
  return { named: true, budget: value > 0 ? Math.round(value) : null };
}

/**
 * A message while the product is attached as the anchor of a look ("Complete the look" only
 * attaches — nothing runs until the shopper sends something). Whatever they send builds a set of
 * looks around it: a budget, a style, an occasion, or just "go". With no budget named the looks
 * stay near the piece's own price range, and the reply says so. A question about the piece is
 * answered; anything about other products gets a pointer to ×, because only the shopper ends the
 * mode. What the shopper has asked so far and the pieces already shown are written back onto the
 * attachment, so a later message ("under 200", "other looks") builds on all of it.
 */
async function* anchorTurn(ctx: AgentContext, attachment: Extract<AgentAttachment, { kind: "anchor" }>): AsyncGenerator<AgentEvent> {
  const productId = attachment.productId;
  const anchor = ctx.products.get(productId);
  if (!anchor) {
    yield { type: "attachment", attachment: null };
    yield* textEvents(`${bundleMessages(bundleLanguage(null, ctx.message)).unavailable} `);
    yield* runPersona({ ...ctx, attachment: null });
    return;
  }
  const setup = setUpAnchor(ctx, anchor);
  if (!setup.ok) {
    yield { type: "attachment", attachment: null };
    yield* textEvents(setup.message);
    return;
  }

  const shown = attachment.shownIds ?? [];
  const decided = await decide<AnchorResponse>(ctx, {
    prefix: anchorPrefix(),
    cacheAs: "bundle-anchor",
    userText: renderAnchorTurn({
      ctx,
      message: ctx.message,
      anchor,
      budget: ctx.session.budget,
      slotsText: renderSlotsInPlay(ctx.pathConfig!.config, setup.slots),
      brief: attachment.brief,
      shownCount: shown.length,
    }),
    schema: ANCHOR_SCHEMA,
    thinking: "off",
    label: "bundle anchor",
  }).catch((error: unknown) => decisionFailed(ctx, error));
  // Without a decision, the first message after "Complete the look" is almost always a request
  // to build, so the looks are built from it; later, the shopper is asked to send it again.
  if (!decided && shown.length > 0) {
    yield* textEvents(bundleMessages(bundleLanguage(null, ctx.message)).tryAgain);
    return;
  }
  const value: AnchorResponse = decided ?? {
    reasoning: "",
    intent: "rerun",
    reply: "",
    brief: [attachment.brief, ctx.message].filter(Boolean).join("; "),
    language: "",
    budget: null,
    new_pieces: false,
  };
  log(ctx, { anchor_turn: value.intent, anchor: productId, new_pieces: value.new_pieces === true, language: value.language || null, decided: Boolean(decided) });
  const say = bundleMessages(bundleLanguage(value.language, ctx.message));

  if (value.intent === "detach") {
    yield* textEvents(value.reply?.trim() || say.stay);
    return;
  }
  if (value.intent === "answer") {
    yield* textEvents(value.reply?.trim() || say.askForInput);
    return;
  }

  const brief = cleanBrief(value.brief) || [attachment.brief, ctx.message].filter(Boolean).join("; ");
  const { named, budget: namedTotal } = namedBudget(value.budget);
  const budget = named ? namedTotal : ctx.session.budget;
  if (budget !== ctx.session.budget) yield { type: "budget", budget };

  yield { type: "status", stage: "composing" };
  const output = await buildLooks(ctx, {
    anchor,
    department: setup.department,
    budget,
    slots: setup.slots,
    kept: [],
    request: brief,
    language: value.language,
    mentionBudget: budget === null && shown.length === 0,
    avoid: value.new_pieces ? shown : [],
  });
  log(ctx, { anchor_turn: "built", anchor: productId, looks: output.looks.length });
  yield* textEvents(output.reply);
  yield* emitLooks(output);
  const pieces = output.looks.flatMap((look) => look.productIds).filter((id) => id !== productId);
  const shownIds = [...new Set([...pieces, ...shown])].slice(0, MAX_SHOWN_PIECES);
  yield { type: "attachment", attachment: { kind: "anchor", productId, brief, ...(shownIds.length > 0 ? { shownIds } : {}) } };
}

/** A typed message while a look is attached. */
async function* followUp(ctx: AgentContext, look: LookRecord): AsyncGenerator<AgentEvent> {
  const anchor = ctx.products.get(look.anchorId);
  if (!anchor) {
    yield { type: "attachment", attachment: null };
    yield* runPersona({ ...ctx, attachment: null });
    return;
  }

  const config = ctx.pathConfig!.config;
  const department = look.department || lookDepartment(anchor, ctx.session.department) || "";
  const inPlay = slotsInPlay(config, department, categoryOf(anchor));
  const current = ctx.session.budget ?? look.budget;
  const pieces = look.productIds.map((id) => ctx.products.get(id)).filter((item): item is CatalogCandidate => Boolean(item));

  const value = await decide<FollowUpResponse>(ctx, {
    prefix: followUpPrefix(),
    cacheAs: "bundle-follow-up",
    userText: renderFollowUpTurn({
      ctx,
      message: ctx.message,
      look,
      pieces,
      budget: current,
      slotsText: renderSlotsInPlay(config, inPlay),
      store: renderStore(config),
    }),
    schema: FOLLOW_UP_SCHEMA,
    thinking: "off",
    label: "bundle follow-up",
  }).catch((error: unknown) => decisionFailed(ctx, error));
  if (!value) {
    yield* textEvents(bundleMessages(bundleLanguage(null, ctx.message)).tryAgain);
    return;
  }
  log(ctx, { follow_up: value.intent, look: look.id, language: value.language ?? null });
  const say = bundleMessages(bundleLanguage(value.language, ctx.message));

  if (value.intent === "detach") {
    yield* textEvents(value.reply?.trim() || say.stay);
    return;
  }
  if (value.intent === "answer") {
    yield* textEvents(value.reply?.trim() || say.askAboutLook);
    return;
  }

  const brief = cleanBrief(value.brief) || look.brief || ctx.message;
  const slotOf = (item: CatalogCandidate) => categoryOf(item) ?? "";
  const others = pieces.filter((piece) => piece.externalId !== anchor.externalId);
  const recordFor = (slot: string) => look.slots.find((entry) => entry.slot === slot) ?? null;

  if (value.intent === "drop_slot") {
    const drop = new Set(value.drop_slots);
    const keptPieces = [anchor, ...others.filter((piece) => !drop.has(slotOf(piece)))];
    const updated: LookRecord = {
      ...look,
      id: lookId(keptPieces.map((piece) => piece.externalId)),
      productIds: keptPieces.map((piece) => piece.externalId),
      items: keptPieces.map((piece) => ({ productId: piece.externalId, category: categoryOf(piece), price: piece.price ?? 0 })),
      total: lookTotal(keptPieces),
      slots: look.slots.filter((slot) => !drop.has(slot.slot)),
      brief,
    };
    yield* textEvents(value.reply?.trim() || say.lookNowCosts(formatMoney(updated.total, config.currency)));
    yield { type: "bundle", bundles: [updated], products: toProducts(keptPieces) };
    yield { type: "attachment", attachment: { kind: "look", look: updated } };
    return;
  }

  const { named, budget: namedTotal } = namedBudget(value.budget);
  const budget = named ? namedTotal : current;
  if (named && budget !== ctx.session.budget) yield { type: "budget", budget };

  const rerun = value.intent === "rerun";
  const changing = new Set(rerun ? inPlay.map((slot) => slot.slot) : value.slots.map((slot) => slot.slot));
  const slots = inPlay.filter((slot) => changing.has(slot.slot));
  if (slots.length === 0) {
    yield* textEvents(value.reply?.trim() || say.cannotChange);
    return;
  }
  const kept: KeptPiece[] = rerun
    ? []
    : others.filter((piece) => !changing.has(slotOf(piece))).map((piece) => ({ slot: slotOf(piece), item: piece, record: recordFor(slotOf(piece)) }));
  const replaced = rerun ? [] : others.filter((piece) => changing.has(slotOf(piece)));
  const caps = CHEAPER.test(ctx.message)
    ? new Map(
        replaced
          .filter((piece) => piece.price !== null)
          .map((piece) => [slotOf(piece), Math.floor((piece.price! - 0.01) * 100) / 100] as [string, number])
      )
    : undefined;

  yield { type: "status", stage: "composing" };
  const output = await buildLooks(ctx, {
    anchor,
    department,
    budget,
    slots,
    kept,
    intents: value.slots,
    request: brief,
    language: value.language,
    replacing: replaced,
    caps,
  });
  if (output.looks.length === 0) {
    yield* textEvents(`${output.reply}${say.lookUnchanged}`);
    return;
  }
  // The first alternative takes the look's place under its title; the others are numbered after it.
  const changed = {
    ...output,
    looks: output.looks.map((entry, index) => ({ ...entry, label: index === 0 ? look.label : `${look.label} · ${index + 1}` })),
  };
  yield* textEvents(output.reply || value.reply);
  yield* emitLooks(changed);
  yield { type: "attachment", attachment: { kind: "look", look: changed.looks[0] } };
}

/** The outfit agent. Runs on every message the shopper sends while a product is attached as the
 *  anchor of a look ("Complete the look") or one of its looks is ("Ask about this bundle"). */
export async function* runBundle(ctx: AgentContext): AsyncGenerator<AgentEvent> {
  yield { type: "agent", agent: "bundle" };
  yield { type: "status", stage: "thinking" };

  if (!ctx.pathConfig || !ctx.connection || !ctx.catalogReady) {
    yield* textEvents(bundleMessages(bundleLanguage(null, ctx.message)).preparing);
    return;
  }

  if (ctx.attachment?.kind === "look") {
    yield* followUp(ctx, ctx.attachment.look);
    return;
  }
  if (ctx.attachment?.kind === "anchor") {
    yield* anchorTurn(ctx, ctx.attachment);
    return;
  }
  yield* runPersona(ctx);
}
