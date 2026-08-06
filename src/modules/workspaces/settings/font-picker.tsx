"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { FONT_PICKER_OPTIONS, SYSTEM_FONT_VALUE, fontFamilyCssValue, loadGoogleFont } from "@/lib/fonts/google-fonts";
import { cn } from "@/lib/utils/cn";

interface FontPickerProps {
  value: string;
  onChange: (fontFamily: string) => void;
}

/** Searchable dropdown over the curated Google Fonts list (see `src/lib/fonts/google-fonts.ts`)
 *  — each visible option lazily loads its own webfont so it previews in its real typeface
 *  while scrolling the list, not just after selecting it. */
export function FontPicker({ value, onChange }: FontPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Load the currently-selected font immediately so the trigger button previews it correctly.
  React.useEffect(() => {
    loadGoogleFont(value);
  }, [value]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FONT_PICKER_OPTIONS;
    return FONT_PICKER_OPTIONS.filter((f) => f.toLowerCase().includes(q));
  }, [query]);

  // Lazily load webfonts for whatever's currently visible in the filtered list, so previews
  // render in the real typeface without eagerly fetching all ~70 fonts up front.
  React.useEffect(() => {
    if (!open) return;
    filtered.slice(0, 40).forEach((f) => loadGoogleFont(f));
  }, [open, filtered]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 px-3 flex items-center justify-between gap-2 text-sm bg-[var(--color-surface-card)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-brand)]"
      >
        <span style={{ fontFamily: fontFamilyCssValue(value) }} className="truncate">
          {value === SYSTEM_FONT_VALUE ? "System default" : value}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)] shrink-0" />
      </button>

      {open && (
        // Solid, always-opaque background rather than `--color-surface-card` — inside the
        // dashboard's `.dashboard-theme` wrapper that variable is a near-transparent "glass"
        // tint meant to be paired with `backdrop-filter: blur(...)` on a static card; a
        // floating list rendered directly in the layout (no blur) needs a real solid surface
        // or the page behind shows straight through it.
        <div className="absolute z-20 mt-1.5 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-sidebar-bg)] shadow-[var(--shadow-modal)] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
            <Search className="h-3.5 w-3.5 text-[var(--color-text-muted)] shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts…"
              className="flex-1 text-sm bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto sidebar-scroll py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">No fonts match &quot;{query}&quot;</p>
            )}
            {filtered.map((f) => {
              const active = value === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    onChange(f);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors",
                    active ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "text-[var(--color-text-primary)] hover:bg-white/[0.06]"
                  )}
                >
                  <span style={{ fontFamily: fontFamilyCssValue(f) }} className="truncate">
                    {f === SYSTEM_FONT_VALUE ? "System default" : f}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
