"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles, Plug, AlertTriangle } from "lucide-react";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useSetupWizard } from "../hooks/use-setup-wizard";
import { StepName } from "./step-name";
import { StepMode } from "./step-mode";
import { StepReview } from "./step-review";
import { PLATFORM_LABELS } from "@/modules/store/constants";

const STEP_COMPONENTS = [StepName, StepMode, StepReview];

export function SetupWizard() {
  const wizard = useSetupWizard();
  const StepComponent = STEP_COMPONENTS[wizard.step];
  const hasStore = wizard.connection !== null;

  // Gate: no store connected → block the wizard
  if (!hasStore) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card-elevated p-8 flex flex-col items-center gap-5 text-center">
          <div className="h-14 w-14 rounded-2xl bg-[var(--color-warning-light)] flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-[var(--color-warning)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              Connect your store first
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-xs">
              Before creating a project, you need to connect your e-commerce store so the AI agent can access your products and categories.
            </p>
          </div>
          <Link href="/store">
            <Button size="lg">
              <Plug className="h-4 w-4" />
              Go to Store Connection
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Connected store banner */}
      <div className="max-w-2xl mx-auto w-full flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-success-light)] bg-[var(--color-success-light)] px-4 py-3">
        <Plug className="h-4 w-4 text-[var(--color-success)] shrink-0" />
        <p className="text-sm text-[var(--color-success)] flex-1">
          <span className="font-semibold">
            {PLATFORM_LABELS[wizard.connection!.platform]}
          </span>
          {" — "}
          {wizard.connection!.storeName}
        </p>
        <StatusPill status="connected" />
      </div>

      {/* Progress */}
      <Stepper steps={[...wizard.steps]} currentStep={wizard.step} className="max-w-2xl mx-auto w-full" />

      {/* Step Card */}
      <Card elevated className="max-w-2xl mx-auto w-full">
        <CardContent className="py-6">
          <StepComponent form={wizard.form} onChange={wizard.updateForm} />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex flex-col items-center gap-3 max-w-2xl mx-auto w-full">
        {wizard.submitError && (
          <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] rounded-[var(--radius-md)] px-3 py-2 w-full text-center">
            {wizard.submitError}
          </p>
        )}
        <div className="flex items-center justify-between w-full">
          <Button
            variant="secondary"
            onClick={wizard.back}
            disabled={wizard.isFirst || wizard.isSubmitting}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {wizard.isLast ? (
            <Button onClick={wizard.finish} size="lg" loading={wizard.isSubmitting}>
              <Sparkles className="h-4 w-4" />
              Create Project
            </Button>
          ) : (
            <Button onClick={wizard.next} disabled={!wizard.canProceed()}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
