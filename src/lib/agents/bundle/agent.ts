import { createHash } from "node:crypto";
import { findNode } from "@/lib/catalog/path-config/lookup";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import { parseHardRules } from "../shared/hard-rules";
import { hydrateLiveFacts, toProducts } from "../shared/hydrate";
import { categoryOf, departmentOf, personaPathOf } from "../shared/product-record";
import { searchCatalog } from "../shared/search";
import { formatMoney, textEvents } from "../shared/stream";
import { agentModel, callStructured } from "../shared/structured-call";
import { runPersona } from "../persona/agent";
import type { AgentContext, AgentEvent, LookRecord, LookSlot } from "../types";
import { budgetSuggestions, distinctLooks, lookTotal, naiveLook, verifyLook, type ComposedLook, type SlotCandidates } from "./compose";
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
  followUpPrefix,
  planPrefix,
  renderComposeTurn,
  renderFollowUpTurn,
  renderPlanTurn,
  type BudgetLine,
} from "./prompt";
import {
  COMPOSE_SCHEMA,
  FOLLOW_UP_SCHEMA,
  PLAN_SCHEMA,
  type BundleSlotIntent,
  type ComposeResponse,
  type FollowUpResponse,
  type PlanResponse,
} from "./schema";
import { fallbackCeilings, isOutfitLeaf, renderSlotsInPlay, slotsInPlay, tierOf, type SlotInPlay } from "./slots";

const SLOT_PAGE = 20;
/** Smaller pages when several looks are searched at once — each slot is searched per look. */
const DIRECTION_SLOT_PAGE = 10;
const MAX_LOOKS = MAX_DIRECTIONS;
/** With a single planned look (a follow-up), compose may still offer a few alternatives. */
const SINGLE_DIRECTION_LOOKS = 3;
const CHEAPER = /\b(cheaper|less expensive|lower[- ]priced|more affordable)\b/i;

function log(ctx: AgentContext, fields: Record<string, string | number | boolean | null>): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[agents bundle] store=${ctx.connection?.id ?? "none"} ${parts.join(" ")}`);
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
  request?: string;
  /** Pieces a swap is replacing — never offered back. */
  replacing?: CatalogCandidate[];
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
  input: { budget: number | null; department: string }
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
  };
}

/**
 * Up to five looks on "Complete the look", one on a follow-up. Each look's queries are written
 * together as a chain (every slot matches the anchor and the slots before it), so the searches
 * can all run at once afterwards.
 */
async function planLooks(ctx: AgentContext, input: BuildInput, limits: PlanLimits, budgetLine: BudgetLine): Promise<DirectionPlan> {
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
          department: input.department,
          budget: budgetLine,
          slotsText,
          looks,
          request: input.request,
          problems,
        }),
        schema: PLAN_SCHEMA,
        thinking: "off",
        meter: ctx.meter,
        label: "bundle plan",
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
        replacing: input.replacing,
        styleGuide: ctx.styleGuide,
        sized: ctx.session.measurements !== null,
      }),
      schema: COMPOSE_SCHEMA,
      thinking: "on",
      timeoutMs: 40_000,
      meter: ctx.meter,
      label: "bundle compose",
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

async function buildLooks(ctx: AgentContext, input: BuildInput): Promise<BuildOutput> {
  const config = ctx.pathConfig!.config;
  const currency = config.currency ?? input.anchor.currency;
  const committed = lookTotal([input.anchor, ...input.kept.map((piece) => piece.item)]);
  const remaining = input.budget === null ? null : Math.round((input.budget - committed) * 100) / 100;

  if (remaining !== null && remaining <= 0) {
    return {
      looks: [],
      products: [],
      reply: `At ${formatMoney(input.anchor.price, currency)} this piece already uses the ${formatMoney(input.budget, currency)} budget, so there's nothing left for the rest of the look. Raise the budget and I'll build around it.`,
    };
  }

  const anchorPath = personaPathOf(input.anchor);
  const anchorNode = anchorPath ? findNode(config, anchorPath) : null;
  const ceilings = fallbackCeilings(anchorNode, input.anchor.price, input.slots);
  const limits: PlanLimits = {
    remaining,
    fallbackCeilings: ceilings,
    excludeIds: [input.anchor.externalId, ...input.kept.map((piece) => piece.item.externalId), ...(input.replacing ?? []).map((piece) => piece.externalId)],
    caps: input.caps,
  };
  const budgetLine: BudgetLine =
    input.budget === null
      ? { kind: "fallback", tier: anchorNode ? tierOf(anchorNode.tiers, input.anchor.price)?.label ?? null : null, ceilings }
      : { kind: "budget", budget: input.budget, committed };

  const plan = await planLooks(ctx, input, limits, budgetLine);
  if (!plan.ok) {
    log(ctx, { plan: "failed", problems: plan.problems.join(" | ") });
    return {
      looks: [],
      products: [],
      reply:
        input.budget === null
          ? "I couldn't find pieces in this store to build a look around this one."
          : `The ${formatMoney(input.budget, currency)} budget doesn't stretch to a full look around this piece in this store — even the cheapest options for the other pieces go over it. Raising the budget would open it up.`,
    };
  }

  const pageSize = plan.directions.length > 1 ? DIRECTION_SLOT_PAGE : SLOT_PAGE;
  const searchSlot = async (search: SlotSearch): Promise<SlotCandidates> => {
    const outcome = await searchCatalog(ctx, search.spec, search.query, pageSize);
    return {
      slot: search.slot,
      ceiling: search.spec.priceMax,
      candidates: outcome.candidates.filter((candidate) => candidate.inStock && candidate.imageUrl && candidate.price !== null),
    };
  };
  const searched: SearchedDirection[] = await Promise.all(
    plan.directions.map(async (direction) => ({ ...direction, slots: await Promise.all(direction.searches.map(searchSlot)) }))
  );
  const filled = new Set(searched.flatMap((direction) => direction.slots.filter((slot) => slot.candidates.length > 0).map((slot) => slot.slot)));
  const missing = input.slots.map((slot) => slot.slot).filter((slot) => !filled.has(slot));
  const describe = (direction: LookDirection) =>
    `${direction.theme || "-"}: ${direction.searches
      .map((search) => `${search.slot}=${search.path}<=${search.spec.priceMax ?? "any"}${search.query ? `~"${search.query}"` : ""}`)
      .join(" > ")}`;

  if (filled.size === 0) {
    log(ctx, { directions: searched.length, candidates: 0, searches: searched.map(describe).join(" | ") });
    const inSize = ctx.session.measurements ? " in your size" : "";
    return {
      looks: [],
      products: [],
      reply: input.replacing?.length
        ? `There's no other ${missing.join(", ")} in stock${inSize} that fits this look at that price.`
        : `I couldn't find pieces to go with this within ${input.budget === null ? "its price range" : "the budget"} — nothing in stock${inSize} for ${missing.join(", ")}.`,
    };
  }

  const composable = searched.filter((direction) => direction.slots.some((slot) => slot.candidates.length > 0));
  const composed = await composeLooks(ctx, input, composable);
  const verified = await verifyLive(ctx, input, composed.looks, composable);
  log(ctx, {
    directions: searched.length,
    searches: searched.map(describe).join(" | "),
    candidates: searched.reduce((sum, direction) => sum + direction.slots.reduce((n, slot) => n + slot.candidates.length, 0), 0),
    composed: composed.looks.length,
    shown: verified.length,
    missing: missing.join(",") || "none",
  });

  if (verified.length === 0) {
    return { looks: [], products: [], reply: "Nothing I could put together holds up right now — prices or stock changed as I checked. Try again in a moment." };
  }

  const looks = verified.map((look, index) =>
    toLookRecord(index, input.anchor, input.kept, look, composable[look.direction], { budget: input.budget, department: input.department })
  );
  const products = new Map<string, CatalogCandidate>();
  for (const item of [input.anchor, ...input.kept.map((piece) => piece.item), ...verified.flatMap((look) => look.picks.map((pick) => pick.item))]) {
    products.set(item.externalId, item);
  }

  const totals = looks.map((look) => formatMoney(look.total, currency)).join(", ");
  let reply = composed.reply || `Here ${looks.length === 1 ? "is a look" : `are ${looks.length} looks`} built around it (${totals}).`;
  const unnamed = missing.filter(
    (slot) => !looks[0].items.some((item) => item.category === slot) && !reply.toLowerCase().includes(slot.toLowerCase())
  );
  if (unnamed.length > 0) reply += ` Nothing in stock fit for ${unnamed.join(", ")}.`;
  return { looks, products: [...products.values()], reply };
}

function* emitLooks(output: BuildOutput): Generator<AgentEvent> {
  if (output.looks.length === 0) return;
  yield { type: "bundle", bundles: output.looks, products: toProducts(output.products) };
}

/**
 * "Complete the look" on a card: that item becomes the anchor. The first press only asks for the
 * budget; the looks are built once, on the shopper's answer.
 */
async function* completeTheLook(ctx: AgentContext, productId: string, askBudget: boolean): AsyncGenerator<AgentEvent> {
  const anchor = ctx.products.get(productId);
  if (!anchor || !anchor.inStock) {
    yield* textEvents("That item isn't available anymore, so I can't build a look around it.");
    return;
  }
  const anchorLeaf = personaPathOf(anchor)?.split(" > ")[2] ?? null;
  if (!isOutfitLeaf(anchorLeaf)) {
    log(ctx, { trigger: "complete_look", anchor: productId, skipped: anchorLeaf });
    yield* textEvents("This piece isn't one I build full outfits around — try Complete the look on a top, bottom, dress or pair of shoes.");
    return;
  }
  const department = departmentOf(anchor) ?? ctx.session.department;
  const category = categoryOf(anchor);
  const slots = department ? slotsInPlay(ctx.pathConfig!.config, department, category) : [];
  if (!department || slots.length === 0) {
    log(ctx, { trigger: "complete_look", anchor: productId, slots: 0 });
    yield* textEvents("This store doesn't have pieces to pair with this one right now, so I can't build a full look around it.");
    return;
  }

  if (askBudget) {
    const anchorPath = personaPathOf(anchor);
    const ceilings = fallbackCeilings(anchorPath ? findNode(ctx.pathConfig!.config, anchorPath) : null, anchor.price, slots);
    const suggestions = budgetSuggestions(
      anchor.price ?? 0,
      slots.map((slot) => ({ floor: slot.floor, typical: ceilings.get(slot.slot) ?? null }))
    );
    log(ctx, { trigger: "complete_look", anchor: productId, ask_budget: suggestions.join("/") });
    const names = slots.map((slot) => slot.slot);
    const pieces = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    yield* textEvents(
      `What's your budget for the whole outfit — this piece plus ${pieces}? Pick one below, or No limit and I'll keep the pieces near this one's price.`
    );
    yield { type: "budget_request", anchorId: productId, budget: ctx.session.budget, suggestions };
    return;
  }

  yield { type: "status", stage: "composing" };
  const output = await buildLooks(ctx, { anchor, department, budget: ctx.session.budget, slots, kept: [] });
  log(ctx, { trigger: "complete_look", anchor: productId, looks: output.looks.length });
  yield* textEvents(output.reply);
  yield* emitLooks(output);
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
  const department = look.department || departmentOf(anchor) || ctx.session.department || "";
  const inPlay = slotsInPlay(config, department, categoryOf(anchor));
  const budget = ctx.session.budget ?? look.budget;
  const pieces = look.productIds.map((id) => ctx.products.get(id)).filter((item): item is CatalogCandidate => Boolean(item));

  const { value } = await callStructured<FollowUpResponse>({
    apiKey: ctx.geminiApiKey,
    model: agentModel(),
    prefix: followUpPrefix(),
    cacheAs: "bundle-follow-up",
    userText: renderFollowUpTurn({ ctx, message: ctx.message, look, pieces, budget, slotsText: renderSlotsInPlay(config, inPlay) }),
    schema: FOLLOW_UP_SCHEMA,
    thinking: "off",
    meter: ctx.meter,
    label: "bundle follow-up",
  });
  log(ctx, { follow_up: value.intent, look: look.id });

  if (value.intent === "detach") {
    yield { type: "attachment", attachment: null };
    yield* runPersona({ ...ctx, attachment: null });
    return;
  }
  if (value.intent === "answer") {
    yield* textEvents(value.reply || "Anything you'd like to change about this look?");
    return;
  }

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
    };
    yield* textEvents(value.reply || `Done — the look is now ${formatMoney(updated.total, config.currency)}.`);
    yield { type: "bundle", bundles: [updated], products: toProducts(keptPieces) };
    yield { type: "attachment", attachment: { kind: "look", look: updated } };
    return;
  }

  const rerun = value.intent === "rerun";
  const changing = new Set(rerun ? inPlay.map((slot) => slot.slot) : value.slots.map((slot) => slot.slot));
  const slots = inPlay.filter((slot) => changing.has(slot.slot));
  if (slots.length === 0) {
    yield* textEvents(value.reply || "I can't change that part of the look with what's in stock.");
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
    budget: rerun && typeof value.budget === "number" && value.budget > 0 ? value.budget : budget,
    slots,
    kept,
    intents: value.slots,
    request: ctx.message,
    replacing: replaced,
    caps,
  });
  if (output.looks.length === 0) {
    yield* textEvents(`${output.reply} The current look is unchanged.`);
    return;
  }
  const changed = { ...output, looks: output.looks.map((entry) => ({ ...entry, label: look.label })) };
  yield* textEvents(output.reply || value.reply);
  yield* emitLooks(changed);
  yield { type: "attachment", attachment: { kind: "look", look: changed.looks[0] } };
}

/** The outfit agent. Runs only on a click — "Complete the look" — or while a look is attached. */
export async function* runBundle(ctx: AgentContext): AsyncGenerator<AgentEvent> {
  yield { type: "agent", agent: "bundle" };
  yield { type: "status", stage: "thinking" };

  if (!ctx.pathConfig || !ctx.connection || !ctx.catalogReady) {
    yield* textEvents("The store's products are still being prepared — outfits will be available shortly.");
    return;
  }

  if (ctx.trigger) {
    yield* completeTheLook(ctx, ctx.trigger.productId, ctx.trigger.askBudget === true);
    return;
  }
  if (ctx.attachment?.kind === "look") {
    yield* followUp(ctx, ctx.attachment.look);
    return;
  }
  yield* runPersona(ctx);
}
