"use client";

import type { ChatMessage, BundleSuggestion } from "@/modules/shopping-agent/types";
import { MOCK_UNWEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";

// ─── Intake Q&A ─────────────────────────────────────────────────────────────

export interface ShoppingIntakeQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export type ShoppingIntakeAnswers = {
  useCase?: string;
  budget?: string;
  priority?: string;
};

export const INTAKE_QUESTIONS: ShoppingIntakeQuestion[] = [
  {
    id: "useCase",
    prompt: "Hey! I'm your AI Shopping Assistant. What are you looking for today?",
    options: [
      "Fix a tech problem",
      "Home office setup",
      "Gaming setup",
      "Smart home / networking",
      "Kitchen & home appliances",
      "Just browsing",
    ],
  },
  {
    id: "budget",
    prompt: "What's your budget?",
    options: [
      "Under $100",
      "$100 – $300",
      "$300 – $600",
      "$600 – $1,000",
      "No limit",
    ],
  },
  {
    id: "priority",
    prompt: "What matters most to you?",
    options: [
      "Best value for money",
      "Top-rated quality",
      "Specific brand (Apple / Samsung)",
      "Latest & greatest",
    ],
  },
];

export function getIntakeQuestionMessage(q: ShoppingIntakeQuestion): ChatMessage {
  return {
    id: `intake-${q.id}-${Date.now()}`,
    role: "assistant",
    content: q.prompt,
    timestamp: new Date().toISOString(),
    quickOptions: q.options,
  };
}

// ─── Catalog scanning ────────────────────────────────────────────────────────

export const SCAN_STAGES = [
  "Scanning catalog…",
  "Filtering by budget…",
  "Ranking by relevance…",
  "Matching top picks…",
  "Preparing your solutions…",
] as const;

export const SCAN_STAGE_DURATION_MS = 600;

// ─── Topic detection ─────────────────────────────────────────────────────────

export type ShoppingTopic =
  | "WiFi & Networking"
  | "Home Office"
  | "Gaming Setup"
  | "Laptop & Computing"
  | "Smartphones"
  | "Audio & Sound"
  | "Kitchen & Home"
  | "General Electronics";

export function detectTopic(answers: ShoppingIntakeAnswers): ShoppingTopic {
  const uc = answers.useCase?.toLowerCase() ?? "";
  if (uc.includes("network") || uc.includes("smart home")) return "WiFi & Networking";
  if (uc.includes("home office")) return "Home Office";
  if (uc.includes("gaming")) return "Gaming Setup";
  if (uc.includes("kitchen")) return "Kitchen & Home";
  if (uc.includes("tech problem")) return "Laptop & Computing";
  return "General Electronics";
}

export function parseBudgetMax(budget: string): number {
  if (budget.includes("100")) return 100;
  if (budget.includes("300")) return 300;
  if (budget.includes("600")) return 600;
  if (budget.includes("1,000") || budget.includes("1000")) return 1000;
  return 99999;
}

// ─── Bundles ─────────────────────────────────────────────────────────────────

export interface ShoppingBundle {
  id: string;
  label: string;
  description: string;
  productIds: string[];
  tags: string[];
}

export const SHOPPING_BUNDLES: ShoppingBundle[] = [
  {
    id: "bundle-network",
    label: "Complete WiFi Upgrade Kit",
    description: "Mesh router + switch for full-home coverage",
    productIds: ["p-u-020", "p-u-022"],
    tags: ["network", "wifi", "router"],
  },
  {
    id: "bundle-office",
    label: "Home Office Starter Pack",
    description: "Monitor + keyboard/mouse combo + lighting",
    productIds: ["p-u-030", "p-u-031", "p-u-032"],
    tags: ["home-office", "office", "work"],
  },
  {
    id: "bundle-gaming",
    label: "Gaming Command Center",
    description: "Curved monitor + headset + precision mouse",
    productIds: ["p-u-042", "p-u-040", "p-u-041"],
    tags: ["gaming", "esports", "setup"],
  },
  {
    id: "bundle-macbook",
    label: "MacBook Productivity Pack",
    description: "MacBook Air + AirPods Pro + MX Keys Combo",
    productIds: ["p-u-002", "p-u-012", "p-u-031"],
    tags: ["apple", "laptop", "productivity"],
  },
];

// ─── Recommendation logic ─────────────────────────────────────────────────────

function pickProductIds(answers: ShoppingIntakeAnswers): string[] {
  const topic = detectTopic(answers);
  const maxBudget = parseBudgetMax(answers.budget ?? "No limit");

  const pool: Record<ShoppingTopic, string[]> = {
    "WiFi & Networking":    ["p-u-020", "p-u-021", "p-u-022"],
    "Home Office":          ["p-u-030", "p-u-031", "p-u-032"],
    "Gaming Setup":         ["p-u-042", "p-u-040", "p-u-041"],
    "Laptop & Computing":   ["p-u-002", "p-u-011", "p-u-003"],
    "Smartphones":          ["p-u-001", "p-u-010", "p-u-012"],
    "Audio & Sound":        ["p-u-003", "p-u-012"],
    "Kitchen & Home":       ["p-u-013", "p-u-004"],
    "General Electronics":  ["p-u-001", "p-u-003", "p-u-020"],
  };

  const candidates = pool[topic] ?? pool["General Electronics"];
  return candidates.filter((id) => {
    const p = MOCK_UNWEARABLE_PRODUCTS.find((x) => x.id === id);
    return p ? p.price <= maxBudget : false;
  });
}

function bundleForTopic(answers: ShoppingIntakeAnswers): ShoppingBundle | null {
  const topic = detectTopic(answers);
  return (
    SHOPPING_BUNDLES.find((b) =>
      b.tags.some((t) =>
        topic.toLowerCase().includes(t) || t.includes(topic.toLowerCase().split(" ")[0])
      )
    ) ?? null
  );
}

export function buildRecommendationMessage(answers: ShoppingIntakeAnswers): ChatMessage {
  const topic = detectTopic(answers);
  const productIds = pickProductIds(answers);
  const bundle = bundleForTopic(answers);

  const bundleSuggestion: BundleSuggestion | undefined = bundle
    ? { id: bundle.id, label: bundle.label, productIds: bundle.productIds }
    : undefined;

  return {
    id: `rec-${Date.now()}`,
    role: "assistant",
    content: `Based on your needs, I've found the best picks for **${topic}** within your budget. Here's what I recommend:`,
    timestamp: new Date().toISOString(),
    productRecommendations: productIds,
    quickOptions: ["Build a complete solution kit", "Show me alternatives", "Adjust my budget"],
    bundles: bundleSuggestion ? [bundleSuggestion] : undefined,
  };
}

// ─── Free-text response fallback ─────────────────────────────────────────────

export const INITIAL_MESSAGE: ChatMessage = {
  id: "msg-init",
  role: "assistant",
  content: "Hey! I'm your AI Shopping Assistant. What are you looking for today?",
  timestamp: new Date().toISOString(),
  quickOptions: [
    "Fix a tech problem",
    "Home office setup",
    "Gaming setup",
    "Smart home / networking",
  ],
};

export const QUICK_REPLIES = [
  { label: "WiFi issues at home",  query: "I have WiFi issues at home" },
  { label: "Set up home office",   query: "I want to set up a home office" },
  { label: "Gaming setup",         query: "I need a gaming setup" },
  { label: "Best laptop for work", query: "Best laptop for remote work" },
];

export function getMockResponse(query: string): ChatMessage {
  const q = query.toLowerCase();

  if (q.includes("smartphone") || q.includes("phone") || q.includes("iphone")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "Great choice! Here are the top smartphones in our catalog — the iPhone 16 Pro for Apple fans and the Galaxy S25 Ultra for Android lovers.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-001", "p-u-010"],
      quickOptions: ["Add earbuds to match", "Show me cases", "Compare both"],
    };
  }
  if (q.includes("laptop") || q.includes("macbook") || q.includes("computer")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "For laptops, I recommend the MacBook Air M3 for Apple users or the Dell XPS 15 for Windows power users. Both have exceptional displays and all-day battery.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-002", "p-u-011"],
      quickOptions: ["Bundle with accessories", "Just the laptop", "What about budget options?"],
    };
  }
  if (q.includes("audio") || q.includes("headphone") || q.includes("sound") || q.includes("earb")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "For audio, the Sony WH-1000XM5 leads for over-ear noise cancellation, and the AirPods Pro 2 are unbeatable for Apple ecosystem users.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-003", "p-u-012"],
      quickOptions: ["Which is better for commuting?", "Show me gaming headsets"],
    };
  }
  if (q.includes("wifi") || q.includes("network") || q.includes("internet") || q.includes("router")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "WiFi issues? The TP-Link Deco mesh system eliminates dead zones across your whole home. Pair it with a Gigabit switch for wired connections.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-020", "p-u-021", "p-u-022"],
      quickOptions: ["Build the complete kit", "Just the router", "What's the difference?"],
      bundles: [{ id: "bundle-network", label: "Complete WiFi Upgrade Kit", productIds: ["p-u-020", "p-u-022"] }],
    };
  }
  if (q.includes("office") || q.includes("work") || q.includes("desk") || q.includes("monitor")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "For a home office, I've put together the ultimate setup: a 4K monitor, ergonomic keyboard & mouse combo, and professional lighting — everything you need to work like a pro.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-030", "p-u-031", "p-u-032"],
      quickOptions: ["Add it all to cart", "Just the monitor", "Budget options?"],
      bundles: [{ id: "bundle-office", label: "Home Office Starter Pack", productIds: ["p-u-030", "p-u-031", "p-u-032"] }],
    };
  }
  if (q.includes("gaming") || q.includes("gam") || q.includes("esport")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "Let's build your gaming command center. A curved 165Hz monitor, wireless headset, and the lightest pro mouse on the market.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-042", "p-u-040", "p-u-041"],
      quickOptions: ["Build the full kit", "Just the monitor", "Budget gaming setup"],
      bundles: [{ id: "bundle-gaming", label: "Gaming Command Center", productIds: ["p-u-042", "p-u-040", "p-u-041"] }],
    };
  }
  if (q.includes("kitchen") || q.includes("home") || q.includes("appliance") || q.includes("vacuum")) {
    return {
      id: `msg-${Date.now()}`, role: "assistant",
      content: "For home and kitchen, the Instant Pot is a must-have (7 appliances in 1!) and the Dyson V15 is the gold standard for cordless vacuums.",
      timestamp: new Date().toISOString(),
      productRecommendations: ["p-u-013", "p-u-004"],
      quickOptions: ["Tell me more about the Instant Pot", "Anything under $100?"],
    };
  }

  return {
    id: `msg-${Date.now()}`, role: "assistant",
    content: "I'd love to help! Could you tell me a bit more? Are you looking to fix a specific problem, set up a workspace, or upgrade your gear?",
    timestamp: new Date().toISOString(),
    quickOptions: ["Fix WiFi issues", "Home office gear", "Gaming setup", "Kitchen appliances"],
  };
}
