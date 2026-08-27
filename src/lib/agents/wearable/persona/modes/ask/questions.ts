/**
 * Every question this skill can ask, as data.
 *
 * The questions are written rather than generated. They fire on explicit, enumerable
 * conditions, the phrasing doesn't benefit from variation, and a model call here would add
 * latency to the one turn that returns no products at all — so this skill has no system prompt,
 * and `skills/ask.md` carries only its router description.
 *
 * This stays TypeScript rather than moving into that file because it is a lookup table keyed by
 * `MissingInfo` with per-question option lists, not prose: in YAML it would lose the exhaustive
 * `Record` check that guarantees every reason the router can give has a question to match.
 */

export type MissingInfo = "category" | "budget" | "occasion" | "size" | "scope";

export interface AskQuestion {
  question: string;
  quickOptions: string[];
}

export const QUESTIONS: Record<MissingInfo, AskQuestion> = {
  category: {
    question: "Happy to help — what kind of piece are you after?",
    quickOptions: ["Tops", "Bottoms", "Outerwear", "Shoes", "A full outfit"],
  },
  occasion: {
    question: "What's the occasion, and how dressed up are you thinking?",
    quickOptions: ["Everyday casual", "Work", "Smart evening", "Formal event", "Sport or outdoors"],
  },
  budget: {
    question: "Any budget range I should stay within?",
    quickOptions: ["Under $50", "$50–150", "$150–300", "No strict limit"],
  },
  size: {
    question: "What size should I be looking for?",
    quickOptions: ["XS", "S", "M", "L", "XL"],
  },
  scope: {
    question: "Let's narrow it down — is this for one piece, or a full look?",
    quickOptions: ["Just one piece", "A full outfit"],
  },
};

