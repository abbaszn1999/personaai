import type { ChatMessage } from "@/modules/commerce/types";

export const INITIAL_WEARABLE_MESSAGE: ChatMessage = {
  id: "msg-wearable-init",
  role: "assistant",
  content: "Hi, I'm your Style Assistant. Tell me what you're shopping for and I'll find it in this store.",
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
 * Labels cycled only while the outfit agent reports it is composing looks — its real phases:
 * allocate, search every slot, compose, verify.
 */
export const SCAN_STAGES = [
  "Allocating your budget across the pieces…",
  "Finding options for every piece…",
  "Styling coordinated complete looks…",
  "Checking prices and stock…",
] as const;

export const SCAN_STAGE_DURATION_MS = 650;
