"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Ban, Check, ChevronDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NOT_SENT } from "@/lib/catalog/acs-targets";
import { useAnchoredPanel } from "./parent-category-ui";

/** Tall enough for the full column list to feel scrollable rather than truncated. */
const PANEL_MAX_HEIGHT = 304;

/** Below this many options, a search box costs more attention than it saves — a merchant choosing
 *  between "text"/"number"/"boolean" has nothing worth filtering. Above it (Stage 1's column list,
 *  now every native field plus every discovered one) scanning by eye stops working. */
const SEARCH_THRESHOLD = 8;

export interface SelectOption {
  key: string;
  label: string;
  /** A line under the label saying what the option actually means — a sample value for a column, an
   *  example for a sizing system. Optional, since some lists have nothing useful to add. */
  hint?: string;
  /**
   * Section heading this option sits under. Options sharing a group must be adjacent — the header is
   * rendered when the group changes, so an interleaved list would repeat headings.
   *
   * Needed because Stage 1's column list mixes three different kinds of thing (fields every product
   * has, this store's variant options, its custom data) and an unlabelled run of forty entries gives
   * a merchant no way to tell which is which.
   */
  group?: string;
}

/**
 * The one dropdown Stage 1 uses, for choosing an ACS destination, an option-group role or a sizing
 * system.
 *
 * A custom listbox rather than a `<select>`, for the reason `ParentSelect` is: a native dropdown's
 * options are painted by the operating system, ignore every theme token this app sets, and rendered
 * as unreadable grey-on-white here. They also cannot carry a second line under each label, which is
 * where the useful half of the information lives — `brands[0]` for a destination, "XS, S, M, L" for
 * a sizing system.
 */
export function MappingSelect({
  options,
  value,
  onChange,
  label,
  saving = false,
  placeholder,
  compact = false,
  className,
}: {
  options: readonly SelectOption[];
  value: string;
  onChange: (key: string) => void;
  /** What this is choosing for, announced to screen readers — a column of identically-labelled
   *  dropdowns is meaningless without it. */
  label: string;
  saving?: boolean;
  /** Shown when `value` matches no option, for a list that starts unchosen. */
  placeholder?: string;
  /** Tighter padding, for the inline controls inside a row rather than the row's own destination. */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // Where the keyboard is, which is not what is chosen: arrowing must not commit until Enter, or
  // every pass over the list rewrites the merchant's choice.
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const showSearch = options.length > SEARCH_THRESHOLD;
  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(q) || option.group?.toLowerCase().includes(q)
    );
  }, [options, query]);

  // Measured from the list itself rather than a fixed guess: the estimate decides whether to open
  // upwards, and a five-option list told it was 320px tall flips when it would have fitted below.
  const estimatedHeight = Math.min(
    (showSearch ? 40 : 0) +
      filteredOptions.reduce(
        (total, option, index) =>
          total +
          (option.hint ? 41 : 28) +
          (option.group && option.group !== filteredOptions[index - 1]?.group ? 22 : 0),
        0
      ) +
      8,
    PANEL_MAX_HEIGHT
  );
  const rect = useAnchoredPanel(triggerRef, open, estimatedHeight);
  const panelId = `${React.useId()}-listbox`;

  const selectedIndex = options.findIndex((option) => option.key === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  // `ignore` is the option-group spelling of the same "goes nowhere" choice as `NOT_SENT`.
  const isNotSent = value === NOT_SENT || value === "ignore";

  function openWith(index: number) {
    setQuery("");
    setActiveIndex(Math.max(index, 0));
    setOpen(true);
  }

  function commit(key: string) {
    onChange(key);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Move focus onto the panel (or the search box, when there is one) so arrow keys reach it;
  // without this the first ArrowDown after opening is swallowed by the page scroll.
  React.useEffect(() => {
    if (!open) return;
    if (showSearch) searchRef.current?.focus();
    else panelRef.current?.focus();
  }, [open, showSearch]);

  // A filter that drops the active row (or empties out entirely) must not leave the active row
  // pointing past the end of the visible list, or Enter would commit nothing. Clamped here, at
  // read time, rather than written back into `activeIndex` itself — a query the merchant is still
  // typing should never trigger a second render just to correct a number nothing yet reads.
  const activeIndexInList = Math.min(activeIndex, Math.max(filteredOptions.length - 1, 0));

  // Pointer-down rather than click: clicking another row's trigger would otherwise close this panel
  // and open that one in a single gesture, which reads as the click being swallowed.
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
      openWith(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWith(options.length - 1);
    }
  }

  function onPanelKeyDown(event: React.KeyboardEvent) {
    if (filteredOptions.length === 0) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % filteredOptions.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        commit(filteredOptions[activeIndexInList].key);
        break;
      case " ":
        // A literal space is real input while typing a search query; only treated as "select the
        // active row" when there is no search box to type it into.
        if (showSearch) break;
        event.preventDefault();
        commit(filteredOptions[activeIndexInList].key);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
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
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        disabled={saving}
        onClick={() => (open ? setOpen(false) : openWith(selectedIndex))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border text-xs font-bold transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]",
          "disabled:opacity-60",
          compact ? "px-2 py-1" : "w-[10.5rem] px-2.5 py-1.5",
          isNotSent || !selected
            ? "border-[var(--color-border-strong)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
            : "border-[var(--color-brand)]/40 bg-[var(--color-surface-card)] text-[var(--color-text-primary)] hover:border-[var(--color-brand)]",
          className
        )}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-brand)]" />
        ) : (
          isNotSent && <Ban className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate text-left">{selected?.label ?? placeholder ?? "Choose…"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              minWidth: Math.max(rect.width, 220),
              maxHeight: Math.min(rect.available, PANEL_MAX_HEIGHT),
            }}
            className={cn(rect.themeClass, "z-50 flex flex-col overflow-hidden")}
          >
            <div
              ref={panelRef}
              id={panelId}
              role="listbox"
              aria-label={label}
              tabIndex={showSearch ? undefined : -1}
              onKeyDown={onPanelKeyDown}
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky,var(--color-surface-card))] shadow-[var(--shadow-elevated)] focus:outline-none"
            >
              {showSearch && (
                <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-border)] px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={onPanelKeyDown}
                    placeholder="Search columns…"
                    className="w-full bg-transparent text-xs font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {filteredOptions.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">No matches</div>
                )}
                {filteredOptions.map((option, index) => {
              const isSelected = option.key === value;
              const isActive = index === activeIndexInList;
              const heading =
                option.group && option.group !== filteredOptions[index - 1]?.group ? option.group : null;
              return (
                <React.Fragment key={option.key}>
                  {heading && (
                    <div
                      // Not an `option`: it is a label, and giving it a role would put it in the
                      // listbox's own count and let arrow keys land on something uncommittable.
                      role="presentation"
                      className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]"
                    >
                      {heading}
                    </div>
                  )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(option.key)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors",
                    isActive
                      ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                      : "text-[var(--color-text-secondary)]"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{option.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </span>
                    {option.hint && (
                      <span className="mt-0.5 block truncate text-[10px] font-normal text-[var(--color-text-muted)]">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </button>
                </React.Fragment>
              );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
