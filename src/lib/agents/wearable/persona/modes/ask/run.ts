import type { RetrievalContext, RetrievalResult } from "@/lib/retrieval/types";
import { QUESTIONS, type MissingInfo } from "./questions";

/**
 * Asks for the one thing that has to be known before any other mode can act.
 *
 * One question per turn, never a checklist — a multi-question ask reads as a form rather than
 * a conversation, and a shopper who wanted to fill in a form would have used the filters.
 */

export type { MissingInfo };

export function askForMissingInfo(missing: MissingInfo | undefined, context: RetrievalContext): RetrievalResult {
  // Default to category: it is the constraint every other mode needs, and the one whose
  // absence makes a request unanswerable rather than merely broad.
  const key: MissingInfo = missing ?? "category";
  const { question, quickOptions } = QUESTIONS[key] ?? QUESTIONS.category;

  return {
    mode: "ask_info",
    products: [],
    question,
    quickOptions,
    anchor: context.anchor,
    bundleState: context.bundle,
  };
}
