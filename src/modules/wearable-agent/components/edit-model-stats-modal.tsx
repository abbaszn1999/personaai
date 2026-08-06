"use client";

import * as React from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type { TryOnProfile } from "../types";
import { cn } from "@/lib/utils/cn";

interface EditModelStatsModalProps {
  profile: TryOnProfile;
  isRegenerating: boolean;
  onClose: () => void;
  onRegenerate: (patch: Partial<TryOnProfile>) => void;
}

function FieldInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-white/50">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full h-10 pl-3 pr-10 rounded-lg bg-white/[0.06] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--color-brand)] transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/35">{unit}</span>
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={() => !isRegenerating && onClose()}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#151019] shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-wearable flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Edit Model Stats</h3>
              <p className="text-[11px] text-white/40">Update measurements to regenerate your avatar</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRegenerating}
            className="h-8 w-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Height" unit="cm" value={draft.heightCm} onChange={(v) => patch({ heightCm: v })} />
            <FieldInput label="Weight" unit="kg" value={draft.weightKg} onChange={(v) => patch({ weightKg: v })} />
            <FieldInput label="Chest" unit="cm" value={draft.chestCm} onChange={(v) => patch({ chestCm: v })} />
            <FieldInput label="Waist" unit="cm" value={draft.waistCm} onChange={(v) => patch({ waistCm: v })} />
            <FieldInput label="Shoe Size" unit="EU" value={draft.shoeSizeEu} onChange={(v) => patch({ shoeSizeEu: v })} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            disabled={isRegenerating}
            className="flex-1 h-10 rounded-lg border border-white/10 text-sm font-medium text-white/70 hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isRegenerating}
            className={cn(
              "flex-1 h-10 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all",
              "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] shadow-[var(--shadow-glow)]",
              "hover:brightness-105 disabled:opacity-60"
            )}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Regenerate Avatar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
