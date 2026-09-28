"use client";

import { useState } from "react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import {
  PreviewViewportToggle,
  type PreviewViewportMode,
} from "@/modules/wearable-agent/components/preview-viewport-toggle";
import { useWorkspaceStore } from "@/modules/workspaces/store";
import { toWearableBranding } from "@/modules/workspaces/branding-schema";
import { CatalogReadyGate } from "@/modules/store/components/catalog-ready-gate";

export default function TryOnPage() {
  const ws = useWorkspaceStore((s) => s.workspace);
  const [viewportMode, setViewportMode] = useState<PreviewViewportMode>("desktop");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardPageHeader
        title="Virtual Try-On"
        description="AI-powered clothing preview — select a product and generate your try-on"
        actions={
          <PreviewViewportToggle value={viewportMode} onChange={setViewportMode} />
        }
      />
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
        {/* Wearable retrieval reads the indexed catalog, so a preview before indexing finishes
            would demo an agent that finds nothing. */}
        <CatalogReadyGate label="The preview">
          <TryOnLayout
            viewportMode={viewportMode}
            workspaceId={ws?.id}
            theme={ws?.branding.theme}
            branding={ws ? toWearableBranding(ws.branding) : undefined}
          />
        </CatalogReadyGate>
      </div>
    </div>
  );
}
