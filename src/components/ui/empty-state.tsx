import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl panel-glass text-[var(--color-text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)] max-w-xs">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          <Button onClick={action.onClick} size="md">
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
