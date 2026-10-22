"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowRight, Baby, ChevronLeft, ChevronRight, Sparkles, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { DEMO_FACE_URLS } from "@/modules/wearable-agent/constants";
import type { TryOnAudience } from "@/modules/wearable-agent/types";

interface AudienceOption {
  id: TryOnAudience;
  label: string;
  eyebrow: string;
  description: string;
  tags: readonly string[];
  icon: React.ComponentType<{ className?: string }>;
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    id: "woman",
    label: "Woman",
    eyebrow: "Womenswear",
    description: "Tailored proportions, bust & waist fit, and womenswear sizing.",
    tags: ["Height & weight", "Chest & waist", "Shoe EU"],
    icon: User,
  },
  {
    id: "man",
    label: "Man",
    eyebrow: "Menswear",
    description: "Structured shoulders, chest & waist proportions, and menswear sizing.",
    tags: ["Height & weight", "Chest & waist", "Shoe EU"],
    icon: User,
  },
  {
    id: "unisex",
    label: "Unisex",
    eyebrow: "All-gender fit",
    description: "Balanced, relaxed proportions across universal and gender-neutral cuts.",
    tags: ["Height & weight", "Chest & waist", "Shoe EU"],
    icon: Users,
  },
  {
    id: "kids-boy",
    label: "Kids · Boy",
    eyebrow: "Boys · 0–17 yrs",
    description: "Height and age-guided sizing built for growing boys.",
    tags: ["Height & weight", "Age (0–17)", "Shoe EU"],
    icon: Baby,
  },
  {
    id: "kids-girl",
    label: "Kids · Girl",
    eyebrow: "Girls · 0–17 yrs",
    description: "Height and age-guided sizing built for growing girls.",
    tags: ["Height & weight", "Age (0–17)", "Shoe EU"],
    icon: Baby,
  },
  {
    id: "kids-unisex",
    label: "Kids · Unisex",
    eyebrow: "Kids · 0–17 yrs",
    description: "Everyday height and age sizing for any child.",
    tags: ["Height & weight", "Age (0–17)", "Shoe EU"],
    icon: Baby,
  },
];

interface AudienceStepProps {
  value: TryOnAudience | null;
  /** Which choices to offer — the departments the merchant enabled. Omitted (or empty) shows
   *  every choice, so a store that hasn't set its scope up yet still onboards normally. */
  audiences?: readonly TryOnAudience[];
  /** Selecting a card advances immediately (Typeform-style, one question per screen). */
  onSelect: (audience: TryOnAudience) => void;
}

const CIRCLE_SLOT_PX = 120;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AudienceStep({
  value,
  audiences,
  onSelect,
}: AudienceStepProps) {
  const options = React.useMemo(
    () =>
      audiences && audiences.length > 0
        ? AUDIENCE_OPTIONS.filter((option) => audiences.includes(option.id))
        : AUDIENCE_OPTIONS,
    [audiences]
  );

  const initialIndex = React.useMemo(() => {
    if (!value) return 0;
    const found = options.findIndex((o) => o.id === value);
    return found >= 0 ? found : 0;
  }, [options, value]);

  const [activeIndex, setActiveIndex] = React.useState(initialIndex);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, options.length - 1));
  const activeOption = options[safeActiveIndex] ?? options[0];

  const trackRef = React.useRef<HTMLDivElement>(null);
  const slideRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const frameRef = React.useRef<number | null>(null);

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

  function handleScroll() {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setActiveIndex(centeredIndex());
    });
  }

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  function go(delta: number) {
    const next = Math.min(options.length - 1, Math.max(0, safeActiveIndex + delta));
    if (next === safeActiveIndex) return;
    setActiveIndex(next);
    scrollToIndex(next, true);
  }

  function jumpTo(index: number) {
    setActiveIndex(index);
    scrollToIndex(index, true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Enter" && activeOption) {
      e.preventDefault();
      onSelect(activeOption.id);
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-4 @md:gap-6">
      {/* Header */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
          <Sparkles className="h-3 w-3 text-[var(--color-brand)]" />
          Personal fitting room
        </span>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)] @md:text-2xl">
          Who&apos;s trying this on?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--color-text-muted)] @md:text-sm">
          {options.length > 1
            ? "Choose a fit profile so we can tailor your avatar and size recommendations."
            : "We'll tailor your avatar and size recommendations to this fit profile."}
        </p>
      </div>

      {/* ── MOBILE VIEW (< @md): compact circular slider ── */}
      <div className="flex flex-col items-center gap-3 @md:hidden">
        <div
          role="region"
          aria-roledescription="carousel"
          aria-label="Who's trying this on?"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="relative -mx-4 flex w-[calc(100%+2rem)] items-center focus-visible:outline-none"
        >
          {options.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous option"
                disabled={safeActiveIndex <= 0}
                onClick={() => go(-1)}
                className={cn(
                  "absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
                  "border border-[var(--color-border)] bg-[var(--color-surface-card)]/95 text-[var(--color-text-primary)] shadow-md backdrop-blur",
                  "transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-0"
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next option"
                disabled={safeActiveIndex >= options.length - 1}
                onClick={() => go(1)}
                className={cn(
                  "absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
                  "border border-[var(--color-border)] bg-[var(--color-surface-card)]/95 text-[var(--color-text-primary)] shadow-md backdrop-blur",
                  "transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-0"
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          <div
            ref={trackRef}
            onScroll={handleScroll}
            className="flex w-full snap-x snap-mandatory items-center overflow-x-auto overscroll-x-contain py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              aria-hidden
              className="shrink-0"
              style={{ width: `calc((100% - ${CIRCLE_SLOT_PX}px) / 2)` }}
            />
            {options.map((opt, index) => {
              const isActive = index === safeActiveIndex;
              return (
                <div
                  key={opt.id}
                  ref={(el) => {
                    slideRefs.current[index] = el;
                  }}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${opt.label}, ${index + 1} of ${options.length}`}
                  className="flex shrink-0 snap-center items-center justify-center"
                  style={{ width: CIRCLE_SLOT_PX }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isActive || options.length === 1) onSelect(opt.id);
                      else jumpTo(index);
                    }}
                    aria-label={opt.label}
                    className={cn(
                      "relative overflow-hidden rounded-full border-2 bg-[var(--color-surface-base)] transition-all duration-300 ease-out",
                      isActive || options.length === 1
                        ? "h-[104px] w-[104px] border-[var(--color-brand)] opacity-100 shadow-[var(--shadow-elevated)] ring-4 ring-[var(--color-brand-light)]"
                        : "h-[72px] w-[72px] border-[var(--color-border)] opacity-55"
                    )}
                  >
                    <Image
                      src={DEMO_FACE_URLS[opt.id]}
                      alt=""
                      fill
                      sizes="104px"
                      className="object-cover object-top"
                      unoptimized
                      draggable={false}
                    />
                  </button>
                </div>
              );
            })}
            <div
              aria-hidden
              className="shrink-0"
              style={{ width: `calc((100% - ${CIRCLE_SLOT_PX}px) / 2)` }}
            />
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-2 text-center">
          {activeOption && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-brand-strong)]">
                {activeOption.eyebrow}
              </p>
              <p className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">{activeOption.label}</p>
              <p className="mx-auto mt-0.5 max-w-[16rem] text-xs leading-snug text-[var(--color-text-muted)]">
                {activeOption.description}
              </p>
            </div>
          )}
          {options.length > 1 && (
            <div className="flex items-center justify-center gap-1.5" aria-hidden>
              {options.map((opt, idx) => (
                <span
                  key={opt.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    idx === safeActiveIndex ? "w-4 gradient-brand" : "w-1.5 bg-[var(--color-border-strong)]"
                  )}
                />
              ))}
            </div>
          )}
          {activeOption && (
            <Button
              size="lg"
              onClick={() => onSelect(activeOption.id)}
              className="h-11 w-full rounded-[var(--radius-xl)] text-sm font-semibold shadow-sm"
            >
              Continue as {activeOption.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── DESKTOP VIEW (@md and up): Smart adaptive layout by option count ── */}
      <div
        className="hidden @md:block"
      >
        {options.length === 1 ? (
          /* Single-option spotlight card — centered, rich, no empty grid columns */
          (() => {
            const opt = options[0];
            return (
              <button
                type="button"
                onClick={() => onSelect(opt.id)}
                className={cn(
                  "group mx-auto flex w-full max-w-lg items-stretch overflow-hidden rounded-[var(--radius-2xl)] border p-2.5 text-left transition-all duration-200",
                  "border-[var(--color-border-strong)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]",
                  "hover:border-[var(--color-brand)] hover:ring-4 hover:ring-[var(--color-brand-light)]"
                )}
              >
                <div className="relative w-36 shrink-0 overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-surface-base)]">
                  <Image
                    src={DEMO_FACE_URLS[opt.id]}
                    alt=""
                    fill
                    sizes="144px"
                    className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    unoptimized
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-2">
                  <div>
                    <span className="inline-flex items-center rounded-full bg-[var(--color-brand-light)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-brand-strong)]">
                      {opt.eyebrow}
                    </span>
                    <h3 className="mt-1.5 text-xl font-bold text-[var(--color-text-primary)]">{opt.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      {opt.description}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2.5">
                    <div className="flex flex-wrap gap-1">
                      {opt.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--color-surface-base)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform group-hover:translate-x-0.5">
                      Continue
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })()
        ) : options.length <= 3 ? (
          /* 2 or 3 options — balanced portrait cards */
          <div
            className={cn(
              "mx-auto grid gap-3.5",
              options.length === 2 ? "max-w-xl grid-cols-2" : "grid-cols-3"
            )}
          >
            {options.map((opt, i) => {
              const isSelected = value === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelect(opt.id)}
                  style={{ animationDelay: `${i * 0.04}s` }}
                  className={cn(
                    "animate-scale-in group flex flex-col overflow-hidden rounded-[var(--radius-2xl)] border text-left transition-all duration-200",
                    isSelected
                      ? "border-[var(--color-brand)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] ring-3 ring-[var(--color-brand-light)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-elevated)]"
                  )}
                >
                  <div className="relative h-36 w-full overflow-hidden bg-[var(--color-surface-base)]">
                    <Image
                      src={DEMO_FACE_URLS[opt.id]}
                      alt=""
                      fill
                      sizes="220px"
                      className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                      unoptimized
                    />
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent"
                    />
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      {opt.eyebrow}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-3.5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-[var(--color-text-primary)]">{opt.label}</span>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] transition-colors group-hover:bg-[var(--color-brand)] group-hover:text-white">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-[var(--color-text-muted)]">
                        {opt.description}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {opt.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[var(--color-surface-base)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* 4 to 6 options — sleek 2-column horizontal studio cards */
          <div className="grid grid-cols-2 gap-3">
            {options.map((opt, i) => {
              const isSelected = value === opt.id;
              const isLastOdd = options.length % 2 === 1 && i === options.length - 1;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelect(opt.id)}
                  style={{ animationDelay: `${i * 0.03}s` }}
                  className={cn(
                    "animate-scale-in group flex items-center gap-3.5 rounded-[var(--radius-xl)] border p-2.5 text-left transition-all duration-200",
                    isLastOdd && "col-span-2 mx-auto w-full max-w-[calc(50%-6px)]",
                    isSelected
                      ? "border-[var(--color-brand)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] ring-2 ring-[var(--color-brand-light)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)] hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-elevated)]"
                  )}
                >
                  <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface-base)]">
                    <Image
                      src={DEMO_FACE_URLS[opt.id]}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      unoptimized
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-brand-strong)]">
                      {opt.eyebrow}
                    </span>
                    <span className="block truncate text-sm font-bold text-[var(--color-text-primary)]">
                      {opt.label}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-[var(--color-text-muted)]">
                      {opt.description}
                    </span>
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] transition-colors group-hover:bg-[var(--color-brand)] group-hover:text-white">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
