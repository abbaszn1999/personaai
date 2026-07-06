"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import type { WorkspaceSetupForm } from "../schemas/workspace-setup";
import { WORKSPACE_MODE_LABELS } from "@/modules/workspaces/constants";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import { AgentOrb } from "@/components/ui/agent-orb";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface StepReviewProps {
  form: WorkspaceSetupForm;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (...args: any[]) => void;
}

export function StepReview({ form }: StepReviewProps) {
  const { globalConnection } = useWorkspaceStore();
  const allCategories = [...MOCK_WEARABLE_CATEGORIES, ...MOCK_UNWEARABLE_CATEGORIES];
  const selectedCats = allCategories.filter((c) => form.selectedCategoryIds.includes(c.id));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Review & create</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Confirm your workspace settings before creating.
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] overflow-hidden">
        {/* Mode Header */}
        <div className="flex items-center gap-3 p-4 bg-[var(--color-surface-base)]">
          <AgentOrb mode={form.mode!} size="lg" animated />
          <div>
            <div className="text-base font-semibold text-[var(--color-text-primary)]">{form.name}</div>
            <div className="text-sm text-[var(--color-text-muted)]">
              {form.mode ? WORKSPACE_MODE_LABELS[form.mode] : "—"}
            </div>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {/* Store connection is inherited, shown read-only */}
          {globalConnection && (
            <>
              <ReviewRow
                label="Store"
                value={`${PLATFORM_LABELS[globalConnection.platform]} — ${globalConnection.storeName}`}
              />
            </>
          )}
          <ReviewRow
            label="Agent Mode"
            value={form.mode ? WORKSPACE_MODE_LABELS[form.mode] : "—"}
          />
          <ReviewRow
            label="Categories"
            value={selectedCats.length > 0 ? selectedCats.map((c) => c.name).join(", ") : "—"}
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-success-light)] px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-[var(--color-success)] shrink-0" />
        <p className="text-sm text-[var(--color-success)]">
          Everything looks good! Click <strong>Create Workspace</strong> to continue.
        </p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="text-sm font-medium text-[var(--color-text-primary)] text-right">{value}</span>
    </div>
  );
}
