"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreConnectionStore } from "@/modules/store/store";
import { STYLE_GUIDE_MAX_LENGTH } from "@/modules/store/types";
import { cn } from "@/lib/utils/cn";

/**
 * Soft styling guidance for outfit building, read by the budget allocator and the stylist's
 * vision prompt (see `src/lib/agents/wearable/stylist/select-bundles.ts`) — never enforced, only
 * used to lean the agent's choices. Absolute rules ("never show X", "always require Y") belong
 * wherever hard rules eventually live, not here.
 *
 * Renders only while a store connection exists (parent gates on `connection`), so it naturally
 * mounts fresh whenever the connection is (re)created — mirrors `CategorySelector`'s comment
 * in catalog-sync-panel.tsx for the same reason.
 */
export function StyleGuideEditor() {
  const styleGuide = useStoreConnectionStore((s) => s.styleGuide);
  const updateStyleGuide = useStoreConnectionStore((s) => s.updateStyleGuide);

  const [draft, setDraft] = React.useState(styleGuide ?? "");
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = draft !== (styleGuide ?? "");
  const overLimit = draft.length > STYLE_GUIDE_MAX_LENGTH;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const trimmed = draft.trim();
    const ok = await updateStyleGuide(trimmed.length > 0 ? trimmed : null);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError("Failed to update style guide");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Styling Guidance
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Soft styling guidance for outfit building — e.g. &ldquo;lean minimalist, avoid loud
          patterns.&rdquo; This leans the agent&apos;s choices; it never excludes anything.
          Absolute rules belong elsewhere, not here.
        </p>
      </div>

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Lean minimalist and neutral tones. Favor tailored, clean silhouettes over streetwear. Avoid loud patterns and logos."
        rows={6}
        className={cn(
          "w-full resize-none rounded-[var(--radius-lg)] border bg-[var(--color-surface-base)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors",
          overLimit
            ? "border-[var(--color-error)]"
            : "border-[var(--color-border)] focus:border-[var(--color-brand)]"
        )}
      />

      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs",
            overLimit ? "text-[var(--color-error)]" : "text-[var(--color-text-muted)]"
          )}
        >
          {draft.length.toLocaleString()} / {STYLE_GUIDE_MAX_LENGTH.toLocaleString()}
        </p>
        <Button size="sm" loading={saving} onClick={handleSave} disabled={!isDirty || overLimit}>
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5" /> Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
