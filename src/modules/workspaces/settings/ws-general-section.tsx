"use client";

import * as React from "react";
import { Settings, Check } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type { Workspace } from "@/modules/workspaces/types";
import { WORKSPACE_MODE_LABELS } from "@/modules/workspaces/constants";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props {
  workspace: Workspace;
}

export function WsGeneralSection({ workspace }: Props) {
  const { updateWorkspace } = useWorkspaceStore();
  const [name, setName] = React.useState(workspace.name);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    updateWorkspace(workspace.id, { name });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleStatus() {
    updateWorkspace(workspace.id, {
      status: workspace.status === "active" ? "paused" : "active",
    });
  }

  return (
    <SettingsSection
      title="General"
      description="Workspace name, mode, and operational status"
      icon={<Settings className="h-4 w-4" />}
      accent="brand"
    >
      <div className="space-y-4">
        <Input
          label="Workspace Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="Used in the dashboard and sidebar"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">Agent Mode</label>
          <div className="flex items-center gap-2 h-9 px-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] text-sm text-[var(--color-text-muted)]">
            {WORKSPACE_MODE_LABELS[workspace.mode]}
            <span className="text-[10px] ml-1">(cannot be changed after creation)</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Workspace Status</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Pausing stops the embed widget from serving shoppers</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={workspace.status} />
            <Button size="sm" variant="secondary" onClick={toggleStatus}>
              {workspace.status === "active" ? "Pause" : "Activate"}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button size="sm" loading={saving} onClick={handleSave} disabled={name === workspace.name}>
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save Changes"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
