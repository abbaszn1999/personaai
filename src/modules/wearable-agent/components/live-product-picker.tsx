"use client";

import { Check, Loader2, ShoppingBag, Video } from "lucide-react";
import type { Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { cn } from "@/lib/utils/cn";

interface LiveProductPickerProps {
  products: Product[];
  activeProductId: string | null;
  cartItemIds: Set<string>;
  pendingCartIds: Set<string>;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  mobile?: boolean;
}

export function LiveProductPicker({
  products,
  activeProductId,
  cartItemIds,
  pendingCartIds,
  onSelect,
  onAddToCart,
  mobile = false,
}: LiveProductPickerProps) {
  return (
    <div
      className={cn(
        "border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)] backdrop-blur-2xl",
        mobile ? "rounded-t-[20px] p-3" : "rounded-[18px] p-4"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Video className="h-4 w-4 text-[var(--color-brand-strong)]" />
        <div>
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Products in this look</p>
          <p className="text-[10px] text-[var(--color-text-secondary)]">Choose one item to preview live</p>
        </div>
      </div>

      <div className={cn("space-y-2 overflow-y-auto", mobile ? "max-h-44" : "max-h-[calc(100vh-190px)]")}>
        {products.map((product) => {
          const isActive = activeProductId === product.id;
          const inCart = cartItemIds.has(product.id);
          const isPending = pendingCartIds.has(product.id);

          return (
            <div
              key={product.id}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2 transition-all",
                isActive
                  ? "border-[var(--color-brand-strong)] bg-[var(--color-brand-light)] shadow-[var(--shadow-glow)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-base)] hover:border-[var(--color-brand)]/45"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(product)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                aria-pressed={isActive}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg border border-[var(--color-border)] object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-[var(--color-text-primary)]">{product.name}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--color-text-secondary)]">
                    {formatPrice(product.price, product.currency)}
                  </span>
                  {isActive && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-brand-strong)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-brand-strong)]" />
                      Live
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onAddToCart(product)}
                disabled={inCart || isPending}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[10px] font-semibold transition-all",
                  inCart
                    ? "bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
                    : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-[var(--color-brand-contrast)] hover:brightness-110",
                  "disabled:cursor-default"
                )}
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : inCart ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <ShoppingBag className="h-3 w-3" />
                )}
                {isPending ? "Adding…" : inCart ? "Added" : "Add to Cart"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
