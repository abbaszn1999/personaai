import type { ChatMessage } from "@/modules/shopping-agent/types";

export const INITIAL_WEARABLE_MESSAGE: ChatMessage = {
  id: "msg-wearable-init",
  role: "assistant",
  content: "Hi Alex, I'm your Style Assistant. Let's find you the perfect look — I just need a few quick details.",
  timestamp: new Date().toISOString(),
};

export type WearableQuickReply = { label: string; query: string };

// Kept gender-neutral on purpose — the profile doesn't track gender, so these must read
// naturally for any shopper rather than assuming a "Men's shirts" / "Show me dresses" split.
export const WEARABLE_QUICK_REPLIES: WearableQuickReply[] = [
  { label: "Build a full outfit bundle", query: "Can you build me a full outfit bundle?" },
  { label: "Find me a jacket",      query: "Find me a jacket" },
  { label: "Everyday shirt",        query: "Find me a nice shirt" },
  { label: "Casual sneakers",       query: "I need casual sneakers" },
  { label: "What's trending?",      query: "What's trending right now?" },
];

/** Labels cycled through while a search_catalog tool call is in flight, so the shopper sees
 *  a concrete sense of progress instead of a generic spinner. */
export const SCAN_STAGES = [
  "Scanning the catalog…",
  "Matching your style profile…",
  "Filtering by budget…",
  "Ranking best fits for your body type…",
] as const;

export const SCAN_STAGE_DURATION_MS = 650;
