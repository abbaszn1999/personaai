"use client";

import * as React from "react";
import {
  ArrowUp,
  ChevronDown,
  GripVertical,
  LayoutPanelLeft,
  Loader2,
  Package,
  Search,
  ShoppingCart,
} from "lucide-react";
import { useShoppingAgent } from "../hooks/use-shopping-agent";
import { MOCK_UNWEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import { AgentOrb } from "@/components/ui/agent-orb";
import { SolutionBoard } from "./solution-board";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "../constants";
import type { ChatMessage, Product } from "../types";
import { SCAN_STAGES } from "../mocks/responses";
import type { PreviewViewportMode } from "@/modules/wearable-agent/components/preview-viewport-toggle";

interface ChatInterfaceProps {
  viewportMode?: PreviewViewportMode;
}

// ─── Drag-to-resize the solution board ───────────────────────────────────────
const BOARD_DEFAULT_W = 360;
const BOARD_MIN_W = 300;
const BOARD_MAX_W = 480;

function useResizableBoard() {
  const [width, setWidth] = React.useState(BOARD_DEFAULT_W);
  const [isDragging, setIsDragging] = React.useState(false);
  const startX = React.useRef(0);
  const startW = React.useRef(BOARD_DEFAULT_W);

  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    startW.current = width;
    setIsDragging(true);
  }, [width]);

  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = startX.current - e.clientX; // board grows left
    setWidth(Math.max(BOARD_MIN_W, Math.min(BOARD_MAX_W, startW.current + delta)));
  }, [isDragging]);

  const onPointerUp = React.useCallback(() => setIsDragging(false), []);

  return { width, isDragging, onPointerDown, onPointerMove, onPointerUp };
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ChatInterface({ viewportMode = "desktop" }: ChatInterfaceProps) {
  const agent = useShoppingAgent();
  const resizer = useResizableBoard();
  const isMobile = viewportMode === "mobile";

  function handleAddAllToCart() {
    agent.addAllBoardToCart();
  }

  if (isMobile) {
    return <MobileShoppingLayout agent={agent} onAddAllToCart={handleAddAllToCart} />;
  }

  // ── Desktop ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Chat panel */}
      <div className="flex-1 min-w-0 h-full min-h-0">
        <ShoppingChatPanel agent={agent} />
      </div>

      {/* Drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={resizer.onPointerDown}
        onPointerMove={resizer.onPointerMove}
        onPointerUp={resizer.onPointerUp}
        className="group relative w-4 shrink-0 cursor-col-resize flex items-center justify-center touch-none"
      >
        <div className={cn(
          "h-14 w-[5px] rounded-full transition-colors",
          resizer.isDragging
            ? "bg-[var(--color-brand)]"
            : "bg-[var(--color-border)] group-hover:bg-[var(--color-brand)]/60"
        )} />
        <GripVertical className={cn(
          "absolute h-4 w-4 pointer-events-none transition-opacity",
          resizer.isDragging ? "opacity-100 text-[var(--color-brand)]" : "opacity-0 group-hover:opacity-60 text-[var(--color-text-muted)]"
        )} />
      </div>

      {/* Solution board */}
      <div
        style={{ width: resizer.width }}
        className="shrink-0 h-full min-h-0 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] overflow-hidden"
      >
        <div className="h-full overflow-y-auto p-4">
          <SolutionBoard
            topic={agent.topic}
            budget={agent.budget}
            solutionProducts={agent.solutionProducts}
            cartItemIdSet={agent.cartItemIdSet}
            onAddAllToCart={handleAddAllToCart}
            onRemove={agent.removeSolutionProduct}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Chat panel (shared by desktop and mobile) ────────────────────────────────
interface ShoppingChatPanelProps {
  agent: ReturnType<typeof useShoppingAgent>;
  compact?: boolean;
  onViewKit?: () => void;
}

function ShoppingChatPanel({ agent, compact = false, onViewKit }: ShoppingChatPanelProps) {
  const messagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.isTyping, agent.isScanning]);

  const canShowQuickReplies =
    agent.intakeIndex === null && !agent.isScanning && !agent.isTyping && agent.messages.length <= 2;

  return (
    <div className={cn(
      "flex flex-col h-full min-h-0 overflow-hidden",
      compact
        ? "bg-transparent"
        : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 shrink-0 border-b border-[var(--color-border)]",
        compact ? "px-3 py-3" : "px-5 py-4"
      )}>
        <AgentOrb mode="unwearable" size="sm" animated />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-[var(--color-brand)]">Shopping</span>
            <span className="text-base font-bold text-[var(--color-text-primary)]">Assistant</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
            <span className="text-xs text-[var(--color-text-muted)]">
              Online — finding the best solutions for you
            </span>
          </div>
        </div>
        {agent.solutionProducts.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--color-brand-light)] border border-[var(--color-brand)]/30 px-2.5 py-1">
            <Package className="h-3 w-3 text-[var(--color-brand)]" />
            <span className="text-[11px] font-bold text-[var(--color-brand)]">{agent.solutionProducts.length} items</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesRef} className={cn(
        "flex-1 overflow-y-auto space-y-4 min-h-0",
        compact ? "px-3 py-3" : "px-5 py-4"
      )}>
        {agent.messages.map((msg, idx) => {
          const msgProducts = MOCK_UNWEARABLE_PRODUCTS.filter((p) =>
            (msg.productRecommendations ?? []).includes(p.id)
          );
          return (
            <ShoppingChatMessage
              key={msg.id}
              message={msg}
              isLast={idx === agent.messages.length - 1}
              products={msgProducts}
              kitIdSet={agent.solutionProductIdSet}
              onAddToKit={agent.addToSolutionBoard}
              onQuickOption={agent.onQuickOption}
            />
          );
        })}
        {agent.isTyping && <ShoppingTypingIndicator />}
        {agent.isScanning && <ShoppingScanningIndicator stageIndex={agent.scanStageIndex} />}
      </div>

      {/* Quick replies (only early in conversation) */}
      {canShowQuickReplies && (
        <div className={cn("flex flex-wrap gap-2 shrink-0", compact ? "px-3 pb-2" : "px-5 pb-2")}>
          {["WiFi issues", "Home office setup", "Gaming gear", "Best laptop for work"].map((qr) => (
            <button key={qr} type="button" onClick={() => agent.onQuickOption(qr)}
              className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all">
              {qr}
            </button>
          ))}
        </div>
      )}

      {/* Kit strip — mobile only, shows when kit has items */}
      {onViewKit && agent.solutionProducts.length > 0 && (
        <button
          type="button"
          onClick={onViewKit}
          className="mx-3 mb-2 shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand)]/6 hover:bg-[var(--color-brand)]/10 transition-all"
        >
          <div className="h-7 w-7 rounded-lg gradient-brand flex items-center justify-center shrink-0">
            <Package className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[11px] text-[var(--color-text-muted)] leading-none mb-0.5">Solution Kit</p>
            <p className="text-[12px] font-bold text-[var(--color-text-primary)] leading-none">
              {agent.solutionProducts.length} item{agent.solutionProducts.length !== 1 ? "s" : ""} · {formatPrice(agent.solutionProducts.reduce((s, p) => s + p.price, 0), "USD")}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-[var(--color-brand)] flex items-center gap-1 shrink-0">
            View kit
            <ChevronDown className="h-3 w-3 -rotate-90" />
          </span>
        </button>
      )}

      {/* Input */}
      <div className={cn(
        "border-t border-[var(--color-border)] flex gap-2 shrink-0",
        compact ? "px-3 py-3" : "px-5 py-4"
      )}>
        <input
          className="flex-1 h-10 px-4 text-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-full)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand)] transition-colors"
          placeholder="Describe your need or problem…"
          value={agent.input}
          onChange={(e) => agent.setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agent.sendMessage()}
          disabled={agent.isTyping || agent.isScanning}
        />
        <button type="button" onClick={() => agent.sendMessage()}
          disabled={!agent.input.trim() || agent.isTyping || agent.isScanning}
          className="h-10 w-10 rounded-full gradient-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[var(--shadow-glow)] transition-all">
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Chat message bubble ──────────────────────────────────────────────────────
function ShoppingChatMessage({
  message,
  isLast,
  products,
  kitIdSet,
  onAddToKit,
  onQuickOption,
}: {
  message: ChatMessage;
  isLast: boolean;
  products: Product[];
  kitIdSet: Set<string>;
  onAddToKit: (p: Product) => void;
  onQuickOption: (label: string) => void;
}) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={cn("flex gap-3", isAssistant ? "flex-row" : "flex-row-reverse")}>
      {isAssistant && (
        <div className="h-7 w-7 shrink-0 rounded-full gradient-brand flex items-center justify-center mt-0.5">
          <LayoutPanelLeft className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      <div className={cn("flex flex-col gap-2", isAssistant ? "items-start max-w-[85%]" : "items-end max-w-[78%]")}>
        {/* Bubble */}
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isAssistant
            ? "bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-tl-sm"
            : "gradient-brand text-white rounded-tr-sm"
        )}>
          {message.content}
        </div>

        {/* Inline product scroller */}
        {isAssistant && products.length > 0 && (
          <InlineProductScroller
            products={products}
            kitIdSet={kitIdSet}
            onAddToKit={onAddToKit}
          />
        )}

        {/* Bundle cards */}
        {isAssistant && message.bundles && message.bundles.length > 0 && (
          <div className="flex flex-col gap-2 w-full">
            {message.bundles.map((bundle) => {
              const bundleProducts = MOCK_UNWEARABLE_PRODUCTS.filter((p) =>
                bundle.productIds.includes(p.id)
              );
              const total = bundleProducts.reduce((s, p) => s + p.price, 0);
              const allInKit = bundleProducts.every((p) => kitIdSet.has(p.id));
              return (
                <div key={bundle.id}
                  className="rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[12px] font-bold text-[var(--color-text-primary)]">{bundle.label}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">{bundleProducts.length} items · {formatPrice(total, "USD")}</p>
                    </div>
                    <button type="button"
                      onClick={() => bundleProducts.forEach((p) => onAddToKit(p))}
                      disabled={allInKit}
                      className={cn(
                        "h-8 px-3 rounded-lg text-[11px] font-semibold transition-all",
                        allInKit
                          ? "bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                          : "text-white gradient-brand hover:brightness-110"
                      )}>
                      {allInKit ? "In Kit ✓" : "Add Bundle"}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {bundleProducts.slice(0, 4).map((p) => (
                      <div key={p.id} className="h-10 w-10 rounded-lg overflow-hidden border border-[var(--color-border)] shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    ))}
                    {bundleProducts.length > 4 && (
                      <div className="h-10 w-10 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] flex items-center justify-center text-[10px] font-bold text-[var(--color-text-muted)]">
                        +{bundleProducts.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick option chips */}
        {isAssistant && isLast && message.quickOptions && message.quickOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.quickOptions.map((opt) => (
              <button key={opt} type="button" onClick={() => onQuickOption(opt)}
                className="text-[11px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all">
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-[var(--color-text-muted)] px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ─── Inline product horizontal scroller ──────────────────────────────────────
function InlineProductScroller({
  products,
  kitIdSet,
  onAddToKit,
}: {
  products: Product[];
  kitIdSet: Set<string>;
  onAddToKit: (p: Product) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }

  React.useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateScrollState); ro.disconnect(); };
  }, [products]);

  function scroll(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -180 : 180, behavior: "smooth" });
  }

  return (
    <div className="relative w-full max-w-sm">
      {canScrollLeft && (
        <button type="button" onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-border)] shadow text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center justify-center -translate-x-3">
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </button>
      )}
      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
        {products.map((product) => {
          const inKit = kitIdSet.has(product.id);
          return (
            <div key={product.id}
              className="shrink-0 w-40 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={product.name}
                className="w-full h-24 object-cover border-b border-[var(--color-border)]" />
              <div className="p-2">
                <p className="text-[11px] font-semibold text-[var(--color-text-primary)] line-clamp-2 leading-snug">{product.name}</p>
                <p className="text-[11px] font-bold text-[var(--color-brand)] mt-0.5">{formatPrice(product.price, product.currency)}</p>
                <button type="button" onClick={() => onAddToKit(product)} disabled={inKit}
                  className={cn(
                    "mt-1.5 w-full h-7 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all",
                    inKit
                      ? "bg-[var(--color-surface-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                      : "gradient-brand text-white hover:brightness-110"
                  )}>
                  {inKit ? "In Kit ✓" : "Add to Kit"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {canScrollRight && (
        <button type="button" onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-border)] shadow text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center justify-center translate-x-3">
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function ShoppingTypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 shrink-0 rounded-full gradient-brand flex items-center justify-center">
        <LayoutPanelLeft className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] px-4 py-2.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Scanning indicator ────────────────────────────────────────────────────────
function ShoppingScanningIndicator({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 shrink-0 rounded-full gradient-brand flex items-center justify-center">
        <Search className="h-3.5 w-3.5 text-white animate-pulse" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-[var(--color-surface-base)] border border-[var(--color-border)] px-4 py-3 space-y-2">
        <p className="text-[12px] font-semibold text-[var(--color-brand)]">Searching catalog…</p>
        <div className="space-y-1.5">
          {SCAN_STAGES.map((stage, i) => (
            <div key={stage} className={cn("flex items-center gap-2", i > stageIndex ? "opacity-30" : "")}>
              {i < stageIndex ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] shrink-0" />
              ) : i === stageIndex ? (
                <Loader2 className="h-3 w-3 text-[var(--color-brand)] animate-spin shrink-0" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)] shrink-0" />
              )}
              <span className="text-[11px] text-[var(--color-text-muted)]">{stage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile: full chat + solution board bottom sheet ──────────────────────────
function MobileShoppingLayout({
  agent,
  onAddAllToCart,
}: {
  agent: ReturnType<typeof useShoppingAgent>;
  onAddAllToCart: () => void;
}) {
  const [view, setView] = React.useState<"chat" | "kit">("chat");
  const solutionCount = agent.solutionProducts.length;
  const kitTotal = agent.solutionProducts.reduce((s, p) => s + p.price, 0);

  // Auto-switch to chat whenever solution count resets
  React.useEffect(() => {
    if (solutionCount === 0) setView("chat");
  }, [solutionCount]);

  // ── Kit view ──────────────────────────────────────────────────────────────
  if (view === "kit") {
    return (
      <div className="flex flex-col h-full min-h-0 bg-[var(--color-surface-card)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[var(--color-brand)]" />
            <span className="text-[14px] font-bold text-[var(--color-text-primary)]">Solution Kit</span>
            <span className="text-[11px] font-semibold text-[var(--color-brand)] bg-[var(--color-brand)]/10 px-2 py-0.5 rounded-full">
              {solutionCount} items
            </span>
          </div>
          <button
            type="button"
            onClick={() => setView("chat")}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] hover:border-[var(--color-brand)]/40 transition-colors text-[12px] text-[var(--color-text-secondary)]"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Back to chat
          </button>
        </div>

        {/* Scrollable board content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          <SolutionBoard
            topic={agent.topic}
            budget={agent.budget}
            solutionProducts={agent.solutionProducts}
            cartItemIdSet={agent.cartItemIdSet}
            onAddAllToCart={onAddAllToCart}
            onRemove={agent.removeSolutionProduct}
            compact
          />
        </div>

        {/* Sticky add-all CTA */}
        {solutionCount > 0 && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] shrink-0 bg-[var(--color-surface-card)]">
            <button
              type="button"
              onClick={() => { onAddAllToCart(); setView("chat"); }}
              className="w-full py-3 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, var(--color-brand), #a855f7)" }}
            >
              <ShoppingCart className="h-4 w-4" />
              Add all to cart · {formatPrice(kitTotal, "USD")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Chat view ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 bg-[var(--color-surface-card)]">
      <ShoppingChatPanel agent={agent} compact onViewKit={() => setView("kit")} />
    </div>
  );
}
