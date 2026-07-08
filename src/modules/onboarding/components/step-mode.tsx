"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { WorkspaceMode } from "@/modules/workspaces/types";
import { WORKSPACE_MODE_LABELS, WORKSPACE_MODE_DESCRIPTIONS } from "@/modules/workspaces/constants";
import { AgentOrb } from "@/components/ui/agent-orb";
import type { WorkspaceSetupForm } from "../schemas/workspace-setup";
import { cn } from "@/lib/utils/cn";

const MODES: WorkspaceMode[] = ["wearable", "unwearable"];

const MODE_FEATURES: Record<WorkspaceMode, string[]> = {
  wearable: [
    "Virtual try-on with AI image generation",
    "Size & fit recommendations",
    "Body profile matching",
    "Clothing, shoes & accessories",
  ],
  unwearable: [
    "Conversational shopping assistant",
    "Product search & filtering",
    "AI recommendation engine",
    "Electronics, home & appliances",
  ],
};

interface StepModeProps {
  form: WorkspaceSetupForm;
  onChange: (patch: Partial<WorkspaceSetupForm>) => void;
}

export function StepMode({ form, onChange }: StepModeProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Choose product mode</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          This determines what kind of AI agent your customers will use.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODES.map((mode) => {
          const selected = form.mode === mode;
          return (
            <button
              key={mode}
              onClick={() => onChange({ mode })}
              className={cn(
                "relative flex flex-col gap-4 rounded-[var(--radius-xl)] border p-5 text-left transition-all duration-150",
                selected
                  ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-card)] hover:border-[var(--color-border-strong)]",
                selected && mode === "wearable" && "bg-[var(--color-accent-light)]",
                selected && mode === "unwearable" && "bg-[var(--color-brand-light)]"
              )}
            >
              {selected && (
                <span className="absolute top-4 right-4 h-5 w-5 rounded-full gradient-brand flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </span>
              )}
              <AgentOrb mode={mode} size="lg" animated={selected} />
              <div>
                <div className="text-base font-semibold text-[var(--color-text-primary)]">
                  {WORKSPACE_MODE_LABELS[mode]}
                </div>
                <div className="text-sm text-[var(--color-text-muted)] mt-0.5">
                  {WORKSPACE_MODE_DESCRIPTIONS[mode]}
                </div>
              </div>
              <ul className="space-y-1.5">
                {MODE_FEATURES[mode].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}
