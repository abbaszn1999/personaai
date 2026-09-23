import { ATTRIBUTION_WINDOW_DAYS } from "@/lib/attribution/constants";

export interface WooOrderLine {
  id: string;
  itemId: string;
  name: string;
  /** Ex-tax line total in major units, already after discounts. */
  total: number;
}

export interface WooOrderForMatch {
  dateCreated: string;
  ipHash: string | null;
  uaHash: string | null;
  lines: WooOrderLine[];
}

export interface WooCartCandidate {
  platformItemId: string;
  sessionId: string;
  ipHash: string | null;
  uaHash: string | null;
  createdAt: string;
}

export interface WooMatchedLine {
  lineId: string;
  itemId: string;
  name: string;
  total: number;
  sessionId: string;
}

function inWindow(createdAt: string, orderAt: number, windowMs: number): boolean {
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return false;
  return at >= orderAt - windowMs && at <= orderAt;
}

/**
 * A Woo line is Persona’s when the same item was added through the widget, from the same
 * device (IP hash), inside the attribution window. User-agent is only a tie-break when
 * several sessions on that device added the item.
 */
export function matchWooOrderLines(
  order: WooOrderForMatch,
  events: WooCartCandidate[],
  windowDays = ATTRIBUTION_WINDOW_DAYS
): WooMatchedLine[] {
  const orderAt = Date.parse(order.dateCreated);
  if (!Number.isFinite(orderAt) || !order.ipHash) return [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const matched: WooMatchedLine[] = [];

  for (const line of order.lines) {
    if (!line.itemId || line.total <= 0) continue;
    const candidates = events.filter(
      (event) =>
        event.platformItemId === line.itemId &&
        event.ipHash !== null &&
        event.ipHash === order.ipHash &&
        inWindow(event.createdAt, orderAt, windowMs)
    );
    if (candidates.length === 0) continue;

    const uaMatched = order.uaHash
      ? candidates.filter((event) => event.uaHash !== null && event.uaHash === order.uaHash)
      : [];
    const pool = uaMatched.length > 0 ? uaMatched : candidates;
    const winner = pool.reduce((best, event) => (Date.parse(event.createdAt) > Date.parse(best.createdAt) ? event : best));

    matched.push({
      lineId: line.id,
      itemId: line.itemId,
      name: line.name,
      total: line.total,
      sessionId: winner.sessionId,
    });
  }

  return matched;
}
