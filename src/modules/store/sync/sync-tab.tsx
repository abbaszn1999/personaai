"use client";

import { SyncView } from "./components/sync-view";

/**
 * The Sync tab: new products held since Setup published, synced on the merchant's word.
 *
 * The dashboard keeps its own light `slate` surface. The two-step board that opens from it is
 * Setup's own Stage 4 and Stage 5 and renders on the Store's `store-theme` surface like Setup does —
 * no wrapper here, so neither side is forced into the other's look.
 */
export function SyncTab({ onGoToSetup }: { onGoToSetup: () => void }) {
  return <SyncView onGoToSetup={onGoToSetup} />;
}
