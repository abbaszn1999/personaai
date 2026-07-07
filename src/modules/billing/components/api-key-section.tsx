"use client";

import * as React from "react";
import { KeySquare, Eye, EyeOff, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { useBilling } from "../hooks/use-billing";

export function ApiKeySection() {
  const { openaiApiKey, setOpenaiApiKey } = useBilling();
  const [draft, setDraft] = React.useState(openaiApiKey);
  const [revealed, setRevealed] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  function handleSave() {
    setOpenaiApiKey(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
              placeholder="sk-..."
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
          <Button size="md" onClick={handleSave} disabled={draft.trim() === openaiApiKey}>
            {saved ? <Check className="h-4 w-4" /> : "Save"}
          </Button>
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          {openaiApiKey
            ? "A key is currently saved for this account."
            : "No API key saved yet — the chat agent won't be able to respond until one is added."}
        </p>
      </div>
    </SettingsSection>
  );
}
