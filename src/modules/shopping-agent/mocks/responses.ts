"use client";

import type { ChatMessage } from "@/modules/shopping-agent/types";

// Cosmetic client-side constants for the Shopping Assistant UI. The actual replies,
// recommendations, and bundles all come from the real unwearable chat agent now
// (src/lib/agents/unwearable-chat-agent) — this file only keeps the pieces that are
// pure presentation: the first message shown before any turn, and the scanning
// animation's stage labels.

// ─── Catalog scanning (UI animation labels only) ─────────────────────────────

export const SCAN_STAGES = [
  "Scanning catalog…",
  "Filtering by budget…",
  "Ranking by relevance…",
  "Matching top picks…",
  "Preparing your solutions…",
] as const;

export const SCAN_STAGE_DURATION_MS = 600;

// ─── Initial message ─────────────────────────────────────────────────────────

const DEFAULT_WELCOME = "Hey! I'm your AI Shopping Assistant. What are you looking for today?";

export const INITIAL_QUICK_OPTIONS = [
  "Fix a tech problem",
  "Home office setup",
  "Gaming setup",
  "Smart home / networking",
];

/** The first assistant bubble, shown before any real agent turn — merchants can override the
 *  copy via branding's welcome message. Uses a fixed sentinel timestamp (rather than
 *  `new Date()`) because this message is baked into the component's initial state and thus
 *  rendered during SSR — a live "now" here would differ between the server's render pass and
 *  the client's hydration pass (even by a few ms), causing a text-content hydration mismatch.
 *  The chat UI hides the timestamp for this specific message id instead of showing "now". */
export function buildInitialMessage(welcomeMessage?: string): ChatMessage {
  return {
    id: "msg-init",
    role: "assistant",
    content: welcomeMessage?.trim() || DEFAULT_WELCOME,
    timestamp: new Date(0).toISOString(),
    quickOptions: INITIAL_QUICK_OPTIONS,
  };
}
