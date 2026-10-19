/** Shared class tokens for the mobile surfaces that are *not* layered directly over the
 *  avatar photo — the full-screen chat panel and the full-cover panels (Fit Analysis, Edit Stats,
 *  Size Guide) that open over the avatar.
 *
 *  These used to hardcode `#0d0c12` / `#0a0910` / `text-white` in a few dozen places, so a
 *  merchant on the light theme ended up with a black sheet holding a white, theme-aware
 *  profile popover — the clash that made the widget look unfinished on a phone. Chrome that
 *  genuinely sits on the photo (the fit badge, the mode toggle) stays dark glass in both
 *  themes on purpose: it has a photo behind it, not a themed surface.
 */
export const MOBILE_SURFACE = {
  dark: {
    headerTitle: "text-white",
    headerMeta: "text-white/45",
    launcher: "bg-[#151320]/95 border border-white/[0.12]",
    inputRow: "border-white/[0.07]",
    input:
      "bg-white/[0.07] border-white/[0.12] text-white placeholder:text-white/35 focus:border-[var(--color-brand)]/60",
    quickReply: "border-white/[0.15] text-white/65 active:bg-white/[0.07]",

    panel: "bg-[#0a0910]/[0.98]",
    panelBorder: "border-white/[0.07]",
    panelTitle: "text-white",
    panelDivider: "bg-white/[0.07]",
    panelClose: "bg-white/[0.10] text-white/65 active:bg-white/20",
    panelLabel: "text-white/40",
    panelValue: "text-white",
    panelMuted: "text-white/40",
    panelTrack: "bg-white/[0.08]",
    panelField: "bg-white/[0.07] border-white/[0.10] text-white",
    panelSecondaryButton: "bg-white/[0.07] border-white/[0.10] text-white/80 active:bg-white/[0.14]",
    panelCard: "border-white/[0.08] bg-white/[0.03]",
    sizeChipIdle: "border-white/[0.06] bg-white/[0.05] text-white/40",
  },
  light: {
    headerTitle: "text-[var(--color-text-primary)]",
    headerMeta: "text-[var(--color-text-muted)]",
    launcher: "bg-white/95 border border-black/[0.08]",
    inputRow: "border-black/[0.07]",
    input:
      "bg-black/[0.04] border-black/[0.10] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)]",
    quickReply: "border-black/[0.12] text-[var(--color-text-secondary)] active:bg-black/[0.05]",

    panel: "bg-white/[0.98]",
    panelBorder: "border-black/[0.07]",
    panelTitle: "text-[var(--color-text-primary)]",
    panelDivider: "bg-black/[0.07]",
    panelClose: "bg-black/[0.06] text-[var(--color-text-secondary)] active:bg-black/[0.12]",
    panelLabel: "text-[var(--color-text-muted)]",
    panelValue: "text-[var(--color-text-primary)]",
    panelMuted: "text-[var(--color-text-muted)]",
    panelTrack: "bg-black/[0.08]",
    panelField: "bg-black/[0.04] border-black/[0.10] text-[var(--color-text-primary)]",
    panelSecondaryButton:
      "bg-black/[0.04] border-black/[0.10] text-[var(--color-text-secondary)] active:bg-black/[0.10]",
    panelCard: "border-black/[0.08] bg-black/[0.02]",
    sizeChipIdle: "border-black/[0.06] bg-black/[0.04] text-[var(--color-text-muted)]",
  },
} as const;

/** Bottom padding that clears the iPhone home indicator without adding a gap on phones
 *  that don't have one. */
export const SAFE_BOTTOM = "pb-[max(0.75rem,env(safe-area-inset-bottom))]";

/** 16px is the largest font size iOS will render in a text field without zooming the whole
 *  page on focus, which on an embedded widget leaves the host page scrolled and scaled. */
export const NO_IOS_ZOOM_TEXT = "text-[16px]";

/** Space the controls layered over the avatar keep clear of at the bottom of the frame, as a CSS
 *  length. The avatar screen no longer has a sheet under it, so this is just the home indicator
 *  plus a little air; `MobileChatLayout` sets it, and every control positions itself against it
 *  instead of the frame's own bottom edge. */
export const SHEET_H = "var(--sheet-h, 0px)";

/** How long the chat panel's slide takes, in ms. Anything measured against the panel (the
 *  message list's scroll position) is read again once this has passed. */
export const CHAT_PANEL_TRANSITION_MS = 320;
export const CHAT_PANEL_SETTLE_MS = CHAT_PANEL_TRANSITION_MS + 40;

/** A long ease-out: fast off the mark, then a soft landing, so opening and closing read as one
 *  continuous glide instead of a jump. */
export const CHAT_PANEL_TRANSITION =
  "transition-[translate,box-shadow] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
