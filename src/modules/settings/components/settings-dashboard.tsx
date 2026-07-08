"use client";

import * as React from "react";
import { Suspense } from "react";
import { User, CreditCard, Bell, AlertTriangle, KeySquare } from "lucide-react";
import { useSearchParams, usePathname } from "next/navigation";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { PanelNav, type PanelNavItem } from "@/components/layout/panel-nav";
import { SettingsProfileProvider } from "../context/settings-profile-context";
import { GeneralSettings } from "./general-settings";
import { BillingSettings } from "./billing-settings";
import { ApiKeySection } from "@/modules/billing/components/api-key-section";
import { NotificationsSettings } from "./notifications-settings";
import { DangerZone } from "./danger-zone";
import { cn } from "@/lib/utils/cn";

type SectionId = "profile" | "api-keys" | "billing" | "notifications" | "danger";

const NAV_ITEMS: PanelNavItem[] = [
  { id: "profile",       label: "Profile",             description: "Name, avatar & connected accounts", icon: <User className="h-4 w-4" /> },
  { id: "api-keys",      label: "API Keys",             description: "OpenAI key for chat agent",  icon: <KeySquare className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications",        description: "Email alert preferences",    icon: <Bell className="h-4 w-4" /> },
  { id: "billing",       label: "Billing",              description: "Plans & credits",            icon: <CreditCard className="h-4 w-4" /> },
  { id: "danger",        label: "Danger Zone",          description: "Irreversible actions",       icon: <AlertTriangle className="h-4 w-4" />, danger: true },
];

const VALID_SECTIONS = new Set(NAV_ITEMS.map((i) => i.id));

function parseSection(param: string | null): SectionId {
  return param && VALID_SECTIONS.has(param) ? (param as SectionId) : "profile";
}

const SECTION_COMPONENTS: Record<SectionId, React.ComponentType> = {
  profile: GeneralSettings,
  "api-keys": ApiKeySection,
  notifications: NotificationsSettings,
  billing: BillingSettings,
  danger: DangerZone,
};

function SettingsDashboardInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const sectionFromUrl = parseSection(searchParams.get("section"));
  const [activeSection, setActiveSection] = React.useState<SectionId>(sectionFromUrl);
  const [prevUrlSection, setPrevUrlSection] = React.useState(sectionFromUrl);

  // Track which sections have been opened. Only these get mounted, so a tab's
  // data fetch fires the first time you open it — not all at once on page load.
  // Once mounted, a section stays mounted so re-visiting it is instant (no refetch).
  const [mounted, setMounted] = React.useState<Set<SectionId>>(() => new Set([sectionFromUrl]));

  function activate(section: SectionId) {
    setActiveSection(section);
    setMounted((prev) => {
      if (prev.has(section)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(section);
      return nextSet;
    });
  }

  if (sectionFromUrl !== prevUrlSection) {
    setPrevUrlSection(sectionFromUrl);
    activate(sectionFromUrl);
  }

  function handleSelect(id: string) {
    const section = id as SectionId;
    activate(section);
    window.history.replaceState(null, "", `${pathname}?section=${section}`);
  }

  return (
    <>
      <DashboardPageHeader
        title="Account Settings"
        description="Manage your profile, security, billing, and more"
      />
      <div className="flex gap-6 min-h-[calc(100vh-140px)] p-6 pt-4">
        <aside className="w-56 shrink-0">
          <PanelNav
            title="Account Settings"
            items={NAV_ITEMS}
            activeId={activeSection}
            onSelect={handleSelect}
          />
        </aside>

        {/* Lazy-mount visited sections, then keep them alive for instant re-switching */}
        <div className="flex-1 min-w-0">
          {NAV_ITEMS.map((item) => {
            const id = item.id as SectionId;
            if (!mounted.has(id)) return null;
            const SectionComponent = SECTION_COMPONENTS[id];
            return (
              <div key={id} className={cn(activeSection !== id && "hidden")}>
                <SectionComponent />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function SettingsDashboard() {
  return (
    <Suspense>
      <SettingsProfileProvider>
        <SettingsDashboardInner />
      </SettingsProfileProvider>
    </Suspense>
  );
}
