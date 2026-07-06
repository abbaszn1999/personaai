import * as React from "react";

export interface DashboardPageHeaderProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Renders the page header. Place at the top of each page's JSX.
 * Uses sticky positioning so it stays visible while the content scrolls.
 * No context or hooks — works in both Server and Client components.
 */
export function DashboardPageHeader({ title, description, actions }: DashboardPageHeaderProps) {
  if (!title && !actions) return null;
  return (
    <header className="panel-header flex items-center justify-between px-6 py-4 shrink-0 sticky top-0 z-10 rounded-t-[var(--radius-2xl)]">
      <div>
        {title && (
          <h1 className="text-xl font-display font-extrabold text-[var(--color-text-primary)] tracking-tight">
            {title}
          </h1>
        )}
        {description && (
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
