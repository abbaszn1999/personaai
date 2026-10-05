"use client";

import * as React from "react";
import Image from "next/image";
import { AlertCircle, ArrowRight, Check, ChevronLeft, ChevronRight, Upload, UserRound } from "lucide-react";
import { studioPlateUrl } from "@/modules/wearable-agent/constants";
import type { AvatarVariation } from "@/modules/wearable-agent/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface AvatarVariationPickerProps {
  variations: AvatarVariation[];
  selectedId: string | null;
  customAvatarUrl: string | null;
  partialNote?: string | null;
  onSelect: (id: string) => void;
  onUploadCustom: (file: File) => void;
  onConfirm: () => void;
}

interface Slide {
  id: string;
  label: string;
  imageUrl: string;
  backdropUrl?: string;
}

/** Height of the centered avatar, from which its 3:4 width follows. Tied to the viewport so a
 *  short laptop window or a phone in landscape still shows the whole figure and the Confirm
 *  button without the page itself having to scroll first. */
const SLIDE_HEIGHT = "var(--avatar-slide-h, clamp(300px, 50vh, 480px))";
const SLIDE_WIDTH = `calc(${SLIDE_HEIGHT} * 0.75)`;
/** Horizontal room around each slide: the neighbour peeks in at the edges, which is what tells
 *  the shopper there is more to swipe to. */
const SLIDE_GUTTER_PX = 10;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * "Choose your avatar": one large avatar at a time in a single swipeable row, with arrows (and
 * dots, keyboard arrows and touch swipe) to move to the next. The avatar in the middle is the
 * selected one — what the shopper sees is what Confirm uses — so there is no separate tap-to-pick
 * step to forget.
 */
export function AvatarVariationPicker({
  variations,
  selectedId,
  customAvatarUrl,
  partialNote,
  onSelect,
  onUploadCustom,
  onConfirm,
}: AvatarVariationPickerProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const slideRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = React.useRef<number | null>(null);
  const hasMounted = React.useRef(false);

  const slides = React.useMemo<Slide[]>(() => {
    const generated: Slide[] = variations.map((v) => ({
      id: v.id,
      label: v.label,
      imageUrl: v.imageUrl,
      backdropUrl: v.backdropUrl,
    }));
    // An uploaded picture joins the row as its own slide, so choosing it is the same gesture.
    return customAvatarUrl
      ? [...generated, { id: "custom", label: "Your upload", imageUrl: customAvatarUrl }]
      : generated;
  }, [variations, customAvatarUrl]);

  const selectedIndex = Math.max(0, slides.findIndex((s) => s.id === selectedId));
  const [activeIndex, setActiveIndex] = React.useState(selectedIndex);
  const hasSelection = selectedId !== null;
  const last = slides.length - 1;

  const centeredIndex = React.useCallback((): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const middle = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    slideRefs.current.forEach((el, index) => {
      if (!el) return;
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - middle);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  }, []);

  const scrollToIndex = React.useCallback((index: number, smooth: boolean) => {
    const track = trackRef.current;
    const el = slideRefs.current[index];
    if (!track || !el) return;
    track.scrollTo({
      left: el.offsetLeft + el.offsetWidth / 2 - track.clientWidth / 2,
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
  }, []);

  // Follows the swipe live (for the dots and the highlighted slide), and commits the choice only
  // once the row stops moving, so flicking past a slide never selects it on the way.
  function handleScroll() {
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setActiveIndex(centeredIndex());
      });
    }
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const index = centeredIndex();
      const slide = slides[index];
      if (slide && slide.id !== selectedId) onSelect(slide.id);
    }, 120);
  }

  // Brings the row to the selection when it changes from outside (first arrival, or an upload
  // becoming the chosen avatar). A swipe that already landed there has nothing left to scroll.
  React.useEffect(() => {
    const first = !hasMounted.current;
    hasMounted.current = true;
    if (centeredIndex() === selectedIndex && !first) return;
    scrollToIndex(selectedIndex, !first);
    setActiveIndex(selectedIndex);
  }, [selectedIndex, slides.length, centeredIndex, scrollToIndex]);

  React.useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  function go(delta: number) {
    const next = Math.min(last, Math.max(0, activeIndex + delta));
    if (next === activeIndex) return;
    setActiveIndex(next);
    scrollToIndex(next, true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUploadCustom(file);
    e.target.value = "";
  }

  const arrowClass = cn(
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full",
    "border border-[var(--color-border)] bg-[var(--color-surface-card)]/95 text-[var(--color-text-primary)] shadow-lg backdrop-blur",
    "transition-all hover:scale-105 hover:border-[var(--color-violet-from)] active:scale-95",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]",
    "disabled:pointer-events-none disabled:opacity-0",
  );

  return (
    <div className="flex flex-col gap-4 px-4 py-6 @md:gap-5 @md:px-6 @md:py-8">
      <div className="space-y-1.5 text-center">
        <div className="mx-auto hidden h-11 w-11 items-center justify-center rounded-xl gradient-violet @md:flex">
          <UserRound className="h-5 w-5 text-white" />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Choose your avatar</h2>
        <p className="mx-auto max-w-md text-sm text-[var(--color-text-muted)]">
          Swipe or use the arrows to browse. The one in the middle becomes your try-on mannequin while you shop.
        </p>
      </div>

      {partialNote && (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-warning,#e0a300)]/30 bg-[var(--color-warning-light,rgba(224,163,0,0.1))] px-4 py-2.5 text-center text-xs text-[var(--color-text-secondary)]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning,#e0a300)]" />
          {partialNote}
        </div>
      )}

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Avatar options"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative rounded-[var(--radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/50"
      >
        <button
          type="button"
          aria-label="Previous avatar"
          disabled={activeIndex <= 0}
          onClick={() => go(-1)}
          className={cn(arrowClass, "left-1 @md:left-2")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Next avatar"
          disabled={activeIndex >= last}
          onClick={() => go(1)}
          className={cn(arrowClass, "right-1 @md:right-2")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory items-center overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Spacers let the first and last slide reach the middle of the row. */}
          <div aria-hidden className="shrink-0" style={{ width: `calc((100% - ${SLIDE_WIDTH}) / 2 - ${SLIDE_GUTTER_PX}px)` }} />
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;
            const isSelected = slide.id === selectedId;
            return (
              <div
                key={slide.id}
                ref={(el) => {
                  slideRefs.current[index] = el;
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${slide.label}, ${index + 1} of ${slides.length}`}
                className="shrink-0 snap-center"
                style={{ width: `calc(${SLIDE_WIDTH} + ${SLIDE_GUTTER_PX * 2}px)`, padding: `0 ${SLIDE_GUTTER_PX}px` }}
              >
                <button
                  type="button"
                  onClick={() => (isActive ? onSelect(slide.id) : scrollToIndex(index, true))}
                  aria-pressed={isSelected}
                  className={cn(
                    "relative block w-full overflow-hidden rounded-[var(--radius-xl)] border-2 bg-[var(--color-surface-base)] transition-all duration-300 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]",
                    isActive
                      ? "scale-100 border-[var(--color-violet-from)] opacity-100 shadow-[0_12px_32px_rgba(107,53,141,0.25)]"
                      : "scale-[0.9] border-[var(--color-border)] opacity-60",
                  )}
                  style={{ height: SLIDE_HEIGHT }}
                >
                  {/* Real Persona Agent renders are subject-only cutouts on a transparent
                      background — layer the paired fixed backdrop plate underneath so the card
                      shows the actual studio scene instead of any un-keyed chroma-key residue. */}
                  {slide.backdropUrl && (
                    <Image
                      src={studioPlateUrl(slide.backdropUrl)}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 70vw, 380px"
                      className="object-cover object-top"
                      unoptimized
                    />
                  )}
                  <Image
                    src={slide.imageUrl}
                    alt={slide.label}
                    fill
                    sizes="(max-width: 640px) 70vw, 380px"
                    className={cn(slide.backdropUrl ? "object-cover object-top" : "object-contain object-center")}
                    unoptimized
                    draggable={false}
                  />
                  <div className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pt-12 pb-3.5 text-left">
                    <span className="text-sm font-semibold text-white drop-shadow-sm">{slide.label}</span>
                  </div>
                  {isSelected && (
                    <div className="absolute right-3 top-3 z-[1] flex h-7 w-7 items-center justify-center rounded-full gradient-violet shadow-md">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              </div>
            );
          })}
          <div aria-hidden className="shrink-0" style={{ width: `calc((100% - ${SLIDE_WIDTH}) / 2 - ${SLIDE_GUTTER_PX}px)` }} />
        </div>
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Choose an avatar">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Show ${slide.label}`}
              onClick={() => {
                setActiveIndex(index);
                scrollToIndex(index, true);
              }}
              className={cn(
                "h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]",
                index === activeIndex
                  ? "w-6 bg-[var(--color-violet-from)]"
                  : "w-2 bg-[var(--color-border)] hover:bg-[var(--color-text-muted)]",
              )}
            />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col items-center gap-2.5">
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={!hasSelection}
          className={cn("w-full max-w-xs", hasSelection ? "gradient-violet text-white border-0" : "")}
        >
          Confirm & start chatting
          <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
        >
          <Upload className="h-3.5 w-3.5" />
          {customAvatarUrl ? "Replace your upload" : "Or upload your own (JPEG, PNG)"}
        </button>
        <p className="text-xs text-[var(--color-text-muted)]">You can change this later from your profile settings</p>
      </div>
    </div>
  );
}
