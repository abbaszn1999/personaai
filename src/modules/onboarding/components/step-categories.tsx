"use client";

import * as React from "react";
import { FolderOpen, Check } from "lucide-react";
import type { WorkspaceSetupForm } from "../schemas/workspace-setup";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import { cn } from "@/lib/utils/cn";

interface StepCategoriesProps {
  form: WorkspaceSetupForm;
  onChange: (patch: Partial<WorkspaceSetupForm>) => void;
}

export function StepCategories({ form, onChange }: StepCategoriesProps) {
  const categories = form.mode === "wearable" ? MOCK_WEARABLE_CATEGORIES : MOCK_UNWEARABLE_CATEGORIES;

  function toggle(id: string) {
    const current = form.selectedCategoryIds;
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    onChange({ selectedCategoryIds: next });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl gradient-brand flex items-center justify-center">
          <FolderOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
            Select categories
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose which categories the AI agent will operate on.{" "}
            <span className="text-[var(--color-brand)]">
              {form.selectedCategoryIds.length} selected
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {categories.map((cat) => {
          const selected = form.selectedCategoryIds.includes(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => toggle(cat.id)}
              className={cn(
                "flex items-center justify-between rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-all duration-150",
                selected
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-card)] hover:border-[var(--color-brand)]"
              )}
            >
              <div>
                <div className="text-sm font-medium text-[var(--color-text-primary)]">{cat.name}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {cat.productCount} products
                </div>
              </div>
              <div
                className={cn(
                  "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                  selected ? "gradient-brand border-transparent" : "border-[var(--color-border)]"
                )}
              >
                {selected && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
