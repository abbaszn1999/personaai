"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  CircleDashed,
  Footprints,
  Layers,
  Shield,
  Shirt,
  Sparkles,
} from "lucide-react";
import {
  SIZING_GROUP_KEYS,
  SIZING_GROUP_LABELS,
  SIZING_GROUP_SCOPES,
  SIZING_GROUPS,
  MEASUREMENTS,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { cn } from "@/lib/utils/cn";

/**
 * The five parent sizing categories as the merchant sees them: one icon, one accent and one label
 * each, used identically by the mapping grid's summary tiles, its per-row selector and every screen
 * downstream that has to say which parent something landed on.
 *
 * The accents are theme tokens, not literals. They used to be literal mid-tone hex — the values a
 * light card wants — and every one of them was also being painted onto the near-black store
 * surface, where the darkest of them sat around 2.4:1 and simply could not be read. `globals.css`
 * carries a lifted set for that surface, so both themes get an accent that works instead of one
 * theme borrowing the other's.
 */
const PARENT_ACCENTS: Record<SizingGroup, string> = {
  tops: "var(--color-parent-tops)",
  outerwear: "var(--color-parent-outerwear)",
  bottoms: "var(--color-parent-bottoms)",
  dresses: "var(--color-parent-dresses)",
  footwear: "var(--color-parent-footwear)",
};

const PARENT_ICONS: Record<SizingGroup, React.ComponentType<{ className?: string }>> = {
  tops: Shirt,
  outerwear: Shield,
  bottoms: Layers,
  dresses: Sparkles,
  footwear: Footprints,
};

export const PARENT_OPTIONS = SIZING_GROUP_KEYS;

export function parentLabel(group: SizingGroup): string {
  return SIZING_GROUP_LABELS[group];
}

export function parentAccent(group: SizingGroup): string {
  return PARENT_ACCENTS[group];
}

/** What the parent covers, in garment words. Shown wherever the choice is made, because the labels
 *  alone mislead — "Dresses / Full-body" on a menswear path looks inapplicable until you read that
 *  it owns suits, jumpsuits and overalls too. */
export function parentScope(group: SizingGroup): string {
  return SIZING_GROUP_SCOPES[group];
}

/** The measurements a chart for this parent must carry, in the merchant's words — shown on the
 *  summary tiles so the consequence of a mapping is visible while it is being chosen. */
export function requiredFieldLabels(group: SizingGroup): string[] {
  return SIZING_GROUPS[group].required.map((measurement) => MEASUREMENTS[measurement].label);
}

/** A low-opacity wash of the parent's accent, legible against either theme's card surface. */
function tint(group: SizingGroup, percent: number): string {
  return `color-mix(in srgb, ${PARENT_ACCENTS[group]} ${percent}%, transparent)`;
}

export function ParentIcon({ group, className }: { group: SizingGroup; className?: string }) {
  const Icon = PARENT_ICONS[group];
  return <Icon className={cn("h-4 w-4", className)} />;
}

/** Read-only pill naming a parent. */
export function ParentBadge({ group, className }: { group: SizingGroup; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
        className
      )}
      style={{
        backgroundColor: tint(group, 14),
        color: PARENT_ACCENTS[group],
        boxShadow: `inset 0 0 0 1px ${tint(group, 32)}`,
      }}
    >
      <ParentIcon group={group} className="h-3 w-3" />
      {parentLabel(group)}
    </span>
  );
}

/**
 * The per-row parent selector in the mapping grid.
 *
 * `value` is nullable because an unmapped path is a real state the merchant has to be able to see
 * and is blocked from leaving — it renders as an explicit "Not mapped yet" rather than silently
 * defaulting to Tops, which would let someone tab past a decision they never made.
 *
 * A listbox rather than a `<select>`. The options panel of a native select is drawn by the OS, not
 * the page: it ignores the theme, so on the dark store surface it came up as near-black text on
 * near-black with the OS's own blue highlight, and it could not carry the per-parent icon and color
 * that make the choice scannable in the first place. The panel is fixed-positioned into a portal
 * because the mapping table scrolls inside an `overflow-hidden` card, which would otherwise clip it.
 */
export function ParentSelect({
  value,
  onChange,
  id,
  label,
}: {
  value: SizingGroup | null;
  onChange: (group: SizingGroup) => void;
  id?: string;
  /** What this selector is choosing a parent *for*, announced to screen readers, since a column of
   *  identically-labelled selectors is meaningless without it. */
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // Which option the keyboard is on, which is not the same as which is chosen: arrowing through the
  // list must not commit until Enter, or every pass over the list rewrites the merchant's mapping.
  const [activeIndex, setActiveIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Roughly five two-line options plus padding — only used to decide whether to flip above the
  // trigger, so it wants to be close, not exact.
  const rect = useAnchoredPanel(triggerRef, open, 330);
  const panelId = `${React.useId()}-parent-listbox`;

  function openWith(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function commit(group: SizingGroup) {
    onChange(group);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Move focus onto the panel so the arrow keys reach it. Without this the trigger keeps focus and
  // the first ArrowDown after opening is swallowed by the page scroll.
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Pointer-down rather than click: a click on another row's trigger would otherwise close this
  // panel and open that one in the same gesture, which reads as the click being swallowed.
  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWith(value ? PARENT_OPTIONS.indexOf(value) : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWith(PARENT_OPTIONS.length - 1);
    }
  }

  function onPanelKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % PARENT_OPTIONS.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + PARENT_OPTIONS.length) % PARENT_OPTIONS.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(PARENT_OPTIONS.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(PARENT_OPTIONS[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label ? `Parent sizing category for ${label}` : undefined}
        onClick={() => (open ? setOpen(false) : openWith(value ? PARENT_OPTIONS.indexOf(value) : 0))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-2 text-xs font-bold transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]",
          value ? "hover:brightness-110" : "hover:brightness-105"
        )}
        style={
          value
            ? {
                backgroundColor: tint(value, open ? 22 : 14),
                color: PARENT_ACCENTS[value],
                boxShadow: `inset 0 0 0 1px ${tint(value, open ? 55 : 32)}`,
              }
            : {
                backgroundColor: "var(--color-warning-light)",
                color: "var(--color-warning)",
                boxShadow: `inset 0 0 0 1px var(--color-warning-border, var(--color-warning))`,
              }
        }
      >
        {value ? (
          <ParentIcon group={value} className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <CircleDashed className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate text-left">
          {value ? parentLabel(value) : "Not mapped yet"}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="listbox"
            aria-label="Parent sizing category"
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-50 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky,var(--color-surface-card))] p-1 shadow-[var(--shadow-elevated)] focus:outline-none"
          >
            {PARENT_OPTIONS.map((group, index) => {
              const isSelected = group === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={group}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(group)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive ? tint(group, 18) : "transparent",
                    color: isActive || isSelected ? PARENT_ACCENTS[group] : "var(--color-text-secondary)",
                  }}
                >
                  <ParentIcon group={group} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{parentLabel(group)}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </span>
                    {/* The scope, not decoration: without it nobody picks Full-body for a men's
                        suits path, and the whole path is then sized against the wrong chart. */}
                    <span className="mt-0.5 block text-[10px] font-normal leading-snug text-[var(--color-text-muted)]">
                      {parentScope(group)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Tracks where a fixed-position panel should sit under its trigger.
 *
 * Fixed rather than absolute so the card's `overflow-hidden` cannot clip it, which in turn means
 * the coordinates go stale the moment anything scrolls — hence the listeners, capturing so that
 * scrolling the table itself counts and not just the page. Flips above the trigger near the
 * viewport bottom, which is where the last rows of a long mapping table live.
 */
function useAnchoredPanel(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  estimatedHeight = 200
) {
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  // Layout effect, and no teardown of the last measurement: the panel is not rendered while closed,
  // so a stale rect is unobservable, and re-measuring before paint means reopening cannot flash at
  // the old coordinates.
  React.useLayoutEffect(() => {
    if (!open) return;

    function measure() {
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const below = window.innerHeight - box.bottom;
      const flip = below < estimatedHeight && box.top > below;
      setRect({
        top: flip ? box.top - estimatedHeight - 6 : box.bottom + 6,
        left: box.left,
        width: box.width,
      });
    }

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [ref, open, estimatedHeight]);

  return rect;
}
