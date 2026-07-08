"use client";

import * as React from "react";
import {
  Check,
  Cpu,
  Gamepad2,
  Home,
  Laptop,
  MonitorSpeaker,
  Package,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import type { Product } from "@/modules/shopping-agent/types";
import type { ShoppingTopic } from "../mocks/responses";
import { formatPrice } from "../constants";
import { cn } from "@/lib/utils/cn";

interface SolutionBoardProps {
  topic: ShoppingTopic | null;
  budget: number | null;
  solutionProducts: Product[];
  /** IDs already sent to the real store cart (from "Add All to Cart") */
  cartItemIdSet: Set<string>;
  onAddAllToCart: () => void;
  onRemove: (productId: string) => void;
  compact?: boolean;
}

const TOPIC_META: Record<ShoppingTopic, { icon: React.ElementType; color: string; bg: string }> = {
  "WiFi & Networking":  { icon: Wifi,          color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  "Home Office":        { icon: Laptop,         color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  "Gaming Setup":       { icon: Gamepad2,       color: "#f76d01", bg: "rgba(247,109,1,0.12)"  },
  "Laptop & Computing": { icon: Cpu,            color: "#06b6d4", bg: "rgba(6,182,212,0.12)"  },
  "Smartphones":        { icon: MonitorSpeaker, color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  "Audio & Sound":      { icon: MonitorSpeaker, color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  "Kitchen & Home":     { icon: Home,           color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  "General Electronics":{ icon: Zap,            color: "#f76d01", bg: "rgba(247,109,1,0.12)"  },
};


export function SolutionBoard({
  topic,
  budget,
  solutionProducts,
  cartItemIdSet,
  onAddAllToCart,
  onRemove,
  compact = false,
}: SolutionBoardProps) {
  const [justAddedAll, setJustAddedAll] = React.useState(false);
  const allCarted = solutionProducts.length > 0 && solutionProducts.every((p) => cartItemIdSet.has(p.id));

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

  const meta = topic ? TOPIC_META[topic] : TOPIC_META["General Electronics"];
  const TopicIcon = meta.icon;

  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4")}>
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
        <ShoppingCart className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
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
              onRemove={() => onRemove(product.id)}
            />
          ))}

          {/* Add all to real cart — desktop only (mobile has its own sticky CTA) */}
          {!compact && (
            <button
              type="button"
              onClick={handleAddAll}
              disabled={allCarted}
              className={cn(
                "w-full h-10 rounded-xl font-semibold text-[13px] flex items-center justify-between px-4 transition-all mt-1",
                allCarted
                  ? "bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                  : "bg-gradient-to-r from-[var(--color-brand)] to-[#c40000] text-white shadow-[0_4px_16px_rgba(247,109,1,0.3)] hover:brightness-110 active:scale-[0.98]"
              )}
            >
              <span className="flex items-center gap-2">
                {allCarted || justAddedAll ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                {allCarted ? "Added to Cart" : justAddedAll ? "Added!" : "Add All to Cart"}
              </span>
              <span className="text-[14px] font-bold">{formatPrice(cartTotal, "USD")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Individual solution product card ────────────────────────────────────────
function SolutionProductCard({
  product,
  accentColor,
  onRemove,
}: {
  product: Product;
  accentColor: string;
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
      {/* Remove from kit — appears on hover */}
      <button
        type="button"
        onClick={onRemove}
        title="Remove from kit"
        className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
