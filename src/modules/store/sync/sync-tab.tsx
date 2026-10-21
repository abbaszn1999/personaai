"use client";

import { SyncView } from "./components/sync-view";

/**
 * The Sync tab, running entirely on demo data. It is deliberately not wired to the live sizing
 * store or any API.
 *
 * The dashboard is an interface-only copy of the demo, which styles itself with hard-coded light
 * `slate` utilities, so `SyncView` restores the demo's light surface around it. The two-step board
 * that opens from it is Setup's own Stage 4 and Stage 5 and renders on the Store's `store-theme`
 * surface like Setup does — no wrapper here, so neither side is forced into the other's look.
 */
export function SyncTab({ onGoToSetup }: { onGoToSetup: () => void }) {
  return <SyncView onGoToSetup={onGoToSetup} />;
}
