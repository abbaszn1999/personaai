import type { ChatMessage } from "@/modules/shopping-agent/types";
import { MOCK_UNWEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";

export const INITIAL_MESSAGE: ChatMessage = {
  id: "msg-init",
  role: "assistant",
  content:
    "Hi! I'm your AI shopping assistant. I can help you find the perfect product from our catalog. What are you looking for today?",
  timestamp: new Date().toISOString(),
};

type QuickReply = { label: string; query: string };

export const QUICK_REPLIES: QuickReply[] = [
  { label: "Show me smartphones",   query: "Show me smartphones" },
  { label: "I need a laptop",       query: "I need a laptop" },
  { label: "Best audio gear",       query: "What are your best audio products?" },
  { label: "Home appliances",       query: "Show me home appliances" },
];

export function getMockResponse(query: string): ChatMessage & { productIds?: string[] } {
  const q = query.toLowerCase();
  if (q.includes("smartphone") || q.includes("phone") || q.includes("iphone")) {
    const phone = MOCK_UNWEARABLE_PRODUCTS.find((p) => p.categoryId === "cat-u-001");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Great choice! Here's our top smartphone. The ${phone?.name} features a cutting-edge chip and premium build quality. Based on your interest, I think you'll love it!`,
      timestamp: new Date().toISOString(),
      productRecommendations: phone ? [phone.id] : [],
    };
  }
  if (q.includes("laptop") || q.includes("macbook") || q.includes("computer")) {
    const laptop = MOCK_UNWEARABLE_PRODUCTS.find((p) => p.categoryId === "cat-u-002");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `Looking for a laptop? I recommend the ${laptop?.name} — it offers exceptional performance for both work and creative tasks with all-day battery life.`,
      timestamp: new Date().toISOString(),
      productRecommendations: laptop ? [laptop.id] : [],
    };
  }
  if (q.includes("audio") || q.includes("headphone") || q.includes("sound")) {
    const audio = MOCK_UNWEARABLE_PRODUCTS.find((p) => p.categoryId === "cat-u-004");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `For audio, I highly recommend the ${audio?.name}. Industry-leading noise cancellation makes these perfect for focused work or music enjoyment.`,
      timestamp: new Date().toISOString(),
      productRecommendations: audio ? [audio.id] : [],
    };
  }
  if (q.includes("home") || q.includes("appliance") || q.includes("vacuum")) {
    const appliance = MOCK_UNWEARABLE_PRODUCTS.find((p) => p.categoryId === "cat-u-003");
    return {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: `For home appliances, check out the ${appliance?.name}. It's a top-rated product with innovative technology that makes household tasks effortless.`,
      timestamp: new Date().toISOString(),
      productRecommendations: appliance ? [appliance.id] : [],
    };
  }
  return {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content: `I'd be happy to help with that! Could you tell me more about what you're looking for? For example, are you interested in electronics, home appliances, or something else?`,
    timestamp: new Date().toISOString(),
  };
}
