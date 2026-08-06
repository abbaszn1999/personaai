"use client";

import * as React from "react";
import {
  Check,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Home,
  Laptop,
  Loader2,
  MonitorSpeaker,
  Package,
  PlusCircle,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import type { Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "../constants";
import { cn } from "@/lib/utils/cn";

interface SolutionBoardProps {
  /** The shopper's stated use case (free text from the agent's intake), or null. */
  topic: string | null;
  budget: number | null;
  solutionProducts: Product[];
  /** IDs already sent to the real store cart (from "Add to Cart" / "Add All to Cart") */
  cartItemIdSet: Set<string>;
  /** IDs currently mid-flight to the real cart — shown as a spinner so a slow (but working)
   *  sync never looks like a silent failure. */
  pendingCartItemIdSet: Set<string>;
  onAddAllToCart: () => void;
  onAddToCart?: (product: Product) => void;
  onRemove: (productId: string) => void;
  compact?: boolean;
}

interface TopicMeta {
  icon: React.ElementType;
  color: string;
  bg: string;
}

const DEFAULT_TOPIC_META: TopicMeta = { icon: Zap, color: "#f76d01", bg: "rgba(247,109,1,0.12)" };

/** Keyword → visual accent for the topic card. The topic itself is free text from the real
 *  agent's intake now (not a fixed enum), so this just picks a fitting icon/color and falls
 *  back to a generic one for anything unrecognized. */
const TOPIC_KEYWORD_META: Array<{ keywords: string[]; meta: TopicMeta }> = [
  { keywords: ["wifi", "network", "router", "internet"], meta: { icon: Wifi, color: "#3b82f6", bg: "rgba(59,130,246,0.12)" } },
  { keywords: ["office", "desk", "work"], meta: { icon: Laptop, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" } },
  { keywords: ["gaming", "game", "esport"], meta: { icon: Gamepad2, color: "#f76d01", bg: "rgba(247,109,1,0.12)" } },
  { keywords: ["laptop", "computer", "computing", "pc"], meta: { icon: Cpu, color: "#06b6d4", bg: "rgba(6,182,212,0.12)" } },
  { keywords: ["phone", "smartphone", "mobile"], meta: { icon: MonitorSpeaker, color: "#10b981", bg: "rgba(16,185,129,0.12)" } },
  { keywords: ["audio", "sound", "headphone", "speaker"], meta: { icon: MonitorSpeaker, color: "#ec4899", bg: "rgba(236,72,153,0.12)" } },
  { keywords: ["kitchen", "home", "appliance"], meta: { icon: Home, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" } },
];

function metaForTopic(topic: string | null): TopicMeta {
  if (!topic) return DEFAULT_TOPIC_META;
  const lower = topic.toLowerCase();
  for (const entry of TOPIC_KEYWORD_META) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.meta;
  }
  return DEFAULT_TOPIC_META;
}


export function SolutionBoard({
  topic,
  budget,
  solutionProducts,
  cartItemIdSet,
  pendingCartItemIdSet,
  onAddAllToCart,
  onAddToCart,
  onRemove,
  compact = false,
}: SolutionBoardProps) {
  const [justAddedAll, setJustAddedAll] = React.useState(false);
  const allCarted = solutionProducts.length > 0 && solutionProducts.every((p) => cartItemIdSet.has(p.id));
  const anyPending = solutionProducts.some((p) => pendingCartItemIdSet.has(p.id));

  const cartTotal = solutionProducts.reduce((s, p) => s + p.price, 0);
  const budgetUsed = solutionProducts.reduce((s, p) => s + p.price, 0);
  const budgetPct = budget ? Math.min(100, Math.round((budgetUsed / budget) * 100)) : null;

  function handleAddAll() {
    onAddAllToCart();
    setJustAddedAll(true);
    setTimeout(() => setJustAddedAll(false), 2000);
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!topic && solutionProducts.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 text-center px-4">
        <div className="h-14 w-14 rounded-2xl border border-dashed border-[var(--color-border)] flex items-center justify-center">
          <Package className="h-6 w-6 text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--color-text-secondary)] mb-1">Solution Board</p>
          <p className="text-[12px] text-[var(--color-text-muted)] leading-relaxed">
            Start chatting and I&apos;ll build your<br />personal solution kit here.
          </p>
        </div>
      </div>
    );
  }

  const meta = metaForTopic(topic);
  const TopicIcon = meta.icon;

  return (
    <div className={cn("flex flex-col h-full min-h-0", compact ? "gap-0" : "")}>
      <div className={cn("flex-1 min-h-0 overflow-y-auto", compact ? "space-y-3" : "p-4 space-y-4")}>
        {/* ── Topic context card ── */}
        <div className="rounded-xl border border-[var(--color-border)] p-3.5 flex items-center gap-3"
          style={{ background: meta.bg }}>
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: meta.color + "22", border: `1px solid ${meta.color}33` }}>
            <TopicIcon className="h-4.5 w-4.5" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">Current topic</p>
            <p className="text-[13px] font-bold text-[var(--color-text-primary)] truncate">{topic}</p>
          </div>
          {solutionProducts.length > 0 && (
            <button
              type="button"
              onClick={handleAddAll}
              disabled={allCarted || anyPending}
              title={allCarted ? "Added to cart" : anyPending ? "Adding to your cart…" : `Add all ${solutionProducts.length} items to cart`}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 flex items-center gap-1.5 text-[11px] font-bold transition-all",
                allCarted
                  ? "bg-white/60 text-[var(--color-text-muted)]"
                  : "text-white hover:brightness-110 active:scale-[0.97] shadow-sm"
              )}
              style={allCarted ? undefined : { background: meta.color }}
            >
              {anyPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : allCarted || justAddedAll ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5" />
              )}
              <span>{anyPending ? "Adding…" : allCarted ? "Added" : justAddedAll ? "Added!" : "Add All"}</span>
            </button>
          )}
        </div>

        {/* ── Budget tracker ── */}
        {budget && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Budget</span>
              <span className="text-[11px] font-bold" style={{ color: budgetPct && budgetPct > 90 ? "#ef4444" : meta.color }}>
                {formatPrice(budgetUsed, "USD")} of {formatPrice(budget, "USD")}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${budgetPct ?? 0}%`,
                  background: budgetPct && budgetPct > 90
                    ? "linear-gradient(90deg,#f59e0b,#ef4444)"
                    : `linear-gradient(90deg,${meta.color},${meta.color}bb)`,
                }}
              />
            </div>
            {budgetPct !== null && budgetPct > 0 && (
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5">
                {budgetPct}% of budget · {formatPrice(budget - budgetUsed, "USD")} remaining
              </p>
            )}
          </div>
        )}

        {/* ── Solution kit ── */}
        {solutionProducts.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" style={{ color: meta.color }} />
                <span className="text-[12px] font-bold text-[var(--color-text-primary)]">
                  Solution Kit ({solutionProducts.length})
                </span>
              </div>
              <span className="text-[11px] font-bold text-[var(--color-text-primary)]">
                {formatPrice(cartTotal, "USD")}
              </span>
            </div>

            {solutionProducts.map((product) => (
              <SolutionProductCard
                key={product.id}
                product={product}
                accentColor={meta.color}
                inCart={cartItemIdSet.has(product.id)}
                isPending={pendingCartItemIdSet.has(product.id)}
                onAddToCart={onAddToCart ? () => onAddToCart(product) : undefined}
                onRemove={() => onRemove(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Individual solution product card ────────────────────────────────────────
function SolutionProductCard({
  product,
  accentColor,
  inCart,
  isPending,
  onAddToCart,
  onRemove,
}: {
  product: Product;
  accentColor: string;
  inCart: boolean;
  isPending: boolean;
  onAddToCart?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] p-2.5 hover:border-[var(--color-brand)]/20 transition-colors group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageUrl}
        alt={product.name}
        className="h-12 w-12 rounded-lg object-cover shrink-0 border border-[var(--color-border)]"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">{product.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[12px] font-bold" style={{ color: accentColor }}>
            {formatPrice(product.price, product.currency)}
          </span>
          <span className="text-[10px] text-yellow-400">{"★".repeat(Math.round(product.rating))}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onAddToCart && (
          <button
            type="button"
            onClick={onAddToCart}
            disabled={inCart || isPending || !product.inStock}
            title={inCart ? "Already in cart" : isPending ? "Adding to your cart…" : "Add to cart"}
            className={cn(
              "h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all",
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
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Remove from kit"
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
