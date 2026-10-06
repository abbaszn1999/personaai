"use client";

import { SyncView } from "./components/sync-view";

/**
 * The Sync tab: an interface-only copy of the demo's Sync view, running entirely on its own mock
 * data (`./data`). It is deliberately not wired to the sizing store or any API.
 *
 * The demo styles itself with hard-coded light `slate` utilities and expects a light page behind
 * it, while the Store pages sit on the dark `store-theme` surface. This wrapper restores the
 * demo's root surface (`bg-slate-50 text-slate-900`) so the layout renders as designed, and
 * `sync-brand` (globals.css) swaps its purple/pink accents for Persona's orange→red.
 */
export function SyncTab({ onGoToSetup }: { onGoToSetup: () => void }) {
  return (
    <div className="sync-brand flex min-h-[calc(100vh-200px)] w-full flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-slate-50 font-sans text-slate-900 selection:bg-purple-200 selection:text-purple-900">
      <SyncView onGoToSetup={onGoToSetup} />
    </div>
  );
}
