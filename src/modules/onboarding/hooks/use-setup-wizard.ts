"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceSetupForm } from "../schemas/workspace-setup";
import { SETUP_STEPS } from "../schemas/workspace-setup";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { useStoreConnectionStore } from "@/modules/store/store";
import type { Workspace } from "@/modules/workspaces/types";

const INITIAL_FORM: WorkspaceSetupForm = {
  name: "",
  mode: null,
};

export function useSetupWizard() {
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<WorkspaceSetupForm>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const { addWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const connection = useStoreConnectionStore((s) => s.connection);
  const router = useRouter();

  const totalSteps = SETUP_STEPS.length;
  const isFirst = step === 0;
  const isLast  = step === totalSteps - 1;

  function updateForm(patch: Partial<WorkspaceSetupForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function next() { if (step < totalSteps - 1) setStep((s) => s + 1); }
  function back() { if (step > 0) setStep((s) => s - 1); }

  function canProceed(): boolean {
    switch (step) {
      case 0: return form.name.trim().length >= 2;
      case 1: return form.mode !== null;
      default: return true;
    }
  }

  async function finish() {
    if (isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          mode: form.mode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create project");
        setIsSubmitting(false);
        return;
      }

      const workspace: Workspace = data.workspace;

      addWorkspace(workspace);
      setActiveWorkspace(workspace.id);

      router.push(
        workspace.mode === "wearable"
          ? `/workspaces/${workspace.id}/try-on`
          : `/workspaces/${workspace.id}/assistant`
      );
    } catch {
      setSubmitError("Network error — please try again");
      setIsSubmitting(false);
    }
  }

  return {
    step,
    form,
    updateForm,
    next,
    back,
    finish,
    canProceed,
    isFirst,
    isLast,
    isSubmitting,
    submitError,
    steps: SETUP_STEPS,
    connection,
  };
}
