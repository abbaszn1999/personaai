"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowRight, Check, Upload, UserRound } from "lucide-react";
import type { AvatarVariation } from "@/modules/wearable-agent/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface AvatarVariationPickerProps {
  variations: AvatarVariation[];
  selectedId: string | null;
  customAvatarUrl: string | null;
  onSelect: (id: string) => void;
  onUploadCustom: (file: File) => void;
  onConfirm: () => void;
}

/** Establishes each grid cell's 3:4 portrait ratio via the padding-top percentage hack
 *  instead of the `aspect-[…]` utility. Every child here is absolutely positioned (the
 *  photos, the label bar), so nothing in the cell actually contributes to its own height —
 *  if the aspect ratio it depends on ever fails to apply, the cell collapses to zero and
 *  the label disappears with it. Padding-percentage sizing has no such dependency: it's
 *  resolved from the element's own width by the box model directly, not a separate CSS
 *  property that a stale stylesheet could be missing. */
function AvatarCardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full" style={{ paddingTop: "133.333%" }}>
      {children}
    </div>
  );
}

export function AvatarVariationPicker({
  variations,
  selectedId,
  customAvatarUrl,
  onSelect,
  onUploadCustom,
  onConfirm,
}: AvatarVariationPickerProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasSelection = selectedId !== null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUploadCustom(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <div className="text-center space-y-2">
        <div className="mx-auto h-12 w-12 rounded-xl gradient-wearable flex items-center justify-center">
          <UserRound className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Choose your avatar</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto">
          Pick the standing model that best matches you. This becomes your try-on mannequin on the right side during shopping.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {variations.map((variation) => {
          const isSelected = selectedId === variation.id;
          return (
            <AvatarCardFrame key={variation.id}>
              <button
                type="button"
                onClick={() => onSelect(variation.id)}
                className={cn(
                  "group absolute inset-0 rounded-[var(--radius-xl)] overflow-hidden border-2 transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]",
                  isSelected
                    ? "border-[var(--color-wearable-from)] shadow-[0_0_0_3px_rgba(107,53,141,0.25)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-wearable-from)]/60"
                )}
              >
                {/* Real Persona Agent renders are subject-only cutouts on a transparent
                    background — layer the paired fixed backdrop plate underneath so the card
                    shows the actual studio scene instead of any un-keyed chroma-key residue. */}
                {variation.backdropUrl && (
                  <Image src={variation.backdropUrl} alt="" fill sizes="220px" className="object-cover object-top" unoptimized />
                )}
                <Image
                  src={variation.imageUrl}
                  alt={variation.label}
                  fill
                  sizes="220px"
                  className="object-cover object-top"
                  unoptimized
                />
                <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/75 via-black/25 to-transparent px-2.5 pt-6 pb-2">
                  <span className="text-xs font-medium text-white drop-shadow-sm">{variation.label}</span>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 h-6 w-6 rounded-full gradient-wearable flex items-center justify-center shadow-md">
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
              </button>
            </AvatarCardFrame>
          );
        })}

        <AvatarCardFrame>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "absolute inset-0 rounded-[var(--radius-xl)] overflow-hidden border-2 border-dashed transition-all",
              "flex flex-col items-center justify-center gap-2 px-3",
              selectedId === "custom"
                ? "border-[var(--color-wearable-from)] bg-[var(--color-accent-light)] shadow-[0_0_0_3px_rgba(107,53,141,0.25)]"
                : "border-[var(--color-border)] hover:border-[var(--color-wearable-from)]/60 hover:bg-[var(--color-accent-light)]/40"
            )}
          >
            {customAvatarUrl && selectedId === "custom" ? (
              <>
                <Image
                  src={customAvatarUrl}
                  alt="Your uploaded avatar"
                  fill
                  sizes="220px"
                  className="object-cover object-top"
                  unoptimized
                />
                <div className="absolute top-2 right-2 h-6 w-6 rounded-full gradient-wearable flex items-center justify-center shadow-md z-10">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-[var(--color-text-muted)]" />
                <span className="text-xs font-medium text-[var(--color-text-secondary)] text-center">
                  Upload your own
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">JPEG, PNG</span>
              </>
            )}
          </button>
        </AvatarCardFrame>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col items-center gap-2 pt-2">
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={!hasSelection}
          className={cn(hasSelection ? "gradient-wearable text-white border-0" : "")}
        >
          Confirm & start chatting
          <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-xs text-[var(--color-text-muted)]">
          You can change this later from your profile settings
        </p>
      </div>
    </div>
  );
}
