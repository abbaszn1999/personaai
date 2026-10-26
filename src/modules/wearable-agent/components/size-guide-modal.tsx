"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Loader2, Ruler, ShoppingBag, Sparkles, X } from "lucide-react";
import type { ActiveLookItem } from "./garment-hotspot";
import { formatPrice } from "@/modules/commerce/constants";
import { getProductSizeLabel } from "../utils/fit-metrics";
import { sizeLabelCandidates } from "@/lib/sizing/size-label-forms";
import { cn } from "@/lib/utils/cn";
import { useWearableTheme } from "../theme-context";

const THEME_STYLES = {
  dark: {
    overlay: "bg-black/70",
    modal: "border-white/10 bg-[#151019] shadow-[0_24px_64px_rgba(0,0,0,0.6)]",
    header: "border-white/[0.08]",
    title: "text-white",
    subtitle: "text-white/40",
    closeButton: "text-white/40 hover:text-white hover:bg-white/[0.08]",
    empty: "text-white/40",
    card: "border-white/[0.08] bg-white/[0.03]",
    imgBorder: "border-white/10",
    category: "text-white/35",
    name: "text-white",
    price: "text-white/50",
    addedButton: "bg-white/10 text-white/60",
    scaleInactive: "bg-white/[0.05] text-white/40 border border-white/[0.06]",
    footnote: "text-white/35",
  },
  light: {
    overlay: "bg-black/40",
    modal: "border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]",
    header: "border-black/[0.08]",
    title: "text-[var(--color-text-primary)]",
    subtitle: "text-[var(--color-text-muted)]",
    closeButton: "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-black/[0.06]",
    empty: "text-[var(--color-text-muted)]",
    card: "border-black/[0.08] bg-black/[0.02]",
    imgBorder: "border-black/10",
    category: "text-[var(--color-text-muted)]",
    name: "text-[var(--color-text-primary)]",
    price: "text-[var(--color-text-secondary)]",
    addedButton: "bg-black/[0.06] text-[var(--color-text-secondary)]",
    scaleInactive: "bg-black/[0.04] text-[var(--color-text-muted)] border border-black/[0.06]",
    footnote: "text-[var(--color-text-muted)]",
  },
} as const;

interface SizeGuideModalProps {
  lookLabel: string;
  items: ActiveLookItem[];
  cartItemIds: Set<string>;
  /** Products whose cart change is still in flight. */
  pendingCartIds?: Set<string>;
  onAddToCart: (item: ActiveLookItem["product"]) => void;
  /** A second press on an item already in the cart takes it back out. */
  onRemoveFromCart?: (item: ActiveLookItem["product"]) => void;
  /** The size each product in the cart was added in, by product id. */
  cartSizes?: Record<string, string>;
  onClose: () => void;
}

const SIZE_SCALE = ["XS", "S", "M", "L", "XL"];

/** Order of letter sizes along a scale; anything unlisted sorts after them. */
const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];

export function sameSizeLabel(left: string, right: string): boolean {
  const forms = new Set(sizeLabelCandidates(right));
  return sizeLabelCandidates(left).some((form) => forms.has(form));
}

function rank(label: string): number {
  const forms = sizeLabelCandidates(label);
  const number = forms.map(Number).find((value) => Number.isFinite(value));
  if (number !== undefined) return number;
  const letter = forms.map((form) => LETTER_ORDER.indexOf(form)).find((index) => index >= 0);
  return letter !== undefined ? 1000 + letter : 2000;
}

/** True when the product carries a size list of its own, so its sizes can be picked. */
export function hasListedSizes(product: ActiveLookItem["product"]): boolean {
  return product.variants.some((variant) => variant.type === "size") || (product.attributes?.size?.length ?? 0) > 0;
}

/**
 * The sizes to lay out in a row: the ones the store really sells this product in, so "Recommended:
 * 48" sits on a row of 46 to 54 rather than on XS to XL. A product that carries no size list of its
 * own keeps the letter scale only when the recommendation is a letter size; a numeric one gets a
 * row of just itself, never a scale in a different system.
 */
export function sizeScaleFor(product: ActiveLookItem["product"], recommended: string): string[] {
  const own = product.variants.filter((variant) => variant.type === "size").map((variant) => variant.label);
  const listed = own.length > 0 ? own : (product.attributes?.size ?? []);
  const unique = listed.filter((label, index) => label.trim() && listed.findIndex((other) => sameSizeLabel(other, label)) === index);
  if (unique.length > 0) {
    const sorted = [...unique].sort((a, b) => rank(a) - rank(b));
    // A recommendation the list lacks (it would be shown as a size the store does not sell) is not added.
    return sorted;
  }
  return SIZE_SCALE.some((size) => sameSizeLabel(size, recommended)) ? SIZE_SCALE : [recommended];
}

export function SizeGuideModal({
  lookLabel,
  items,
  cartItemIds,
  pendingCartIds,
  onAddToCart,
  onRemoveFromCart,
  cartSizes,
  onClose,
}: SizeGuideModalProps) {
  const styles = THEME_STYLES[useWearableTheme()];
  const [chosen, setChosen] = React.useState<Record<string, string>>({});
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={cn("absolute inset-0 backdrop-blur-sm animate-fade-in", styles.overlay)} onClick={onClose} />

      <div className={cn("relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border animate-fade-in overflow-hidden", styles.modal)}>
        <div className={cn("flex items-center justify-between px-5 py-4 border-b shrink-0", styles.header)}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-violet flex items-center justify-center">
              <Ruler className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className={cn("text-sm font-bold", styles.title)}>Size Guide</h3>
              <p className={cn("text-[11px]", styles.subtitle)}>{lookLabel} — based on your measurements</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close size guide"
            className={cn("h-9 w-9 rounded-full flex items-center justify-center transition-colors", styles.closeButton)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <p className={cn("text-sm text-center py-8", styles.empty)}>
              Add items to your outfit to see personalized size recommendations.
            </p>
          ) : (
            items.map((item) => {
              const inCart = cartItemIds.has(item.product.id);
              const isPending = pendingCartIds?.has(item.product.id) ?? false;
              const category = getProductSizeLabel(item.product);
              const scale = sizeScaleFor(item.product, item.size);
              // Only the product's own sizes can be picked: a made-up letter scale could name a
              // size the store does not sell.
              const pickable = hasListedSizes(item.product);
              const recommendedPill = scale.find((size) => sameSizeLabel(size, item.size)) ?? null;
              const inCartSize = cartSizes?.[item.product.id];
              // The size in play: what is already in the cart, else the shopper's pick, else the
              // recommendation. Null when the product's sizes do not include the recommendation.
              const selected = inCartSize ?? chosen[item.product.id] ?? recommendedPill;
              const addWithSize = () =>
                onAddToCart(pickable && selected ? { ...item.product, selectedSize: selected } : item.product);

              return (
                <div key={item.product.id} className={cn("rounded-xl border p-3.5", styles.card)}>
                  <div className="flex gap-3">
                    <div className={cn("relative h-16 w-16 rounded-lg overflow-hidden shrink-0 border", styles.imgBorder)}>
                      <Image src={item.product.imageUrl} alt={item.product.name} fill sizes="64px" className="object-cover" unoptimized />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[10px] font-bold uppercase tracking-wider", styles.category)}>{category}</p>
                      <p className={cn("text-[13px] font-semibold leading-snug mt-0.5", styles.name)}>{item.product.name}</p>
                      <p className={cn("text-[12px] mt-0.5", styles.price)}>
                        {formatPrice(item.product.price, item.product.currency)}
                      </p>
                    </div>
                    {/* One button for both directions, like the hotspot card: Add, then In cart | Remove. */}
                    <button
                      type="button"
                      onClick={() => (inCart ? onRemoveFromCart?.(item.product) : addWithSize())}
                      disabled={isPending || (inCart && !onRemoveFromCart)}
                      aria-pressed={inCart}
                      className={cn(
                        "min-h-9 self-start px-3 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 shrink-0 transition-all",
                        inCart
                          ? cn(styles.addedButton, onRemoveFromCart && "hover:bg-red-500/10")
                          : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white hover:brightness-105",
                        isPending && "opacity-70"
                      )}
                    >
                      {isPending ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> {inCart ? "Removing…" : "Adding…"}</>
                      ) : inCart ? (
                        <>
                          <Check className="h-3 w-3 text-[#10b981]" /> In cart
                          {onRemoveFromCart && (
                            <>
                              <span aria-hidden className="h-3.5 w-px bg-current opacity-20" />
                              <X className="h-3 w-3 text-red-500" />
                              <span className="text-red-500">Remove</span>
                            </>
                          )}
                        </>
                      ) : (
                        <><ShoppingBag className="h-3 w-3" /> Add</>
                      )}
                    </button>
                  </div>

                  {/* The product's own sizes. The highlighted one is what goes to the cart: the
                      recommendation until the shopper picks another (some like it looser or
                      tighter). The recommended size keeps a ring so it is never lost. */}
                  <div className="mt-3 flex flex-wrap items-center gap-2.5 px-1 py-1.5">
                    {scale.map((size) => {
                      const isRecommended = sameSizeLabel(size, item.size);
                      const isSelected = selected !== null && sameSizeLabel(size, selected);
                      const canPick = pickable && !inCart && !isPending;
                      return (
                        <button
                          key={size}
                          type="button"
                          disabled={!canPick}
                          aria-pressed={isSelected}
                          onClick={() => setChosen((current) => ({ ...current, [item.product.id]: size }))}
                          className={cn(
                            // Every tile has the same box, so choosing one never moves the layout. The
                            // chosen one only looks bigger: a transform does not take up space.
                            "relative h-10 min-w-[2.8rem] px-3 rounded-xl text-[12px] font-semibold tabular-nums transition-[transform,box-shadow,background-color,color] duration-200 flex items-center justify-center",
                            isSelected
                              ? "z-10 scale-[1.14] bg-[var(--color-brand)] text-white shadow-[var(--shadow-glow)]"
                              : cn(
                                  styles.scaleInactive,
                                  isRecommended && "text-[var(--color-brand)] border-[var(--color-brand)]/40",
                                  canPick && "hover:-translate-y-0.5 hover:border-[var(--color-brand)]/60 hover:text-[var(--color-brand)]",
                                  inCart && "opacity-60"
                                ),
                            canPick ? "cursor-pointer" : "cursor-default"
                          )}
                        >
                          {size}
                          {isRecommended && (
                            <span
                              aria-hidden
                              className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--color-brand)] border-2 border-white"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand)]/10 px-2.5 py-1 font-semibold text-[var(--color-brand)]">
                      <Sparkles className="h-3 w-3" />
                      Recommended · {item.size}
                    </span>
                    <span className={styles.footnote}>based on your body profile</span>
                  </div>
                  {/* Always one line, whatever the state, so the card never changes height. */}
                  {pickable && (
                    <p className={cn("mt-1.5 h-4 truncate text-[11px] leading-4", styles.footnote)}>
                      {inCart ? (
                        <>
                          In your cart in <span className="font-semibold text-[var(--color-brand)]">{selected ?? item.size}</span> · Remove to
                          change size
                        </>
                      ) : selected !== null && !sameSizeLabel(selected, item.size) ? (
                        <>
                          You picked <span className="font-semibold text-[var(--color-brand)]">{selected}</span> ·{" "}
                          <button
                            type="button"
                            className="font-semibold underline underline-offset-2 text-[var(--color-brand)]"
                            onClick={() => setChosen((current) => ({ ...current, [item.product.id]: recommendedPill ?? item.size }))}
                          >
                            Use recommended
                          </button>
                        </>
                      ) : (
                        "Tap a size to change it"
                      )}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
