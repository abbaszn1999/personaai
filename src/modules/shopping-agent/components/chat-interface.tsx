"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { useShoppingAgent } from "../hooks/use-shopping-agent";
import { ChatMessageBubble, TypingIndicator } from "./chat-message";
import { ProductRecommendationCard } from "./product-recommendation-card";
import { QUICK_REPLIES } from "../mocks/responses";
import { MOCK_UNWEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import { Button } from "@/components/ui/button";
import { AgentOrb } from "@/components/ui/agent-orb";

export function ChatInterface() {
  const agent = useShoppingAgent();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.messages, agent.isTyping]);

  const recommendedProducts = MOCK_UNWEARABLE_PRODUCTS.filter((p) =>
    agent.recommendedProductIds.includes(p.id)
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full min-h-[600px]">
      {/* Chat panel */}
      <div className="flex-1 flex flex-col card-base overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <AgentOrb mode="unwearable" size="sm" animated />
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Shopping Assistant</div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
              <span className="text-xs text-[var(--color-text-muted)]">Online</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {agent.messages.map((msg) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))}
          {agent.isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        {agent.messages.length <= 2 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {QUICK_REPLIES.map((qr) => (
              <button
                key={qr.label}
                onClick={() => agent.sendMessage(qr.query)}
                className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex gap-2">
          <input
            className="flex-1 h-9 px-3 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-full)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] transition-colors"
            placeholder="Ask about products…"
            value={agent.input}
            onChange={(e) => agent.setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
            disabled={agent.isTyping}
          />
          <Button
            size="icon"
            onClick={() => agent.sendMessage()}
            disabled={!agent.input.trim() || agent.isTyping}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Recommendations panel */}
      <div className="w-full lg:w-72 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {recommendedProducts.length > 0 ? "Recommended for You" : "Featured Products"}
        </h3>
        <div className="space-y-3 overflow-y-auto">
          {(recommendedProducts.length > 0 ? recommendedProducts : MOCK_UNWEARABLE_PRODUCTS.slice(0, 2)).map(
            (product) => (
              <ProductRecommendationCard key={product.id} product={product} />
            )
          )}
        </div>
      </div>
    </div>
  );
}
