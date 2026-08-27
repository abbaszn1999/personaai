import { writeUserEvent } from "./client";
import { buildAcsProductId, buildAcsVisitorId } from "./isolation";
import { isAcsConfigured } from "./sync";
import type { AcsProductDetail } from "./types";

/**
 * Search/try-on/add-to-cart event recording — required for ACS's own ranking and recommendation
 * quality, not optional polish (see the plan's "User events" section). Every write here is
 * best-effort and silently skipped when ACS isn't configured yet, same safety rule as
 * `acs/sync.ts`: nothing in this module may ever throw into a caller that also has to keep
 * serving the shopper's actual chat turn.
 *
 * `attributionToken` is threaded through from the search call that produced the products being
 * acted on, so ACS can attribute a later try-on/add-to-cart back to the search that surfaced it.
 * Until the hard cutover wires the ACS search adapter into the live router, nothing produces one
 * (pgvector has no equivalent) — every event here treats it as optional and simply omits it
 * rather than failing, and picks up real tokens automatically once cutover ships.
 */

function logAcsEventError(op: string, connectionId: string, err: unknown): void {
  console.error(`[acs/user-events ${op}]`, connectionId, err);
}

function toProductDetails(connectionId: string, externalIds: string[], quantity?: number): AcsProductDetail[] {
  return externalIds.map((externalId) => ({
    product: { id: buildAcsProductId(connectionId, externalId) },
    ...(quantity !== undefined ? { quantity } : {}),
  }));
}

export interface RecordSearchEventInput {
  connectionId: string;
  visitorId: string;
  searchQuery: string;
  /** Ids of the products actually shown to the shopper for this query — mirrors the
   *  `search_catalog` tool's `MAX_UI_RESULTS`-truncated list, not the full candidate pool. */
  resultExternalIds: string[];
  attributionToken?: string;
}

export async function recordSearchEvent(input: RecordSearchEventInput): Promise<void> {
  if (!isAcsConfigured()) return;
  try {
    await writeUserEvent({
      eventType: "search",
      visitorId: buildAcsVisitorId(input.connectionId, input.visitorId),
      searchQuery: input.searchQuery,
      attributionToken: input.attributionToken,
      productDetails: toProductDetails(input.connectionId, input.resultExternalIds),
    });
  } catch (err) {
    logAcsEventError("recordSearchEvent", input.connectionId, err);
  }
}

export interface RecordDetailPageViewInput {
  connectionId: string;
  visitorId: string;
  externalId: string;
  attributionToken?: string;
}

/** Fired once per item rendered in a try-on preview — the closest ACS event type to "the
 *  shopper is looking closely at this specific product," which is what try-on actually signals. */
export async function recordDetailPageViewEvent(input: RecordDetailPageViewInput): Promise<void> {
  if (!isAcsConfigured()) return;
  try {
    await writeUserEvent({
      eventType: "detail-page-view",
      visitorId: buildAcsVisitorId(input.connectionId, input.visitorId),
      attributionToken: input.attributionToken,
      productDetails: toProductDetails(input.connectionId, [input.externalId]),
    });
  } catch (err) {
    logAcsEventError("recordDetailPageViewEvent", input.connectionId, err);
  }
}

export interface RecordAddToCartInput {
  connectionId: string;
  visitorId: string;
  externalId: string;
  quantity?: number;
  attributionToken?: string;
}

export async function recordAddToCartEvent(input: RecordAddToCartInput): Promise<void> {
  if (!isAcsConfigured()) return;
  try {
    await writeUserEvent({
      eventType: "add-to-cart",
      visitorId: buildAcsVisitorId(input.connectionId, input.visitorId),
      attributionToken: input.attributionToken,
      productDetails: toProductDetails(input.connectionId, [input.externalId], input.quantity ?? 1),
    });
  } catch (err) {
    logAcsEventError("recordAddToCartEvent", input.connectionId, err);
  }
}
