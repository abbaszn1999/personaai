"use client";

import * as React from "react";
import Image from "next/image";
import { Send, X, Shirt } from "lucide-react";
import type { UseTryOnAgentReturn } from "../hooks/use-try-on-agent";
import { WearableChatMessage, WearableTypingIndicator } from "./wearable-chat-message";
import { TryOnPreviewPanel } from "./try-on-preview-panel";
import { WEARABLE_QUICK_REPLIES } from "../mocks/responses";
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import { Button } from "@/components/ui/button";
import { AgentOrb } from "@/components/ui/agent-orb";
import { cn } from "@/lib/utils/cn";

interface TryOnAgentChatProps {
  agent: UseTryOnAgentReturn;
}

export function TryOnAgentChat({ agent }: TryOnAgentChatProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.messages, agent.isTyping]);

  const outfitItemIds = agent.outfitItems.map((o) => o.id);

  return (
    <div className="flex gap-4 h-full min-h-[600px]">

      {/* ── Chat panel (left) ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col card-base overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <AgentOrb mode="wearable" size="sm" animated />
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Style Assistant</div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
              <span className="text-xs text-[var(--color-text-muted)]">
                Online — personalised for your profile
              </span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {agent.messages.map((msg) => {
            const msgProducts = MOCK_WEARABLE_PRODUCTS.filter((p) =>
              (msg.productRecommendations ?? []).includes(p.id)
            );
            return (
              <WearableChatMessage
                key={msg.id}
                message={msg}
                inlineProducts={msgProducts.length > 0 ? msgProducts : undefined}
                outfitItemIds={outfitItemIds}
                onAddToOutfit={agent.addToOutfit}
              />
            );
          })}
          {agent.isTyping && <WearableTypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        {agent.messages.length <= 2 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
            {WEARABLE_QUICK_REPLIES.map((qr) => (
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
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex gap-2 shrink-0">
          <input
            className="flex-1 h-9 px-3 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-full)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] transition-colors"
            placeholder="Ask about clothes, style, sizing…"
            value={agent.input}
            onChange={(e) => agent.setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
            disabled={agent.isTyping || agent.isGenerating}
          />
          <Button
            size="icon"
            onClick={() => agent.sendMessage()}
            disabled={!agent.input.trim() || agent.isTyping || agent.isGenerating}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Right column: Preview (large) + Outfit strip (small) ──── */}
      <div className="w-[640px] shrink-0 flex flex-col gap-3">

        {/* Try-On Preview — fills available height */}
        <div className="flex-1 card-base p-4 min-h-0">
          <TryOnPreviewPanel
            tryOnImages={agent.tryOnImages}
            currentImageIndex={agent.currentImageIndex}
            currentTryOn={agent.currentTryOn}
            isGenerating={agent.isGenerating}
            onPrev={agent.prevImage}
            onNext={agent.nextImage}
          />
        </div>

        {/* Outfit strip — compact thumbnails only */}
        <OutfitStrip
          items={agent.outfitItems}
          onRemove={agent.removeFromOutfit}
        />
      </div>
    </div>
  );
}

/* ── Compact outfit strip ──────────────────────────────────────────────── */

function OutfitStrip({
  items,
  onRemove,
}: {
  items: UseTryOnAgentReturn["outfitItems"];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card-base px-3 py-2.5 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 w-5 rounded-md gradient-wearable flex items-center justify-center">
          <Shirt className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Outfit</span>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {items.length === 0 ? "Empty" : `${items.length} item${items.length > 1 ? "s" : ""}`}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center h-10 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)]">
          <p className="text-[11px] text-[var(--color-text-muted)]">Add items from the chat</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((product) => (
            <div key={product.id} className="relative group">
              <div className="relative h-12 w-12 rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface-base)] border border-[var(--color-border)]">
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              {/* Remove on hover */}
              <button
                onClick={() => onRemove(product.id)}
                className={cn(
                  "absolute -top-1.5 -right-1.5 h-4.5 w-4.5 rounded-full bg-red-500 text-white",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "flex items-center justify-center"
                )}
                title={`Remove ${product.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-[var(--color-text-primary)] text-white text-[10px] px-2 py-1 rounded whitespace-nowrap max-w-[120px] truncate">
                  {product.name}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
