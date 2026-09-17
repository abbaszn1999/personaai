"use client";

import * as React from "react";
import { Check, Pencil, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { useWearableTheme } from "../theme-context";

interface ProfileMeta {
  id: string;
  label: string;
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
  accountEmail?: string | null;
  onSignOut?: () => void;
  /** Positioning only — the popover itself is always `absolute` under the pill so it never
   *  stretches a chat header. Pass `absolute right-3 top-3` for the onboarding overlay. */
  className?: string;
  /** Mobile's collapsed chat sheet is only ~72px tall, so the menu has to open upward
   *  onto the avatar; everywhere else it opens down. */
  menuPlacement?: "down" | "up";
}

/** Pill + popover for switching between up to `maxProfiles` profiles on a signed-in shopper
 *  account (e.g. a parent shopping for themselves and their kids). Profiles can only ever be
 *  created, switched between, and renamed here — never deleted. */
export function ProfileSwitcher({
  profiles,
  activeProfileId,
  maxProfiles,
  onSwitch,
  onAdd,
  onRename,
  accountEmail,
  onSignOut,
  className,
  menuPlacement = "down",
}: ProfileSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftLabel, setDraftLabel] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [panelOffsetX, setPanelOffsetX] = React.useState(0);
  const styles = SWITCHER_STYLES[useWearableTheme()];

  useClickOutside(
    rootRef,
    React.useCallback(() => {
      setOpen(false);
      setEditingId(null);
    }, []),
    open
  );

  // The popover is anchored `right-0` under the pill, which overflows the widget's left edge
  // once the pill itself sits close to that edge (narrow mobile frames, or the switcher docked
  // top-left elsewhere). Nudge it back inside the nearest scrollable/embed boundary instead of
  // letting it clip.
  React.useLayoutEffect(() => {
    if (!open || !panelRef.current) {
      setPanelOffsetX(0);
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    const margin = 8;
    let shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) shift = window.innerWidth - margin - rect.right;
    setPanelOffsetX(shift);
  }, [open]);

  // Only worth showing once there's actually a choice to make or room to add one — a lone
  // profile with no room to grow would just be a confusing button that does nothing useful.
  if (profiles.length <= 1 && profiles.length >= maxProfiles) return null;

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
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch profile — currently ${active?.label || "Profile"}`}
        className={cn(
          "flex min-h-11 items-center gap-1.5 rounded-full border backdrop-blur-xl px-3.5 text-[12px] font-medium transition-colors",
          styles.pill
        )}
      >
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[88px] truncate">{active?.label || "Profile"}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={panelOffsetX ? { transform: `translateX(${panelOffsetX}px)` } : undefined}
          className={cn(
            "absolute right-0 w-60 rounded-2xl border backdrop-blur-2xl p-2",
            menuPlacement === "up" ? "bottom-full mb-2" : "top-full mt-2",
            styles.panel
          )}
        >
          <p className={cn("px-1.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em]", styles.panelLabel)}>
            Profiles ({profiles.length}/{maxProfiles})
          </p>
          <div className="space-y-1">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex min-h-12 items-center gap-1 rounded-xl px-2 transition-colors",
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
                      "h-10 flex-1 min-w-0 rounded-lg px-2 text-[16px] outline-none",
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
                    className={cn("flex min-h-12 flex-1 min-w-0 items-center gap-1.5 text-left text-[13px]", styles.rowText)}
                  >
                    {p.id === activeProfileId && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />}
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
                      "h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors",
                      styles.iconButton
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {profiles.length < maxProfiles && (
            <button
              type="button"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
              className={cn(
                "mt-1.5 min-h-11 w-full flex items-center justify-center gap-1.5 rounded-xl border px-2 text-[13px] font-medium transition-colors",
                styles.addButton
              )}
            >
              <Plus className="h-3.5 w-3.5" /> Add profile
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
                "mt-1 min-h-11 w-full rounded-xl px-2 text-[12px] font-medium transition-colors",
                styles.addButton
              )}
            >
              {accountEmail ? `Sign out · ${accountEmail}` : "Sign out"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
