"use client";

import * as React from "react";
import { History, Clock, Zap, PencilLine, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SYNC_HISTORY } from "../mocks/sync";
import type { SyncHistoryEntry } from "../types";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/**
 * Past syncs, and what each one cost.
 *
 * `newBrandsResearched` against `cachedBrandsCount` is the number worth watching: a healthy store
 * trends towards all-cached over time, because the registry keeps paying off. A run that keeps
 * researching means brand extraction is not settling on stable names.
 */
export function SyncHistoryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon={<History className="h-4 w-4" />}
      title="Sync history"
      description="Every catalog delta Persona has processed, and how much of it came free from the registry."
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-2">
        {SYNC_HISTORY.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </Modal>
  );
}

function HistoryRow({ entry }: { entry: SyncHistoryEntry }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {entry.itemsCount.toLocaleString()} item{entry.itemsCount === 1 ? "" : "s"}
            </p>
            <Badge variant="neutral" className="text-[9px]">
              {entry.triggerType}
            </Badge>
            <Badge variant="success" className="text-[9px]">
              {entry.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{entry.notes}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-[var(--color-text-secondary)]">{entry.relativeTime}</p>
          <p className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <Clock className="h-2.5 w-2.5" /> {formatDuration(entry.durationSec)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
          <Zap className="h-3 w-3" /> {entry.cachedBrandsCount} reused
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-info)]">
          <Search className="h-3 w-3" /> {entry.newBrandsResearched} researched
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-warning)]">
          <PencilLine className="h-3 w-3" /> {entry.gapsFilled} filled by you
        </span>
      </div>

      {entry.sampleItems.length > 0 && (
        <p className="mt-2 truncate text-[10px] text-[var(--color-text-muted)]">
          {entry.sampleItems.join(" · ")}
        </p>
      )}
    </div>
  );
}
