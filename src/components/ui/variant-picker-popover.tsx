"use client";

import * as React from "react";
import { ShoppingCart, X } from "lucide-react";
import type { Product, ProductVariant } from "@/modules/commerce/types";
import { formatPrice } from "@/modules/commerce/constants";
import {
  getVariantOptionGroups,
  hasSelectableVariants,
  resolveVariantIdForSelection,
} from "@/lib/catalog/variant-options";
import { cn } from "@/lib/utils/cn";

type VariantSelection = Partial<Record<ProductVariant["type"], string>>;

interface UseVariantPickerResult {
  /** Drop-in replacement for calling `onAddToCart(product)` directly from a trigger button's
   *  onClick. Skips the picker entirely for single-variant products (today's one-click
   *  behavior, unchanged) — otherwise opens the picker for that product. */
  requestAddToCart: (product: Product) => void;
  /** Render this once, anywhere, alongside the trigger buttons that call `requestAddToCart`. */
  pickerElement: React.ReactNode;
}

/**
 * Shared hook powering the single-item "Add to Cart" variant picker. Any component that
 * previously called `onAddToCart(product)` directly from a button's onClick should instead call
 * `requestAddToCart(product)`, and render `pickerElement` once nearby.
 */
export function useVariantPicker(
  onAddToCart: (product: Product, variantId?: string) => void
): UseVariantPickerResult {
  const [activeProduct, setActiveProduct] = React.useState<Product | null>(null);

  const requestAddToCart = React.useCallback(
    (product: Product) => {
      if (!hasSelectableVariants(product)) {
        onAddToCart(product);
        return;
      }
      setActiveProduct(product);
    },
    [onAddToCart]
  );

  const pickerElement = activeProduct ? (
    <VariantPickerModal
      product={activeProduct}
      onClose={() => setActiveProduct(null)}
      onConfirm={(variantId) => {
        onAddToCart(activeProduct, variantId);
        setActiveProduct(null);
      }}
    />
  ) : null;

  return { requestAddToCart, pickerElement };
}

function labelForVariantType(type: ProductVariant["type"]): string {
  switch (type) {
    case "size":
      return "Size";
    case "color":
      return "Color";
    default:
      return "Style";
  }
}

function VariantPickerModal({
  product,
  onClose,
  onConfirm,
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (variantId: string) => void;
}) {
  const groups = React.useMemo(() => getVariantOptionGroups(product), [product]);
  const [selection, setSelection] = React.useState<VariantSelection>({});

  const isComplete = groups.every((group) => !!selection[group.type]);
  const resolvedVariantId = isComplete ? resolveVariantIdForSelection(product, selection) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] animate-fade-in overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-12 w-12 rounded-lg object-cover border border-[var(--color-border)] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">
              {product.name}
            </p>
            <p className="text-[12px] font-bold text-[var(--color-brand)] mt-0.5">
              {formatPrice(product.price, product.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-base)] transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.type}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                {labelForVariantType(group.type)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.options.map((option) => {
                  const active = selection[group.type] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelection((prev) => ({ ...prev, [group.type]: option }))}
                      className={cn(
                        "h-8 min-w-[2.5rem] px-3 rounded-lg text-[12px] font-semibold border transition-all",
                        active
                          ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 pt-0">
          <button
            type="button"
            onClick={() => resolvedVariantId && onConfirm(resolvedVariantId)}
            disabled={!resolvedVariantId}
            className={cn(
              "w-full h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all",
              resolvedVariantId
                ? "gradient-brand text-white hover:brightness-110"
                : "bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed"
            )}
          >
            {isComplete && !resolvedVariantId ? (
              <>
                <X className="h-4 w-4" />
                Not available
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}