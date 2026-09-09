"use client";

import * as React from "react";
import { Eye, ImageOff, Package } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { CategorySampleProduct } from "@/modules/store/types";

export interface CategoryPreviewTarget {
  categoryId: string;
  categoryName: string;
}

interface CategoryPreviewModalProps {
  target: CategoryPreviewTarget | null;
  onClose: () => void;
}

/**
 * Shows a handful of real, live products currently in a category — pulled straight from the
 * merchant's own store, the same way the mapping preview does — so they can judge whether a
 * category is worth selecting before committing to it. Unlike the demo this ports from, there's
 * no guaranteed sample: a real category can legitimately come back empty or fail a live call.
 */
export function CategoryPreviewModal({ target, onClose }: CategoryPreviewModalProps) {
  return (
    <Modal
      isOpen={target !== null}
      onClose={onClose}
      title={target ? `Products in "${target.categoryName}"` : ""}
      description="Live from your store — not a saved snapshot"
      icon={<Eye className="h-4 w-4" />}
      size="md"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* Keyed by category so switching targets resets loading/error/samples via fresh initial
       *  state instead of a setState call at the top of the fetch effect. */}
      {target && <CategoryPreviewBody key={target.categoryId} categoryId={target.categoryId} />}
    </Modal>
  );
}

function CategoryPreviewBody({ categoryId }: { categoryId: string }) {
  const [samples, setSamples] = React.useState<CategorySampleProduct[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    fetch(`/api/store-connection/category-samples?categoryId=${encodeURIComponent(categoryId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not load products");
        if (!cancelled) setSamples(data.samples ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load products");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return (
    <>
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
            />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-[var(--color-error)]">{error}</p>
      ) : samples.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
          No live products found in this category right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {samples.map((product) => (
            <div
              key={product.externalId}
              className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3"
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
                  <ImageOff className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="line-clamp-2 text-xs font-semibold text-[var(--color-text-primary)]">
                  {product.title}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  {product.price !== null && (
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {product.currency ?? ""} {product.price.toFixed(2)}
                    </span>
                  )}
                  <span
                    className={
                      product.inStock
                        ? "flex items-center gap-1 text-[var(--color-success)]"
                        : "flex items-center gap-1 text-[var(--color-text-muted)]"
                    }
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {product.inStock ? "In stock" : "Out of stock"}
                  </span>
                </div>
                {product.sizes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.sizes.slice(0, 6).map((size) => (
                      <span
                        key={size}
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]"
                      >
                        {size}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && samples.length === 0 && (
        <div className="flex justify-center pt-2 text-[var(--color-text-muted)]">
          <Package className="h-6 w-6" />
        </div>
      )}
    </>
  );
}
