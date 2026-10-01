import { isAcsConfigured } from "@/lib/catalog/acs/config";
import { getCatalogProductsByExternalIds } from "@/lib/catalog/acs/catalog-reads";
import { mappedSourceCategoryIds } from "@/lib/catalog/persona-mapping";
import { rebuildPersonaPathConfig, scheduleRebuildPersonaPathConfig } from "@/lib/catalog/path-config/rebuild";
import { getPersonaPathConfig } from "@/lib/db/persona-path-configs";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { createTimeoutSignal } from "@/lib/catalog/timeout";
import type { UsageSurface } from "@/lib/billing/pricing";
import type { SessionMeter } from "@/lib/billing/session-meter";
import type { ChatMessage } from "@/modules/commerce/types";
import type { CatalogCandidate } from "@/lib/retrieval/types";
import type { StoredPathConfig } from "@/lib/catalog/path-config/types";
import type { AgentAttachment, AgentContext, AgentTrigger, LastSearch, LookRecord } from "../types";
import { bodyMeasurements, fittingSizes, isChildShopper, parseShopperMeasurements } from "./fit";
import { toConversationTurns } from "./history";

/** Newest cards first; ordinals only ever resolve against what the shopper can still see. */
const SHOWN_LIMIT = 24;
/** A first turn on a store whose config was never built waits this long for it. */
const FIRST_BUILD_WAIT_MS = 8_000;

const AUDIENCE_DEPARTMENTS: Record<string, string> = {
  woman: "women",
  man: "men",
  unisex: "unisex",
  "kids-boy": "kids-boys",
  "kids-girl": "kids-girls",
  "kids-unisex": "kids-unisex",
};

export function departmentForAudience(audience: string | null | undefined): string | null {
  return audience ? AUDIENCE_DEPARTMENTS[audience] ?? null : null;
}

export interface AgentRequestState {
  shownProductIds?: unknown;
  lastSearch?: unknown;
}

export interface BuildAgentContextInput {
  ownerId: string;
  visitorId: string;
  usageSource?: UsageSurface;
  geminiApiKey: string;
  meter?: SessionMeter;
  /** The whole chat, the current message last. */
  messages: ChatMessage[];
  audience?: string | null;
  /** The profile's onboarding measurements (`heightCm`, `chestCm`, `waistCm`, `hipsCm`, `shoeSizeEu`). */
  measurements?: unknown;
  budget?: unknown;
  retrievalState?: AgentRequestState | null;
  attachment?: unknown;
  trigger?: unknown;
  referencedItemId?: unknown;
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
}

function parseBudget(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

function parseLastSearch(value: unknown): LastSearch | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<LastSearch>;
  if ((raw.action !== "filter" && raw.action !== "cosine") || typeof raw.path !== "string") return null;
  return {
    action: raw.action,
    path: raw.path,
    brands: stringIds(raw.brands),
    priceMin: typeof raw.priceMin === "number" ? raw.priceMin : null,
    priceMax: typeof raw.priceMax === "number" ? raw.priceMax : null,
    attributes: Array.isArray(raw.attributes)
      ? raw.attributes
          .filter((entry) => entry && typeof entry.key === "string")
          .map((entry) => ({ key: entry.key, values: stringIds(entry.values) }))
      : [],
    sizes: stringIds(raw.sizes),
    query: typeof raw.query === "string" ? raw.query : "",
  };
}

function parseLook(value: unknown): LookRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<LookRecord>;
  if (typeof raw.id !== "string" || typeof raw.anchorId !== "string" || !Array.isArray(raw.productIds)) return null;
  return {
    id: raw.id,
    label: typeof raw.label === "string" ? raw.label : "Look",
    productIds: stringIds(raw.productIds),
    items: Array.isArray(raw.items) ? raw.items : [],
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    anchorId: raw.anchorId,
    total: typeof raw.total === "number" ? raw.total : 0,
    budget: typeof raw.budget === "number" ? raw.budget : null,
    department: typeof raw.department === "string" ? raw.department : "",
    slots: Array.isArray(raw.slots) ? raw.slots : [],
  };
}

export function parseAttachment(value: unknown): AgentAttachment | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { kind?: unknown; productId?: unknown; look?: unknown };
  if (raw.kind === "item" && typeof raw.productId === "string" && raw.productId) {
    return { kind: "item", productId: raw.productId };
  }
  if (raw.kind === "look") {
    const look = parseLook(raw.look);
    return look ? { kind: "look", look } : null;
  }
  return null;
}

export function parseTrigger(value: unknown): AgentTrigger | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { type?: unknown; productId?: unknown; askBudget?: unknown };
  if (raw.type !== "complete_look" || typeof raw.productId !== "string" || !raw.productId) return null;
  return raw.askBudget === true
    ? { type: "complete_look", productId: raw.productId, askBudget: true }
    : { type: "complete_look", productId: raw.productId };
}

async function loadPathConfig(connectionId: string): Promise<StoredPathConfig | null> {
  const stored = await getPersonaPathConfig(connectionId);
  if (stored) {
    if (stored.staleAt) scheduleRebuildPersonaPathConfig(connectionId);
    return stored;
  }
  // Never built (a store that finished syncing before path configs existed). Give the first
  // build a bounded wait so this turn can still search; later turns read the saved row.
  const { signal, cancel } = createTimeoutSignal(FIRST_BUILD_WAIT_MS);
  try {
    await Promise.race([
      rebuildPersonaPathConfig(connectionId),
      new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
    ]);
  } finally {
    cancel();
  }
  return getPersonaPathConfig(connectionId);
}

/**
 * Assembles one turn's context. Shared by the dashboard preview and the embed route so the two
 * cannot drift — a feature wired into only one would pass testing and fail on a merchant's site.
 */
export async function buildAgentContext(input: BuildAgentContextInput): Promise<AgentContext> {
  const connection = await getStoreConnectionByOwner(input.ownerId);
  const categoryScope =
    connection && mappedSourceCategoryIds(connection.personaCategoryMap).length > 0 ? ["persona"] : [];
  const catalogReady = connection?.catalogSyncStatus === "ready" && isAcsConfigured();

  const turns = toConversationTurns(input.messages);
  const last = turns[turns.length - 1];
  const message = last?.role === "user" ? last.content.trim() : "";
  const history = last?.role === "user" ? turns.slice(0, -1) : turns;

  const attachment = parseAttachment(input.attachment);
  const trigger = parseTrigger(input.trigger);
  const shownProductIds = stringIds(input.retrievalState?.shownProductIds).slice(0, SHOWN_LIMIT);

  const referencedIds = new Set(shownProductIds);
  if (attachment?.kind === "item") referencedIds.add(attachment.productId);
  if (attachment?.kind === "look") {
    referencedIds.add(attachment.look.anchorId);
    attachment.look.productIds.forEach((id) => referencedIds.add(id));
  }
  if (trigger) referencedIds.add(trigger.productId);
  const referencedItemId =
    typeof input.referencedItemId === "string" && input.referencedItemId ? input.referencedItemId : null;
  if (referencedItemId) referencedIds.add(referencedItemId);

  const [pathConfig, candidates] =
    connection && catalogReady && categoryScope.length > 0
      ? await Promise.all([
          loadPathConfig(connection.id),
          getCatalogProductsByExternalIds(connection.id, [...referencedIds], categoryScope),
        ])
      : [null, [] as CatalogCandidate[]];

  const measurements = parseShopperMeasurements(input.measurements);
  const body = measurements ? bodyMeasurements(measurements) : null;
  const child = isChildShopper(input.audience ?? null);
  const known = body
    ? candidates.map((candidate) => ({ ...candidate, fitSizes: fittingSizes(candidate, body, [], child) }))
    : candidates;

  return {
    userId: input.ownerId,
    visitorId: input.visitorId,
    usageSource: input.usageSource,
    geminiApiKey: input.geminiApiKey,
    meter: input.meter,
    connection,
    catalogReady,
    categoryScope,
    pathConfig,
    session: {
      audience: input.audience ?? null,
      department: departmentForAudience(input.audience),
      budget: parseBudget(input.budget),
      measurements,
    },
    history,
    message,
    products: new Map(known.map((candidate) => [candidate.externalId, candidate])),
    shownProductIds: shownProductIds.filter((id) => candidates.some((candidate) => candidate.externalId === id)),
    lastSearch: parseLastSearch(input.retrievalState?.lastSearch),
    attachment,
    trigger,
    referencedItemId: referencedItemId && candidates.some((candidate) => candidate.externalId === referencedItemId) ? referencedItemId : null,
    styleGuide: connection?.styleGuide ?? null,
  };
}
