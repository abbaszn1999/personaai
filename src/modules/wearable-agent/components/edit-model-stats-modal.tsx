"use client";

import * as React from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type { TryOnProfile } from "../types";
import { cn } from "@/lib/utils/cn";
import { useWearableTheme } from "../theme-context";

interface EditModelStatsModalProps {
  profile: TryOnProfile;
  isRegenerating: boolean;
  onClose: () => void;
  onRegenerate: (patch: Partial<TryOnProfile>) => void;
}

const THEME_STYLES = {
  dark: {
    overlay: "bg-black/70",
    modal: "border-white/10 bg-[#151019] shadow-[0_24px_64px_rgba(0,0,0,0.6)]",
    header: "border-white/[0.08]",
    title: "text-white",
    subtitle: "text-white/40",
    closeButton: "text-white/40 hover:text-white hover:bg-white/[0.08]",
    fieldLabel: "text-white/50",
    input: "bg-white/[0.06] border-white/10 text-white placeholder:text-white/30",
    inputUnit: "text-white/35",
    footer: "border-white/[0.08]",
    cancelButton: "border-white/10 text-white/70 hover:bg-white/[0.06]",
  },
  light: {
    overlay: "bg-black/40",
    modal: "border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]",
    header: "border-black/[0.08]",
    title: "text-[var(--color-text-primary)]",
    subtitle: "text-[var(--color-text-muted)]",
    closeButton: "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-black/[0.06]",
    fieldLabel: "text-[var(--color-text-secondary)]",
    input: "bg-black/[0.04] border-black/10 text-[var(--color-text-primary)] placeholder:text-black/30",
    inputUnit: "text-[var(--color-text-muted)]",
    footer: "border-black/[0.08]",
    cancelButton: "border-black/10 text-[var(--color-text-secondary)] hover:bg-black/[0.04]",
  },
} as const;

type ModalStyles = (typeof THEME_STYLES)[keyof typeof THEME_STYLES];

function FieldInput({
  label,
  unit,
  value,
  onChange,
  styles,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
  styles: ModalStyles;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={cn("text-[11px] font-medium", styles.fieldLabel)}>{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className={cn(
            "w-full h-10 pl-3 pr-10 rounded-lg border text-[16px] sm:text-sm focus:outline-none focus:border-[var(--color-brand)] transition-colors",
            styles.input
          )}
        />
        <span className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-[11px]", styles.inputUnit)}>{unit}</span>
      </div>
    </label>
  );
}

export function EditModelStatsModal({
  profile,
  isRegenerating,
  onClose,
  onRegenerate,
}: EditModelStatsModalProps) {
  const [draft, setDraft] = React.useState<TryOnProfile>(profile);
  const styles = THEME_STYLES[useWearableTheme()];
  // The original selfie is deliberately never persisted (see sanitizeProfileForStorage) — once
  // a shopper reloads or switches profiles and comes back, there's nothing left to re-render
  // the avatar from, so this edit only ever updates measurements/size recs in that case.
  const canRegenerateAvatar = Boolean(profile.photoBase64);

  function patch(p: Partial<TryOnProfile>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function handleSubmit() {
    const {
      photoUrl: _photoUrl,
      photoBase64: _photoBase64,
      photoMimeType: _photoMimeType,
      avatarUrl: _avatarUrl,
      backdropUrl: _backdropUrl,
      ...measurements
    } = draft;
    onRegenerate(measurements);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={cn("absolute inset-0 backdrop-blur-sm animate-fade-in", styles.overlay)}
        onClick={() => !isRegenerating && onClose()}
      />

      {/* Modal */}
      <div className={cn("relative w-full max-w-md rounded-2xl border animate-fade-in overflow-hidden", styles.modal)}>
        {/* Header */}
        <div className={cn("flex items-center justify-between px-5 py-4 border-b", styles.header)}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-wearable flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className={cn("text-sm font-bold", styles.title)}>Edit Model Stats</h3>
              <p className={cn("text-[11px]", styles.subtitle)}>
                {canRegenerateAvatar
                  ? "Update measurements to regenerate your avatar"
                  : "Update measurements to refresh your fit & size recommendations"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRegenerating}
            aria-label="Close"
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-30",
              styles.closeButton
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {!canRegenerateAvatar && (
            <p className={cn("text-[11px] leading-relaxed rounded-lg px-3 py-2", styles.subtitle, styles.input)}>
              Your original photo isn&apos;t stored, so we can&apos;t redraw the avatar itself — but your
              measurements below still drive fit analysis and size recommendations.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FieldInput styles={styles} label="Height" unit="cm" value={draft.heightCm} onChange={(v) => patch({ heightCm: v })} />
            <FieldInput styles={styles} label="Weight" unit="kg" value={draft.weightKg} onChange={(v) => patch({ weightKg: v })} />
            <FieldInput styles={styles} label="Chest" unit="cm" value={draft.chestCm} onChange={(v) => patch({ chestCm: v })} />
            <FieldInput styles={styles} label="Waist" unit="cm" value={draft.waistCm} onChange={(v) => patch({ waistCm: v })} />
            <FieldInput styles={styles} label="Shoe Size" unit="EU" value={draft.shoeSizeEu} onChange={(v) => patch({ shoeSizeEu: v })} />
          </div>
        </div>

        {/* Footer */}
        <div className={cn("flex items-center gap-2.5 px-5 py-4 border-t", styles.footer)}>
          <button
            type="button"
            onClick={onClose}
            disabled={isRegenerating}
            className={cn(
              "flex-1 h-11 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40",
              styles.cancelButton
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isRegenerating}
            className={cn(
              "flex-1 h-11 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all",
              "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] shadow-[var(--shadow-glow)]",
              "hover:brightness-105 disabled:opacity-60"
            )}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {canRegenerateAvatar ? "Regenerating…" : "Saving…"}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {canRegenerateAvatar ? "Regenerate Avatar" : "Save Measurements"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
