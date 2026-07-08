"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, Pause } from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/modules/workspaces/types";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { workspace: Workspace }

export function WsDangerSection({ workspace }: Props) {
  const { removeWorkspace, updateWorkspace } = useWorkspaceStore();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isPausing, setIsPausing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete project");
      }
      removeWorkspace(workspace.id);
      router.push("/workspaces");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
      setIsDeleting(false);
    }
  }

  async function handlePause() {
    const nextStatus = workspace.status === "active" ? "paused" : "active";
    setIsPausing(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update project");
      }
      updateWorkspace(workspace.id, { status: nextStatus });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setIsPausing(false);
    }
  }

  return (
    <SettingsSection
      title="Danger Zone"
      description="Irreversible actions — proceed with caution"
      icon={<AlertTriangle className="h-4 w-4" />}
      accent="danger"
    >
      <div className="space-y-3">
        {error && (
          <p className="text-xs text-[var(--color-error)] px-1">{error}</p>
        )}

        {/* Pause project */}
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {workspace.status === "active" ? "Pause Project" : "Resume Project"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {workspace.status === "active"
                ? "Pausing stops the embed widget from serving shoppers without deleting any data."
                : "Resume this project to make it live again."}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0" loading={isPausing} onClick={handlePause}>
            <Pause className="h-3.5 w-3.5" />
            {workspace.status === "active" ? "Pause" : "Resume"}
          </Button>
        </div>

        {/* Delete project */}
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-error-light)] bg-[var(--color-error-light)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-error)]">Delete Project</p>
            <p className="text-xs text-[var(--color-error)] opacity-80 mt-0.5">
              Permanently deletes &ldquo;{workspace.name}&rdquo; and all its configuration. Cannot be undone.
            </p>
          </div>
          {!confirmDelete ? (
            <Button variant="danger" size="sm" className="shrink-0" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" loading={isDeleting} onClick={handleDelete}>
                Confirm Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
