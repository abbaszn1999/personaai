"use client";

import * as React from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Wand2,
  Loader2,
  Shirt,
  Ruler,
} from "lucide-react";
import type { GeneratedTryOn } from "../hooks/use-try-on-agent";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { cn } from "@/lib/utils/cn";

interface TryOnPreviewPanelProps {
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  currentTryOn: GeneratedTryOn | null;
  isGenerating: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function TryOnPreviewPanel({
  tryOnImages,
  currentImageIndex,
  currentTryOn,
  isGenerating,
  onPrev,
  onNext,
}: TryOnPreviewPanelProps) {
  const total = tryOnImages.length;
  const hasPrev = currentImageIndex > 0;
  const hasNext = currentImageIndex < total - 1;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg gradient-wearable flex items-center justify-center shrink-0">
            <Wand2 className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Try-On Preview</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {total === 0
                ? "No previews yet"
                : `${currentImageIndex + 1} / ${total}`}
            </p>
          </div>
        </div>

        {/* Arrow navigation */}
        {total > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className={cn(
                "h-7 w-7 rounded-full border border-[var(--color-border)] flex items-center justify-center transition-all",
                hasPrev
                  ? "hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] text-[var(--color-text-secondary)]"
                  : "opacity-30 cursor-not-allowed text-[var(--color-text-muted)]"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className={cn(
                "h-7 w-7 rounded-full border border-[var(--color-border)] flex items-center justify-center transition-all",
                hasNext
                  ? "hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] text-[var(--color-text-secondary)]"
                  : "opacity-30 cursor-not-allowed text-[var(--color-text-muted)]"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Image area */}
      <div className="relative flex-1 min-h-0 rounded-[var(--radius-xl)] overflow-hidden bg-[var(--color-surface-base)] border border-[var(--color-border)]">
        {isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[var(--color-brand-light)] to-transparent">
            <div className="h-12 w-12 rounded-2xl gradient-wearable flex items-center justify-center animate-pulse">
              <Wand2 className="h-6 w-6 text-white" />
            </div>
            <div className="text-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-brand)] justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-[140px]">
                AI is creating your personalized try-on preview
              </p>
            </div>
          </div>
        ) : currentTryOn ? (
          <>
            <Image
              src={currentTryOn.imageUrl}
              alt="Try-on preview"
              fill
              className="object-cover"
              unoptimized
            />
            {/* Navigation arrows overlaid on image */}
            {total > 1 && (
              <>
                {hasPrev && (
                  <button
                    onClick={onPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                {hasNext && (
                  <button
                    onClick={onNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
                {/* Dot indicators */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                  {tryOnImages.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === currentImageIndex
                          ? "w-4 bg-white"
                          : "w-1.5 bg-white/50"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          // Empty placeholder
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4">
            <div className="h-14 w-14 rounded-2xl border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
              <Shirt className="h-7 w-7 text-[var(--color-text-muted)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">No preview yet</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Add items to your outfit and ask the agent to generate a try-on
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Products used in this image */}
      {currentTryOn && currentTryOn.outfitProducts.length > 0 && (
        <div className="shrink-0 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            <Ruler className="h-3 w-3" />
            Items in this preview
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {currentTryOn.outfitProducts.map((product) => {
              const size = currentTryOn.recommendedSizes[product.id];
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-base)] border border-[var(--color-border)] px-2.5 py-1.5"
                >
                  <div className="relative h-8 w-8 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-surface-card)] shrink-0">
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{product.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{formatPrice(product.price, product.currency)}</p>
                  </div>
                  {size && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-brand-light)] text-[var(--color-brand)] shrink-0">
                      {size}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {currentTryOn.fitNotes && (
            <p className="text-[10px] text-[var(--color-text-muted)] italic leading-relaxed">
              {currentTryOn.fitNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
