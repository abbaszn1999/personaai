import type { AgentEvent } from "../types";

const TEXT_STREAM_TICK_MS = 12;

/** Replays an already-complete reply word by word. Structured calls return the whole reply at
 *  once; pacing it keeps the chat feeling live without a second streaming call. */
export async function* textEvents(text: string): AsyncGenerator<AgentEvent> {
  for (const piece of text.match(/\S+\s*/g) ?? []) {
    yield { type: "text", delta: piece };
    await new Promise((resolve) => setTimeout(resolve, TEXT_STREAM_TICK_MS));
  }
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return "an unknown price";
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return currency ? `${currency} ${amount}` : amount;
}

/** Quick options are tappable replies — short, distinct, never more than four. */
export function cleanQuickOptions(options: readonly (string | null | undefined)[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of options ?? []) {
    const text = option?.trim();
    if (!text || text.length > 48 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    result.push(text);
    if (result.length === 4) break;
  }
  return result;
}
