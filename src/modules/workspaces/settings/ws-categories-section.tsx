"use client";

import * as React from "react";
import { FolderOpen, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import type { Workspace } from "@/modules/workspaces/types";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { cn } from "@/lib/utils/cn";

interface Props { workspace: Workspace }

export function WsCategoriesSection({ workspace }: Props) {
  const { updateWorkspace } = useWorkspaceStore();
  const [selected, setSelected] = React.useState<string[]>(workspace.selectedCategoryIds);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const categories = workspace.mode === "wearable" ? MOCK_WEARABLE_CATEGORIES : MOCK_UNWEARABLE_CATEGORIES;

  function toggle(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function handleSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    updateWorkspace(workspace.id, { selectedCategoryIds: selected });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <SettingsSection
      title="Categories"
      description="Choose which product categories the agent can access and recommend"
      icon={<FolderOpen className="h-4 w-4" />}
      accent="brand"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2">
          {categories.map((cat) => {
            const active = selected.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => toggle(cat.id)}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all",
                  active
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-surface-base)]"
                )}
              >
                <div className={cn(
                  "h-5 w-5 rounded flex items-center justify-center shrink-0 border transition-all",
                  active
                    ? "gradient-brand border-transparent"
                    : "border-[var(--color-border)] bg-[var(--color-surface-base)]"
                )}>
                  {active && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{cat.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{cat.productCount} products</p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {selected.length} of {categories.length} categories selected
        </p>
        <div className="flex justify-end pt-1">
          <Button size="sm" loading={saving} onClick={handleSave}>
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Changes"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
