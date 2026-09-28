"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Ruler, ShoppingBag, X } from "lucide-react";
import type { ActiveLookItem } from "./garment-hotspot";
import { formatPrice } from "@/modules/commerce/constants";
import { getProductSizeLabel } from "../utils/fit-metrics";
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
  onAddToCart: (item: ActiveLookItem["product"]) => void;
  onClose: () => void;
}

const SIZE_SCALE = ["XS", "S", "M", "L", "XL"];

export function SizeGuideModal({ lookLabel, items, cartItemIds, onAddToCart, onClose }: SizeGuideModalProps) {
  const styles = THEME_STYLES[useWearableTheme()];
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
              const category = getProductSizeLabel(item.product);
              const sizeVariants = item.product.variants.filter((v) => v.type === "size");
              const scale = sizeVariants.length > 0 ? sizeVariants.map((v) => v.label) : SIZE_SCALE;

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
                    <button
                      type="button"
                      onClick={() => onAddToCart(item.product)}
                      disabled={inCart}
                      className={cn(
                        "min-h-9 self-start px-3 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 shrink-0 transition-all",
                        inCart
                          ? styles.addedButton
                          : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-[var(--color-brand-contrast)] hover:brightness-105"
                      )}
                    >
                      {inCart ? <Check className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                      {inCart ? "Added" : "Add"}
                    </button>
                  </div>

                  {/* Size scale row with recommendation highlighted */}
                  <div className="flex items-center gap-1.5 mt-3">
                    {scale.map((size) => {
                      const isRecommended = size === item.size;
                      return (
                        <div
                          key={size}
                          className={cn(
                            "flex-1 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all",
                            isRecommended
                              ? "bg-[var(--color-brand)] text-white shadow-[var(--shadow-glow)]"
                              : styles.scaleInactive
                          )}
                        >
                          {size}
                        </div>
                      );
                    })}
                  </div>
                  <p className={cn("text-[10px] mt-1.5", styles.footnote)}>
                    Recommended: <span className="text-[var(--color-brand)] font-semibold">{item.size}</span> based on your body profile
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
