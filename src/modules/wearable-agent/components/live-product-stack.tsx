"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
import type { Product } from "@/modules/commerce/types";
import { formatPrice } from "@/modules/commerce/constants";
import { cn } from "@/lib/utils/cn";

interface LiveProductStackProps {
  products: Product[];
  activeProductId: string | null;
  cartItemIds: Set<string>;
  pendingCartIds: Set<string>;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

/**
 * Mobile live try-on product switcher, styled as a stack of overlapping
 * catalog cards floating over the camera preview — the active product pops
 * forward with a white outline, the rest recede behind it. This mirrors how
 * "versions" (generated look snapshots) are kept as a plain swatch strip;
 * this stacked treatment is only for picking a live-catalog product.
 */
export function LiveProductStack({
  products,
  activeProductId,
  cartItemIds,
  pendingCartIds,
  onSelect,
  onAddToCart,
}: LiveProductStackProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, products.findIndex((p) => p.id === activeProductId));
  const activeProduct = products[activeIndex] ?? products[0] ?? null;

  React.useEffect(() => {
    const el = scrollerRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeIndex]);

  if (products.length === 0 || !activeProduct) return null;

  const inCart = cartItemIds.has(activeProduct.id);
  const isPending = pendingCartIds.has(activeProduct.id);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[18] flex flex-col items-center gap-2.5">
      {/* Overlapping card stack */}
      <div
        ref={scrollerRef}
        className="pointer-events-auto flex items-center overflow-x-auto px-10 py-2 scrollbar-none"
        style={{ scrollSnapType: "x proximity" }}
      >
        {products.map((product, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              style={{ scrollSnapAlign: "center" }}
              className={cn(
                "relative shrink-0 overflow-hidden rounded-[16px] transition-all duration-300 ease-out",
                isActive
                  ? "z-20 h-[92px] w-[76px] -translate-y-2 border-2 border-white shadow-[0_12px_28px_rgba(0,0,0,0.5)]"
                  : "z-10 h-[76px] w-[64px] border border-white/15 opacity-70 brightness-[0.7]",
                idx !== 0 && "-ml-3.5"
              )}
              aria-pressed={isActive}
              aria-label={product.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>

      {/* Active product name + price pill, with add-to-cart */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/[0.12] bg-black/55 px-3 py-1.5 backdrop-blur-xl">
        <span className="max-w-[140px] truncate text-[11px] font-semibold text-white">{activeProduct.name}</span>
        <span className="text-[10px] text-white/50">{formatPrice(activeProduct.price, activeProduct.currency)}</span>
        <button
          type="button"
          onClick={() => onAddToCart(activeProduct)}
          disabled={inCart || isPending}
          className={cn(
            "ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all",
            inCart
              ? "bg-white/15 text-white/70"
              : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white",
            "disabled:cursor-default"
          )}
          aria-label={inCart ? "Added to cart" : "Add to cart"}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : inCart ? (
            <Check className="h-3 w-3" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}
