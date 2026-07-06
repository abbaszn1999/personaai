"use client";

import * as React from "react";
import type { ChatMessage } from "@/modules/shopping-agent/types";
import { INITIAL_MESSAGE, getMockResponse } from "../mocks/responses";

export function useShoppingAgent() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [recommendedProductIds, setRecommendedProductIds] = React.useState<string[]>([]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setIsTyping(true);

    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
    const response = getMockResponse(content);
    setIsTyping(false);
    setMessages((m) => [...m, response]);
    if (response.productRecommendations?.length) {
      setRecommendedProductIds(response.productRecommendations);
    }
  }

  function clearRecommendations() { setRecommendedProductIds([]); }

  return { messages, input, setInput, isTyping, sendMessage, recommendedProductIds, clearRecommendations };
}
