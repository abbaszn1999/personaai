"use client";

import * as React from "react";
import { Check, Pencil, Plus, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { useWearableTheme } from "../theme-context";

interface ProfileMeta {
  id: string;
  label: string;
}

/** Finds the nearest ancestor that actually clips overflowing content (`overflow: hidden` /
 *  `clip` / `scroll` / `auto`), and returns its horizontal bounds. The popover below used to
 *  clamp itself against `window.innerWidth` instead — correct for a widget that fills the
 *  whole browser tab, but wrong the moment it's rendered inside a narrower clipping box (a
 *  phone-sized mobile preview frame in the dashboard, an iframe, a scrollable card): the panel
 *  would measure itself as "well within the window" and never shift, while the actual visible
 *  boundary — the frame's own edge — had already clipped half of it off-screen. Falls back to
 *  the full window when no clipping ancestor exists, which keeps the original full-width
 *  widget behavior unchanged. */
function getClippingBounds(el: HTMLElement): { left: number; right: number } {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(hidden|clip|scroll|auto)/.test(style.overflowX) || /(hidden|clip|scroll|auto)/.test(style.overflow)) {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }
    node = node.parentElement;
  }
  return { left: 0, right: window.innerWidth };
}

/** This control floats over two very different surfaces — the onboarding card and the avatar
 *  panel — so it can't inherit a background. The dark set is the original glass treatment
 *  (correct over a photo-backed avatar panel and a dark embed); the light set exists because
 *  white-on-translucent-black is unreadable once a merchant picks the light theme. */
const SWITCHER_STYLES = {
  dark: {
    pill: "border-white/15 bg-black/55 text-white/85 hover:bg-black/70 hover:text-white shadow-[0_4px_16px_rgba(0,0,0,0.35)]",
    panel: "border-white/[0.1] bg-[rgba(12,10,18,0.97)] shadow-[0_16px_48px_rgba(0,0,0,0.6)]",
    panelLabel: "text-white/35",
    row: "hover:bg-white/[0.06]",
    rowActive: "bg-white/[0.1]",
    rowText: "text-white/85",
    renameInput: "bg-white/10 text-white",
    iconButton: "text-white/35 hover:bg-white/[0.08] hover:text-white/80",
    addButton: "border-white/[0.1] text-white/70 hover:bg-white/[0.06] hover:text-white",
  },
  light: {
    pill: "border-black/10 bg-white/90 text-[var(--color-text-secondary)] hover:bg-white hover:text-[var(--color-text-primary)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]",
    panel: "border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_16px_48px_rgba(0,0,0,0.18)]",
    panelLabel: "text-[var(--color-text-muted)]",
    row: "hover:bg-black/[0.04]",
    rowActive: "bg-black/[0.06]",
    rowText: "text-[var(--color-text-primary)]",
    renameInput: "bg-black/[0.06] text-[var(--color-text-primary)]",
    iconButton: "text-[var(--color-text-muted)] hover:bg-black/[0.06] hover:text-[var(--color-text-primary)]",
    addButton:
      "border-black/10 text-[var(--color-text-secondary)] hover:bg-black/[0.04] hover:text-[var(--color-text-primary)]",
  },
} as const;

interface ProfileSwitcherProps {
  profiles: ProfileMeta[];
  activeProfileId: string;
  maxProfiles: number;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, label: string) => void;
  /** Deletes a profile. Offered only while more than one profile exists, and only after a confirm. */
  onDelete?: (id: string) => void;
  onSignOut?: () => void;
  /** Positioning only — the popover itself is always `absolute` under the pill so it never
   *  stretches a chat header. Pass `absolute left-4 top-4` for the onboarding overlay. */
  className?: string;
  /** Which edge of the pill the menu hangs from. `end` opens toward the left, which suits a
   *  pill on the right of a row. `start` opens toward the right, for a pill docked in the
   *  card's top-left corner. */
  menuAlign?: "start" | "end";
  /** Tighter pill and menu. Used on the onboarding card, where the open list was covering the
   *  step underneath. The chat header keeps the roomier default. */
  compact?: boolean;
  /** A guest visit: no profiles to list, just a note that nothing is saved and a way to sign in. */
  guest?: boolean;
}

/** Pill + popover for switching between up to `maxProfiles` profiles on a signed-in shopper
 *  account (e.g. a parent shopping for themselves and their kids). Profiles can be created,
 *  switched between, renamed and deleted here (the last remaining one cannot be deleted). */
export function ProfileSwitcher({
  profiles,
  activeProfileId,
  maxProfiles,
  onSwitch,
  onAdd,
  onRename,
  onDelete,
  onSignOut,
  className,
  menuAlign = "end",
  compact = false,
  guest = false,
}: ProfileSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftLabel, setDraftLabel] = React.useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [panelOffsetX, setPanelOffsetX] = React.useState(0);
  const styles = SWITCHER_STYLES[useWearableTheme()];

  useClickOutside(
    rootRef,
    React.useCallback(() => {
      setOpen(false);
      setEditingId(null);
      setConfirmingDeleteId(null);
    }, []),
    open
  );

  // The menu hangs off one side of the pill and can run past the widget edge (a narrow phone
  // frame, or a pill docked in a corner). Nudge it back inside the nearest clipping boundary
  // instead of letting it get cut off — see getClippingBounds for why that boundary isn't
  // always the window.
  React.useLayoutEffect(() => {
    if (!open || !panelRef.current) {
      setPanelOffsetX(0);
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    const bounds = getClippingBounds(panelRef.current);
    const margin = 8;
    let shift = 0;
    if (rect.left < bounds.left + margin) shift = bounds.left + margin - rect.left;
    else if (rect.right > bounds.right - margin) shift = bounds.right - margin - rect.right;
    setPanelOffsetX(shift);
  }, [open]);

  // Only worth showing once there's actually a choice to make or room to add one — a lone
  // profile with no room to grow would just be a confusing button that does nothing useful.
  if (!guest && profiles.length <= 1 && profiles.length >= maxProfiles) return null;

  if (guest) {
    return (
      <div
        ref={rootRef}
        className={cn("relative z-40 shrink-0", className)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Guest visit"
          className={cn(
            "flex items-center rounded-full border backdrop-blur-xl font-medium transition-colors",
            compact ? "min-h-8 gap-1 px-2.5 text-[11px]" : "min-h-11 gap-1.5 px-3.5 text-[12px]",
            styles.pill
          )}
        >
          <User className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          <span>Guest</span>
        </button>

        {open && (
          <div
            ref={panelRef}
            style={panelOffsetX ? { transform: `translateX(${panelOffsetX}px)` } : undefined}
            className={cn(
              "absolute top-full z-50 border backdrop-blur-2xl",
              compact ? "mt-1 w-[10.25rem] rounded-xl p-2" : "mt-2 w-60 rounded-2xl p-3",
              menuAlign === "start" ? "left-0" : "right-0",
              styles.panel
            )}
          >
            <p className={cn("leading-snug", compact ? "text-[11px]" : "text-[13px]", styles.rowText)}>
              You&apos;re browsing as a guest. Nothing is saved, and your measurements and avatar are cleared when you
              leave.
            </p>
            {onSignOut && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className={cn(
                  "mt-2 w-full border font-medium transition-colors",
                  compact ? "min-h-7 rounded-lg px-2 text-[11px]" : "min-h-11 rounded-xl px-2 text-[13px]",
                  styles.addButton
                )}
              >
                Sign in to save profiles
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const active = profiles.find((p) => p.id === activeProfileId);

  function commitRename(id: string) {
    const trimmed = draftLabel.trim();
    if (trimmed) onRename(id, trimmed);
    setEditingId(null);
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative z-40 shrink-0", className)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setConfirmingDeleteId(null);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch profile — currently ${active?.label || "Profile"}`}
        className={cn(
          "flex items-center rounded-full border backdrop-blur-xl font-medium transition-colors",
          compact ? "min-h-8 gap-1 px-2.5 text-[11px]" : "min-h-11 gap-1.5 px-3.5 text-[12px]",
          styles.pill
        )}
      >
        <User className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        <span className={cn("truncate", compact ? "max-w-[72px]" : "max-w-[88px]")}>{active?.label || "Profile"}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={panelOffsetX ? { transform: `translateX(${panelOffsetX}px)` } : undefined}
          className={cn(
            "absolute top-full z-50 border backdrop-blur-2xl",
            compact ? "mt-1 w-[10.25rem] rounded-xl p-1" : "mt-2 w-60 rounded-2xl p-2",
            menuAlign === "start" ? "left-0" : "right-0",
            styles.panel
          )}
        >
          <p
            className={cn(
              "font-bold uppercase",
              compact
                ? "px-1.5 pb-1 text-[9px] tracking-[0.12em]"
                : "px-1.5 pb-1.5 text-[10px] tracking-[0.16em]",
              styles.panelLabel
            )}
          >
            Profiles ({profiles.length}/{maxProfiles})
          </p>
          <div className={compact ? "space-y-0.5" : "space-y-1"}>
            {profiles.map((p) =>
              confirmingDeleteId === p.id ? (
                <div key={p.id} className={cn(compact ? "rounded-lg px-2 py-1.5" : "rounded-xl px-3 py-2.5", styles.row)}>
                  <p className={cn(compact ? "text-[11px] leading-snug" : "text-[13px] leading-snug", styles.rowText)}>
                    Delete <span className="font-semibold">{p.label}</span>? Its measurements and avatar will be removed.
                  </p>
                  <div className={cn("flex gap-1.5", compact ? "mt-1.5" : "mt-2")}>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 font-medium transition-colors",
                        compact ? "min-h-7 text-[11px]" : "min-h-10 text-[12px]",
                        styles.addButton
                      )}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDeleteId(null);
                        setOpen(false);
                        onDelete?.(p.id);
                      }}
                      className={cn(
                        "flex-1 rounded-lg bg-[var(--color-error)] px-2 font-semibold text-white transition-opacity hover:opacity-90",
                        compact ? "min-h-7 text-[11px]" : "min-h-10 text-[12px]"
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
              <div
                key={p.id}
                className={cn(
                  "flex items-center transition-colors",
                  compact ? "min-h-8 gap-0.5 rounded-lg px-1.5" : "min-h-12 gap-1 rounded-xl px-2",
                  p.id === activeProfileId ? styles.rowActive : styles.row
                )}
              >
                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(p.id);
                      else if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => commitRename(p.id)}
                    className={cn(
                      "flex-1 min-w-0 rounded-lg px-1.5 text-[16px] outline-none",
                      compact ? "h-7" : "h-10 px-2",
                      styles.renameInput
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSwitch(p.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex flex-1 min-w-0 items-center text-left",
                      compact ? "min-h-8 gap-1 text-[12px]" : "min-h-12 gap-1.5 text-[13px]",
                      styles.rowText
                    )}
                  >
                    {p.id === activeProfileId && (
                      <Check className={cn("shrink-0 text-[var(--color-brand)]", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                    )}
                    <span className="truncate">{p.label}</span>
                  </button>
                )}

                {editingId !== p.id && (
                  <button
                    type="button"
                    title="Rename"
                    aria-label={`Rename ${p.label}`}
                    onClick={() => {
                      setEditingId(p.id);
                      setDraftLabel(p.label);
                    }}
                    className={cn(
                      "shrink-0 rounded-full flex items-center justify-center transition-colors",
                      compact ? "h-7 w-7" : "h-10 w-10",
                      styles.iconButton
                    )}
                  >
                    <Pencil className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                  </button>
                )}

                {editingId !== p.id && onDelete && profiles.length > 1 && (
                  <button
                    type="button"
                    title="Delete"
                    aria-label={`Delete ${p.label}`}
                    onClick={() => setConfirmingDeleteId(p.id)}
                    className={cn(
                      "shrink-0 rounded-full flex items-center justify-center transition-colors",
                      compact ? "h-7 w-7" : "h-10 w-10",
                      styles.iconButton,
                      "hover:text-[var(--color-error)]!"
                    )}
                  >
                    <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                  </button>
                )}
              </div>
              )
            )}
          </div>

          {profiles.length < maxProfiles && (
            <button
              type="button"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-center border font-medium transition-colors",
                compact
                  ? "mt-1 min-h-7 gap-1 rounded-lg px-2 text-[11px]"
                  : "mt-1.5 min-h-11 gap-1.5 rounded-xl px-2 text-[13px]",
                styles.addButton
              )}
            >
              <Plus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> Add profile
            </button>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={cn(
                "w-full font-medium transition-colors",
                compact ? "mt-0.5 min-h-7 rounded-lg px-2 text-[11px]" : "mt-1 min-h-11 rounded-xl px-2 text-[12px]",
                styles.addButton
              )}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
