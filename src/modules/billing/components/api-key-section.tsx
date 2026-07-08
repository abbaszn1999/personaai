"use client";

import * as React from "react";
import { KeySquare, Eye, EyeOff, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { useOpenaiApiKey } from "../hooks/use-openai-api-key";

export function ApiKeySection() {
  const { hasKey, maskedKey, loading, saving, error, save } = useOpenaiApiKey();
  const [draft, setDraft] = React.useState("");
  const [revealed, setRevealed] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function handleSave() {
    const ok = await save(draft.trim());
    if (ok) {
      setDraft("");
      setRevealed(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <SettingsSection
      title="OpenAI API Key"
      description="Your conversational shopping assistant runs on your own OpenAI account"
      icon={<KeySquare className="h-4 w-4" />}
      accent="brand"
    >
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-text-muted)] max-w-xl">
          The chat agent uses <span className="font-medium text-[var(--color-text-secondary)]">your own OpenAI API key</span>,
          so you control text chat volume and cost directly with OpenAI. This is separate from your
          image generation credits, which are managed natively by Autommerce under your plan.
        </p>

        <div className="flex items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <input
              type={revealed ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={hasKey ? "Enter a new key to replace the saved one" : "sk-..."}
              className="w-full h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 pr-10 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              aria-label={revealed ? "Hide key" : "Show key"}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button size="md" onClick={handleSave} loading={saving} disabled={!draft.trim()}>
            {saved && !saving ? <Check className="h-4 w-4" /> : "Save"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2">{error}</p>
        )}

        <p className="text-xs text-[var(--color-text-muted)]">
          {loading
            ? "Checking saved key…"
            : hasKey
              ? `A key${maskedKey ? ` (${maskedKey})` : ""} is currently saved for this account.`
              : "No API key saved yet — the chat agent won't be able to respond until one is added."}
        </p>
      </div>
    </SettingsSection>
  );
}
