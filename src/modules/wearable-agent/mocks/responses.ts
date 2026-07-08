import type { BundleSuggestion, ChatMessage } from "@/modules/shopping-agent/types";
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";

export const INITIAL_WEARABLE_MESSAGE: ChatMessage = {
  id: "msg-wearable-init",
  role: "assistant",
  content: "Hi Alex, I'm your Style Assistant. Let's find you the perfect look — I just need a few quick details.",
  timestamp: new Date().toISOString(),
};

export type WearableQuickReply = { label: string; query: string };

export const WEARABLE_QUICK_REPLIES: WearableQuickReply[] = [
  { label: "Build a full outfit bundle", query: "Can you build me a full outfit bundle?" },
  { label: "Show me dresses",       query: "Show me dresses" },
  { label: "Men's shirts",          query: "Find me a nice shirt" },
  { label: "Casual sneakers",       query: "I need casual sneakers" },
  { label: "What's trending?",      query: "What's trending right now?" },
];

// ─── Intake Q&A — professional "ask mode" before any recommendations ──────────

export interface IntakeQuestion {
  id: "occasion" | "style" | "budget";
  prompt: string;
  options: string[];
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: "occasion",
    prompt: "First — what's the occasion you're shopping for?",
    options: ["Business meeting", "Casual weekend", "Date night", "Wedding guest"],
  },
  {
    id: "style",
    prompt: "Got it. What style do you gravitate toward?",
    options: ["Classic & polished", "Smart casual", "Streetwear", "Minimal & clean"],
  },
  {
    id: "budget",
    prompt: "Last one — what's your budget for this look?",
    options: ["Under $300", "$300 – $600", "$600 – $1,000", "No limit"],
  },
];

export function getIntakeQuestionMessage(index: number): ChatMessage {
  const question = INTAKE_QUESTIONS[index];
  return {
    id: `msg-intake-${question.id}`,
    role: "assistant",
    content: question.prompt,
    timestamp: new Date().toISOString(),
    quickOptions: question.options,
  };
}

// ─── Scanning sequence — professional "searching the catalog" moment ──────────

export const SCAN_STAGES = [
  "Scanning 12,400+ SKUs…",
  "Matching your style profile…",
  "Filtering by budget…",
  "Ranking best fits for your body type…",
] as const;

export const SCAN_STAGE_DURATION_MS = 650;

// ─── Personalized recommendations, derived from the intake answers ────────────

export type IntakeAnswers = Partial<Record<IntakeQuestion["id"], string>>;

function pickProductIdsForAnswers(answers: IntakeAnswers): string[] {
  const occasion = (answers.occasion ?? "").toLowerCase();
  if (occasion.includes("business") || occasion.includes("wedding")) {
    return ["p-w-005", "p-w-002", "p-w-008"]; // blazer, oxford shirt, derby shoes
  }
  if (occasion.includes("date")) {
    return ["p-w-002", "p-w-004", "p-w-008"]; // shirt, chinos, derby shoes
  }
  return ["p-w-006", "p-w-007", "p-w-003"]; // tee, jeans, sneakers
}

export function buildRecommendationMessage(answers: IntakeAnswers): ChatMessage {
  const occasion = answers.occasion?.toLowerCase() ?? "your occasion";
  const style = answers.style ? ` with a ${answers.style.toLowerCase()} edge` : "";
  const budgetNote = answers.budget ? ` — all within your ${answers.budget} budget` : "";
  const productIds = pickProductIdsForAnswers(answers);

  return {
    id: `msg-rec-${Date.now()}`,
    role: "assistant",
    content: `Perfect — I scanned the catalog and found some great pieces for ${occasion}${style}${budgetNote}. Tap "Add to Cart" to buy, or "Wear It" to see it on your avatar instantly.`,
    timestamp: new Date().toISOString(),
    productRecommendations: productIds,
    quickOptions: ["Build a full outfit bundle", "Just show me these items"],
  };
}

// ─── Bundle suggestions — complete, multi-item curated looks ──────────────────

export const MOCK_BUNDLES: BundleSuggestion[] = [
  {
    id: "bundle-executive",
    label: "Modern Executive",
    productIds: ["p-w-005", "p-w-002", "p-w-004", "p-w-008"],
  },
  {
    id: "bundle-weekend",
    label: "Weekend Edit",
    productIds: ["p-w-006", "p-w-007", "p-w-003"],
  },
  {
    id: "bundle-essentials",
    label: "Smart Essentials",
    productIds: ["p-w-006", "p-w-007"],
  },
];

export function getBundleSuggestionMessage(): ChatMessage {
  return {
    id: `msg-bundle-${Date.now()}`,
    role: "assistant",
    content:
      `Great call — here are curated looks I've put together for you. Hit "Render Full Look" to see the whole outfit on your avatar, or add everything to your cart in one tap.`,
    timestamp: new Date().toISOString(),
    bundles: MOCK_BUNDLES,
  };
}

export function getWearableMockResponse(query: string): ChatMessage {
  const q = query.toLowerCase();

  if (q.includes("dress") || q.includes("women") || q.includes("summer")) {
    const dress = MOCK_WEARABLE_PRODUCTS.find((p) => p.id === "p-w-001");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Great choice! The ${dress?.name} is one of our bestsellers for summer occasions. It features a flattering wrap silhouette — perfect for your measurements. Add it to your outfit, then ask me to generate a try-on!`,
      timestamp: new Date().toISOString(),
      productRecommendations: dress ? [dress.id] : [],
    };
  }

  if (q.includes("shirt") || q.includes("men") || q.includes("oxford") || q.includes("office")) {
    const shirt = MOCK_WEARABLE_PRODUCTS.find((p) => p.id === "p-w-002");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `I recommend the ${shirt?.name} for a polished look. The crisp cotton fabric and classic cut suit a wide range of body shapes. Add it to your outfit and ask me to try it on!`,
      timestamp: new Date().toISOString(),
      productRecommendations: shirt ? [shirt.id] : [],
    };
  }

  if (q.includes("sneaker") || q.includes("shoe") || q.includes("shoes") || q.includes("casual")) {
    const shoe = MOCK_WEARABLE_PRODUCTS.find((p) => p.id === "p-w-003");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `The ${shoe?.name} are a perfect everyday essential — clean, minimal, and go with almost anything. I'd suggest pairing them with the Oxford Shirt for a smart-casual combo. Add them to your outfit, then ask me to generate a try-on!`,
      timestamp: new Date().toISOString(),
      productRecommendations: shoe ? [shoe.id] : [],
    };
  }

  if (q.includes("trend") || q.includes("popular") || q.includes("best")) {
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Right now the most popular combinations are: a classic oxford shirt paired with white sneakers for a smart-casual look, or a floral wrap dress for a summer-ready outfit. Want me to pull any of these up for you?`,
      timestamp: new Date().toISOString(),
      productRecommendations: MOCK_WEARABLE_PRODUCTS.map((p) => p.id),
    };
  }

  if (q.includes("try") || q.includes("generate") || q.includes("preview") || q.includes("photo")) {
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Sure! Once you have items in your outfit panel, just ask me to generate a try-on and I'll create a realistic preview showing how everything looks on you.`,
      timestamp: new Date().toISOString(),
    };
  }

  if (q.includes("just show") || q.includes("just these") || q.includes("no thanks")) {
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Sounds good! Whenever you're ready, tap "Wear It" on any piece to preview it on your avatar, or ask me for sizing help.`,
      timestamp: new Date().toISOString(),
    };
  }

  if (q.includes("size") || q.includes("fit") || q.includes("measurement")) {
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Based on your body profile, I can suggest the best sizes for each item. Generally: for tops and dresses look at your chest/waist measurements, for shoes look at your foot size. When you generate a try-on I'll include a personalized size recommendation!`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `I'd love to help you find the perfect outfit! Tell me more about the occasion — are you looking for something casual, formal, or sporty? I can also suggest items based on your body profile to ensure the best fit.`,
    timestamp: new Date().toISOString(),
  };
}

/** Full studio photos used as generated try-on results (same visual class as onboarding avatars). */
export const MOCK_TRY_ON_IMAGES = [
  "/avatars/avatar-studio-male-1.png",
  "/avatars/avatar-studio-male-2.png",
  "/avatars/avatar-studio-female-1.png",
  "/avatars/avatar-studio-female-2.png",
];
