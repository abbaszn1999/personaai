"use client";

import * as React from "react";
import {
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  LayoutPanelLeft,
  Loader2,
  Package,
  PlusCircle,
  Search,
  ShoppingCart,
  User,
} from "lucide-react";
import { useShoppingAgent } from "../hooks/use-shopping-agent";
import { AgentOrb } from "@/components/ui/agent-orb";
import { useVariantPicker } from "@/components/ui/variant-picker-popover";
import { SolutionBoard } from "./solution-board";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "../constants";
import type { ChatMessage, Product } from "../types";
import { SCAN_STAGES } from "../mocks/responses";
import type { PreviewViewportMode } from "@/modules/wearable-agent/components/preview-viewport-toggle";
import type { EmbedRuntimeConfig } from "@/lib/embed/client/types";

interface ChatInterfaceProps {
  viewportMode?: PreviewViewportMode;
  /** Set only by the public `/embed/[token]` page and widget.js — swaps every backend call
   *  for its public, no-login `/api/embed/*` counterpart. */
  embed?: EmbedRuntimeConfig;
  /** Workspace branding — agent name shown in the chat header, the first message's copy,
   *  and the corner radius of the whole widget box. Falls back to defaults when omitted. */
  branding?: {
    agentName?: string;
    welcomeMessage?: string;
    borderRadius?: string;
    logoUrl?: string | null;
  };
  workspaceId?: string;
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
export function ChatInterface({ viewportMode = "desktop", embed, branding, workspaceId }: ChatInterfaceProps) {
  const agent = useShoppingAgent(embed, branding?.welcomeMessage, workspaceId);
  // Picker for single-item "Add to Cart" clicks only — bulk actions (Solution Board's "Add All",
  // and a bundle's "Add all" button below) call `agent.addToCart` directly and keep today's
  // auto-pick-first-in-stock-variant behavior, per the variant-selection plan's explicit scope.
  const picker = useVariantPicker(agent.addToCart);
  const resizer = useResizableBoard();
  const isMobile = viewportMode === "mobile";
  const agentName = branding?.agentName?.trim() || "Shopping Assistant";
  const logoUrl = branding?.logoUrl ?? null;

  function handleAddAllToCart() {
    agent.addAllBoardToCart();
  }

  if (isMobile) {
    return (
      <div className="relative isolate h-full min-h-0" style={branding?.borderRadius ? { borderRadius: branding.borderRadius, overflow: "hidden" } : undefined}>
        <AmbientBackdrop />
        <CartSyncErrorToast message={agent.cartSyncError} />
        <MobileShoppingLayout
          agent={agent}
          agentName={agentName}
          logoUrl={logoUrl}
          onAddAllToCart={handleAddAllToCart}
          onAddToCart={picker.requestAddToCart}
        />
        {picker.pickerElement}
      </div>
    );
  }

  // ── Desktop ────────────────────────────────────────────────────────────────
  return (
    <div className="relative isolate flex h-full min-h-0 overflow-hidden" style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}>
      <AmbientBackdrop />
      <CartSyncErrorToast message={agent.cartSyncError} />
      {/* Chat panel */}
      <div className="flex-1 min-w-0 h-full min-h-0">
        <ShoppingChatPanel agent={agent} agentName={agentName} logoUrl={logoUrl} onAddToCart={picker.requestAddToCart} />
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
        className="shrink-0 h-full min-h-0 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] backdrop-blur-xl overflow-hidden"
      >
        <SolutionBoard
          topic={agent.topic}
          budget={agent.budget}
          solutionProducts={agent.solutionProducts}
          cartItemIdSet={agent.cartItemIdSet}
          pendingCartItemIdSet={agent.pendingCartItemIdSet}
          onAddAllToCart={handleAddAllToCart}
          onAddToCart={picker.requestAddToCart}
          onRemove={agent.removeSolutionProduct}
        />
      </div>
      {picker.pickerElement}
    </div>
  );
}

// ─── Ambient backdrop ─────────────────────────────────────────────────────────
/** Soft brand-tinted glow behind the chat + solution board panels — the unwearable agent has
 *  no avatar photo to sit its glass panels on top of (unlike wearable's AvatarMannequinPanel
 *  backdrop image), so without this the `backdrop-blur` on those panels has nothing but a flat
 *  surface color to reveal and reads as a plain, depth-less black box. Palette-driven so it
 *  matches whatever primary color the merchant picked, just like the rest of the branding. */
function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background:
          "radial-gradient(60% 50% at 12% 8%, var(--color-brand-light), transparent 65%), " +
          "radial-gradient(55% 45% at 92% 88%, var(--color-accent-light), transparent 65%)",
      }}
    />
  );
}

// ─── Cart sync error toast ────────────────────────────────────────────────────
function CartSyncErrorToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[90%] rounded-xl border border-red-500/40 bg-red-500/10 backdrop-blur px-4 py-2.5 text-[12px] font-medium text-red-400 shadow-lg">
      {message}
    </div>
  );
}

// ─── Chat panel (shared by desktop and mobile) ────────────────────────────────
interface ShoppingChatPanelProps {
  agent: ReturnType<typeof useShoppingAgent>;
  agentName?: string;
  logoUrl?: string | null;
  compact?: boolean;
  onViewKit?: () => void;
  /** Variant-aware single-item add-to-cart (opens the picker for multi-variant Shopify
   *  products). Falls back to `agent.addToCart` directly when omitted. */
  onAddToCart?: (product: Product) => void;
}

function ShoppingChatPanel({ agent, agentName = "Shopping Assistant", logoUrl = null, compact = false, onViewKit, onAddToCart }: ShoppingChatPanelProps) {
  const handleAddToCart = onAddToCart ?? agent.addToCart;
  const messagesRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.isTyping, agent.isScanning]);

  // Quick replies are just a cold-start nudge — once the shopper has sent a real message,
  // showing them again below every subsequent turn is clutter, not a shortcut. Mirrors the
  // wearable agent's StyleChatPanel exactly.
  const hasStartedChat = agent.messages.some((m) => m.role === "user");
  const canShowQuickReplies = !hasStartedChat && !agent.isScanning && !agent.isTyping;

  return (
    <div className={cn(
      "flex flex-col h-full min-h-0 overflow-hidden backdrop-blur-xl",
      compact
        ? "bg-transparent"
        : "rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)]"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 shrink-0 border-b border-[var(--color-border)]",
        compact ? "px-3 py-3" : "px-5 py-4"
      )}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 shadow-sm" />
        ) : (
          <AgentOrb mode="unwearable" size="sm" animated />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold gradient-text-brand truncate">{agentName}</span>
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
          const msgProducts = (msg.productRecommendations ?? [])
            .map((id) => agent.knownProducts[id])
            .filter((p): p is Product => !!p);
          return (
            <ShoppingChatMessage
              key={msg.id}
              message={msg}
              isLast={idx === agent.messages.length - 1}
              products={msgProducts}
              knownProducts={agent.knownProducts}
              kitIdSet={agent.solutionProductIdSet}
              cartItemIdSet={agent.cartItemIdSet}
              pendingCartItemIdSet={agent.pendingCartItemIdSet}
              onAddToKit={agent.addToSolutionBoard}
              onAddToCart={handleAddToCart}
              onBulkAddToCart={agent.addToCart}
              onQuickOption={agent.onQuickOption}
              logoUrl={logoUrl}
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
  knownProducts,
  kitIdSet,
  cartItemIdSet,
  pendingCartItemIdSet,
  onAddToKit,
  onAddToCart,
  onBulkAddToCart,
  onQuickOption,
  logoUrl = null,
}: {
  message: ChatMessage;
  isLast: boolean;
  products: Product[];
  knownProducts: Record<string, Product>;
  kitIdSet: Set<string>;
  cartItemIdSet: Set<string>;
  pendingCartItemIdSet: Set<string>;
  onAddToKit: (p: Product) => void;
  onAddToCart: (p: Product) => void;
  /** Bundle "Add all" — a bulk action, so it bypasses the variant picker and keeps today's
   *  auto-pick-first-in-stock-variant behavior, same as Solution Board's "Add All to Cart". */
  onBulkAddToCart: (p: Product) => void;
  onQuickOption: (label: string) => void;
  logoUrl?: string | null;
}) {
  const isAssistant = message.role === "assistant";
  const hasProducts = isAssistant && products.length > 0;
  const hasBundles = isAssistant && !!message.bundles && message.bundles.length > 0;

  return (
    <div className={cn("flex items-start gap-2.5 animate-fade-in", isAssistant ? "flex-row" : "flex-row-reverse")}>
      {isAssistant ? (
        logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5 shadow-sm" />
        ) : (
          <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <LayoutPanelLeft className="h-4 w-4 text-white" />
          </div>
        )
      ) : (
        <div className="h-8 w-8 rounded-full bg-[var(--color-brand-light)] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-[var(--color-brand)]" />
        </div>
      )}

      {/* Text stays capped; product rows expand across the chat column so cards aren't
       *  stuck in a narrow corner under the bubble. */}
      <div
        className={cn(
          "flex flex-col gap-1.5 min-w-0",
          isAssistant ? "items-start" : "items-end",
          hasProducts || hasBundles ? "flex-1" : "max-w-[88%]"
        )}
      >
        <div className={cn(
          "rounded-[var(--radius-xl)] px-4 py-2.5 text-sm leading-relaxed",
          hasProducts || hasBundles ? "max-w-[88%]" : "w-full",
          isAssistant
            ? "bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-bl-[var(--radius-sm)]"
            : "bg-[var(--color-accent)]/90 text-white rounded-br-[var(--radius-sm)]"
        )}>
          {message.content}
        </div>

        {hasProducts && (
          <InlineProductScroller
            products={products}
            kitIdSet={kitIdSet}
            cartItemIdSet={cartItemIdSet}
            pendingCartItemIdSet={pendingCartItemIdSet}
            onAddToKit={onAddToKit}
            onAddToCart={onAddToCart}
          />
        )}

        {hasBundles && (
          <div className="flex flex-col gap-2 w-full max-w-xl">
            {message.bundles!.map((bundle) => {
              const bundleProducts = bundle.productIds
                .map((id) => knownProducts[id])
                .filter((p): p is Product => !!p);
              const total = bundleProducts.reduce((s, p) => s + p.price, 0);
              const allInKit = bundleProducts.every((p) => kitIdSet.has(p.id));
              const allInCart = bundleProducts.every((p) => cartItemIdSet.has(p.id));
              const anyPending = bundleProducts.some((p) => pendingCartItemIdSet.has(p.id));
              return (
                <div key={bundle.id}
                  className="rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-[var(--color-text-primary)]">{bundle.label}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">{bundleProducts.length} items · {formatPrice(total, "USD")}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button"
                        onClick={() => bundleProducts.forEach((p) => onBulkAddToCart(p))}
                        disabled={allInCart || anyPending}
                        className={cn(
                          "h-8 px-3 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5",
                          allInCart
                            ? "bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                            : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                        )}>
                        {anyPending && <Loader2 className="h-3 w-3 animate-spin" />}
                        {anyPending ? "Adding…" : allInCart ? "In Cart ✓" : "Add to Cart"}
                      </button>
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

        {message.id !== "msg-init" && (
          <span className="text-[10px] text-[var(--color-text-muted)] px-1">
            {new Date(message.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Inline product horizontal scroller ──────────────────────────────────────
function InlineProductScroller({
  products,
  kitIdSet,
  cartItemIdSet,
  pendingCartItemIdSet,
  onAddToKit,
  onAddToCart,
}: {
  products: Product[];
  kitIdSet: Set<string>;
  cartItemIdSet: Set<string>;
  pendingCartItemIdSet: Set<string>;
  onAddToKit: (p: Product) => void;
  onAddToCart: (p: Product) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
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
    scrollRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  }

  return (
    <div className="relative w-full mt-1">
      {canScrollLeft && (
        <button type="button" onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-border)] shadow text-[var(--color-text-muted)] hover:text-[var(--color-brand)] flex items-center justify-center">
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </button>
      )}
      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1 w-full">
        {products.map((product) => {
          const inKit = kitIdSet.has(product.id);
          const inCart = cartItemIdSet.has(product.id);
          const isPending = pendingCartItemIdSet.has(product.id);
          return (
            <div key={product.id}
              className="shrink-0 w-48 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={product.name}
                className="w-full h-32 object-cover border-b border-[var(--color-border)]" />
              <div className="p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-[var(--color-text-primary)] line-clamp-2 leading-snug min-h-[2.2em]">{product.name}</p>
                <p className="text-[12px] font-bold text-[var(--color-brand)]">{formatPrice(product.price, product.currency)}</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddToCart(product)}
                    disabled={inCart || isPending || !product.inStock}
                    title="Add to cart"
                    className={cn(
                      "flex-1 h-7 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all",
                      inCart
                        ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                        : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                    )}
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : inCart ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <PlusCircle className="h-3 w-3" />
                    )}
                    {isPending ? "Adding…" : inCart ? "Added" : "Cart"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddToKit(product)}
                    disabled={inKit}
                    title="Add to solution kit"
                    className={cn(
                      "flex-1 h-7 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all",
                      inKit
                        ? "bg-[var(--color-surface-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                        : "gradient-brand text-white hover:brightness-110"
                    )}
                  >
                    {inKit ? "In Kit ✓" : "Kit"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {canScrollRight && (
        <button type="button" onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-[var(--color-surface-card)] border border-[var(--color-border)] shadow text-[var(--color-text-muted)] hover:text-[var(--color-brand)] flex items-center justify-center">
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function ShoppingTypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0">
        <LayoutPanelLeft className="h-4 w-4 text-white" />
      </div>
      <div className="bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-pulse-dot"
            style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Scanning indicator ────────────────────────────────────────────────────────
function ShoppingScanningIndicator({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Search className="h-4 w-4 text-white" />
      </div>
      <div className="w-72 rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Searching catalog…</span>
          <Loader2 className="h-3.5 w-3.5 text-[var(--color-brand)] animate-spin" />
        </div>
        <div className="space-y-1.5">
          {SCAN_STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center gap-2">
              {i < stageIndex ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] shrink-0" />
              ) : i === stageIndex ? (
                <Loader2 className="h-3 w-3 text-[var(--color-brand)] animate-spin shrink-0" />
              ) : (
                <span className="h-3 w-3 rounded-full border border-[var(--color-border)] shrink-0" />
              )}
              <span className={cn("text-[11px]", i <= stageIndex ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]")}>
                {stage}
              </span>
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
  agentName,
  logoUrl,
  onAddAllToCart,
  onAddToCart,
}: {
  agent: ReturnType<typeof useShoppingAgent>;
  agentName?: string;
  logoUrl?: string | null;
  onAddAllToCart: () => void;
  onAddToCart: (product: Product) => void;
}) {
  const [view, setView] = React.useState<"chat" | "kit">("chat");
  const solutionCount = agent.solutionProducts.length;

  // Auto-switch to chat whenever solution count resets
  React.useEffect(() => {
    if (solutionCount === 0) setView("chat");
  }, [solutionCount]);

  // ── Kit view ──────────────────────────────────────────────────────────────
  if (view === "kit") {
    return (
      <div className="flex flex-col h-full min-h-0 bg-[var(--color-surface-card)] backdrop-blur-xl">
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

        {/* Scrollable board content — the "Add All" action lives inline in the topic header
         *  card now (see SolutionBoard), same as desktop, instead of a separate sticky footer
         *  here. */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          <SolutionBoard
            topic={agent.topic}
            budget={agent.budget}
            solutionProducts={agent.solutionProducts}
            cartItemIdSet={agent.cartItemIdSet}
            pendingCartItemIdSet={agent.pendingCartItemIdSet}
            onAddAllToCart={onAddAllToCart}
            onAddToCart={onAddToCart}
            onRemove={agent.removeSolutionProduct}
            compact
          />
        </div>
      </div>
    );
  }

  // ── Chat view ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 bg-[var(--color-surface-card)] backdrop-blur-xl">
      <ShoppingChatPanel
        agent={agent}
        agentName={agentName}
        logoUrl={logoUrl}
        compact
        onViewKit={() => setView("kit")}
        onAddToCart={onAddToCart}
      />
    </div>
  );
}
