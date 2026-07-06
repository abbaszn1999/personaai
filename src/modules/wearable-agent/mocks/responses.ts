import type { ChatMessage } from "@/modules/shopping-agent/types";
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";

export const INITIAL_WEARABLE_MESSAGE: ChatMessage = {
  id: "msg-wearable-init",
  role: "assistant",
  content:
    "Hi! I'm your personal style assistant. Based on your body profile I can recommend clothes that will fit you perfectly. What are you looking to wear today?",
  timestamp: new Date().toISOString(),
};

export type WearableQuickReply = { label: string; query: string };

export const WEARABLE_QUICK_REPLIES: WearableQuickReply[] = [
  { label: "Show me dresses",       query: "Show me dresses" },
  { label: "Men's shirts",          query: "Find me a nice shirt" },
  { label: "Casual sneakers",       query: "I need casual sneakers" },
  { label: "What's trending?",      query: "What's trending right now?" },
  { label: "Generate try-on",       query: "Generate a try-on preview" },
];

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

export const MOCK_TRY_ON_IMAGES = [
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600",
  "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=600",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600",
];
