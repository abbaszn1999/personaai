"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./app-sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

function isFullscreenRoute(pathname: string) {
  return pathname.endsWith("/embed");
}

/**
 * Persistent dashboard chrome — sidebar + scrollable content frame.
 * Lives in (dashboard)/layout.tsx so the sidebar never remounts on navigation.
 * Each page places a <DashboardPageHeader> at the top of its content.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();

  if (isFullscreenRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0810] p-2 gap-2">
      <React.Suspense
        fallback={<aside className="h-full w-[272px] shrink-0 rounded-[var(--radius-2xl)] sidebar-panel" />}
      >
        <AppSidebar />
      </React.Suspense>
      <div className="dashboard-theme flex flex-1 flex-col overflow-hidden rounded-[var(--radius-2xl)] content-panel min-w-0">
        {/* `id` gives dialogs (see `Modal`) something stable to grab to lock scrolling — the actual
         *  scroll container on every dashboard page is this `<main>`, not `<body>`. */}
        <main id="dashboard-scroll-area" className="flex-1 overflow-y-auto sidebar-scroll">
          {children}
        </main>
      </div>
    </div>
  );
}
