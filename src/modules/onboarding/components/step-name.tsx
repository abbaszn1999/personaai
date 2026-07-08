"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { WorkspaceSetupForm } from "../schemas/workspace-setup";

interface StepNameProps {
  form: WorkspaceSetupForm;
  onChange: (patch: Partial<WorkspaceSetupForm>) => void;
}

export function StepName({ form, onChange }: StepNameProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl gradient-brand flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Name your project</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Give this AI assistant a meaningful name for your store.
          </p>
        </div>
      </div>
      <Input
        label="Project Name"
        placeholder="e.g. Fashion Store, Electronics Hub…"
        value={form.name}
        onChange={(e) => onChange({ name: e.target.value })}
        hint="Minimum 2 characters"
      />
    </div>
  );
}
