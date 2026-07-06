import * as React from "react";
import Image from "next/image";
import { Shirt, Ruler, CheckCircle2, PlusCircle, Star } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/modules/shopping-agent/types";
import type { Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { cn } from "@/lib/utils/cn";

interface WearableChatMessageProps {
  message: ChatMessageType;
  inlineProducts?: Product[];
  outfitItemIds?: string[];
  onAddToOutfit?: (product: Product) => void;
}

export function WearableChatMessage({
  message,
  inlineProducts,
  outfitItemIds = [],
  onAddToOutfit,
}: WearableChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2 animate-fade-in", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Agent avatar */}
      {!isUser && (
        <div className="h-7 w-7 rounded-full gradient-wearable flex items-center justify-center shrink-0 mt-1">
          <Shirt className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      <div className={cn("flex flex-col gap-2.5", isUser ? "items-end" : "items-start", "max-w-[85%]")}>
        {/* Text bubble */}
        <div
          className={cn(
            "rounded-[var(--radius-xl)] px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "gradient-wearable text-white rounded-br-[var(--radius-sm)]"
              : "bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-bl-[var(--radius-sm)]"
          )}
        >
          {message.content}
        </div>

        {/* Inline product suggestions */}
        {inlineProducts && inlineProducts.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-1 w-full" style={{ scrollbarWidth: "none" }}>
            {inlineProducts.map((product) => (
              <InlineSuggestionCard
                key={product.id}
                product={product}
                inOutfit={outfitItemIds.includes(product.id)}
                onAdd={() => onAddToOutfit?.(product)}
              />
            ))}
          </div>
        )}

        {/* Try-on image card */}
        {message.tryOnImage && (
          <TryOnResultCard
            imageUrl={message.tryOnImage.imageUrl}
            items={message.tryOnImage.items}
            recommendedSizes={message.tryOnImage.recommendedSizes}
            fitNotes={message.tryOnImage.fitNotes}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Inline suggestion card (compact, horizontal scroll) ──────────────── */

interface InlineSuggestionCardProps {
  product: Product;
  inOutfit: boolean;
  onAdd: () => void;
}

function InlineSuggestionCard({ product, inOutfit, onAdd }: InlineSuggestionCardProps) {
  return (
    <div
      className={cn(
        "shrink-0 w-52 rounded-[var(--radius-xl)] border bg-[var(--color-surface-card)] overflow-hidden transition-all duration-200",
        inOutfit
          ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)] ring-offset-1"
          : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
      )}
    >
      {/* Image */}
      <div className="relative h-40 bg-[var(--color-surface-base)]">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          className="object-cover"
          unoptimized
        />
        {inOutfit && (
          <div className="absolute inset-0 bg-[var(--color-brand)]/10 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full gradient-wearable flex items-center justify-center shadow-lg">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-2">
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-primary)] line-clamp-1">{product.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="h-2.5 w-2.5 text-amber-400 fill-current" />
            <span className="text-[10px] text-[var(--color-text-muted)]">{product.rating} ({product.reviewCount})</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-bold text-[var(--color-text-primary)]">
            {formatPrice(product.price, product.currency)}
          </span>
          <button
            onClick={onAdd}
            disabled={inOutfit || !product.inStock}
            className={cn(
              "flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full transition-all",
              inOutfit
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : product.inStock
                ? "gradient-wearable text-white hover:opacity-90"
                : "bg-[var(--color-surface-base)] text-[var(--color-text-muted)] cursor-not-allowed"
            )}
          >
            {inOutfit ? (
              <><CheckCircle2 className="h-2.5 w-2.5" /> Added</>
            ) : (
              <><PlusCircle className="h-2.5 w-2.5" /> Add</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Try-on result card ───────────────────────────────────────────────── */

interface TryOnResultCardProps {
  imageUrl: string;
  items: Array<{ productId: string; name: string; selectedVariant?: string }>;
  recommendedSizes: Record<string, string>;
  fitNotes: string;
}

function TryOnResultCard({ items, recommendedSizes, fitNotes }: Omit<TryOnResultCardProps, "imageUrl"> & { imageUrl?: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] overflow-hidden shadow-sm w-72">
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Recommended Sizes</span>
        </div>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.productId} className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-secondary)] truncate pr-2">{item.name}</span>
              <span className="text-xs font-bold text-[var(--color-brand)] shrink-0 bg-[var(--color-brand-light)] px-2 py-0.5 rounded-full">
                {recommendedSizes[item.productId] ?? item.selectedVariant ?? "M"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-success-light)] px-2.5 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[var(--color-success)] leading-relaxed">{fitNotes}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Typing indicator ─────────────────────────────────────────────────── */

export function WearableTypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="h-7 w-7 rounded-full gradient-wearable flex items-center justify-center shrink-0">
        <Shirt className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-pulse-dot"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
