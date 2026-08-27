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

/**
 * Labels cycled only while the server explicitly reports a complete-bundle build in flight.
 *
 * These are the real pipeline phases, not labels attached to every search_catalog tool call.
 */
export const SCAN_STAGES = [
  "Finding options for every piece…",
  "Allocating your budget across categories…",
  "Styling coordinated complete looks…",
  "Preparing your bundle cards…",
] as const;

export const SCAN_STAGE_DURATION_MS = 650;
