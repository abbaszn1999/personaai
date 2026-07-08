"use client";

import * as React from "react";
import {
  Settings,
  AlertTriangle,
} from "lucide-react";
import { PanelNav, type PanelNavItem } from "@/components/layout/panel-nav";
import { WsGeneralSection } from "./ws-general-section";
import { WsDangerSection } from "./ws-danger-section";
import type { Workspace } from "@/modules/workspaces/types";

type SectionId = "general" | "danger";

const NAV_ITEMS: PanelNavItem[] = [
  { id: "general",    label: "General",    description: "Name, mode & status",       icon: <Settings className="h-4 w-4" /> },
  { id: "danger",     label: "Danger Zone", description: "Pause or delete project", icon: <AlertTriangle className="h-4 w-4" />, danger: true },
];

interface Props { workspace: Workspace }

export function WorkspaceSettingsDashboard({ workspace }: Props) {
  const [activeSection, setActiveSection] = React.useState<SectionId>("general");

  return (
    <div className="flex gap-6 min-h-[calc(100vh-140px)]">
      {/* Left nav */}
      <aside className="w-56 shrink-0">
        <PanelNav
          title="Project Settings"
          items={NAV_ITEMS}
          activeId={activeSection}
          onSelect={(id) => setActiveSection(id as SectionId)}
        />
      </aside>

      {/* Right content */}
      <div className="flex-1 min-w-0 animate-fade-in">
        {activeSection === "general" && <WsGeneralSection workspace={workspace} />}
        {activeSection === "danger"  && <WsDangerSection workspace={workspace} />}
      </div>
    </div>
  );
}
