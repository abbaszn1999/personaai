import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  accent?: "brand" | "wearable" | "unwearable" | "danger";
  children: React.ReactNode;
  className?: string;
}

const ACCENT_CLASSES: Record<string, string> = {
  brand:      "gradient-brand",
  wearable:   "gradient-wearable",
  unwearable: "gradient-unwearable",
  danger:     "bg-[var(--color-error)]",
};

export function SettingsSection({
  title,
  description,
  icon,
  accent = "brand",
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section className={cn("card-base overflow-hidden", className)}>
      <div className="panel-header flex items-start gap-3 px-5 py-4">
        {icon && (
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm",
              ACCENT_CLASSES[accent]
            )}
          >
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {description && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
