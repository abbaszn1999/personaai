"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { ThemeToggle } from "@/modules/theme/theme-toggle";

interface DashboardShellProps {
  children: React.ReactNode;
  impersonation?: { adminEmail: string; merchantEmail: string } | null;
}

function ImpersonationBanner({ merchantEmail }: { merchantEmail: string }) {
  const [leaving, setLeaving] = React.useState(false);

  async function exit() {
    setLeaving(true);
    const res = await fetch("/api/admin/impersonate/exit", { method: "POST" });
    const body = (await res.json()) as { redirect?: string };
    window.location.href = body.redirect ?? "/admin";
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white">
      <span>You are signed in as {merchantEmail}</span>
      <button type="button" onClick={exit} disabled={leaving} className="rounded-[var(--radius-md)] bg-white/15 px-3 py-1 hover:bg-white/25">
        {leaving ? "Leaving…" : "Back to admin"}
      </button>
    </div>
  );
}

function isFullscreenRoute(pathname: string) {
  return pathname.endsWith("/embed");
}

/**
 * Persistent dashboard chrome — sidebar + scrollable content frame.
 * Lives in (dashboard)/layout.tsx so the sidebar never remounts on navigation.
 * Each page places a <DashboardPageHeader> at the top of its content.
 */
export function DashboardShell({ children, impersonation }: DashboardShellProps) {
  const pathname = usePathname();

  if (isFullscreenRoute(pathname)) {
    return (
      <>
        <div className="fixed right-4 top-4 z-[80]">
          <ThemeToggle />
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-app-frame)] p-2 gap-2">
      <React.Suspense
        fallback={<aside className="h-full w-[272px] shrink-0 rounded-[var(--radius-2xl)] sidebar-panel" />}
      >
        <AppSidebar />
      </React.Suspense>
      <div className="dashboard-theme flex flex-1 flex-col overflow-hidden rounded-[var(--radius-2xl)] content-panel min-w-0">
        {/* `id` gives dialogs (see `Modal`) something stable to grab to lock scrolling — the actual
         *  scroll container on every dashboard page is this `<main>`, not `<body>`. */}
        {impersonation && <ImpersonationBanner merchantEmail={impersonation.merchantEmail} />}
        <main id="dashboard-scroll-area" className="flex min-h-0 flex-1 flex-col overflow-y-auto sidebar-scroll">
          {children}
        </main>
      </div>
    </div>
  );
}
