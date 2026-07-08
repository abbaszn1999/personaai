"use client";

import { use, useState } from "react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import {
  PreviewViewportToggle,
  type PreviewViewportMode,
} from "@/modules/wearable-agent/components/preview-viewport-toggle";
import { Badge } from "@/components/ui/badge";

interface Props { params: Promise<{ id: string }> }

export default function TryOnPage({ params }: Props) {
  use(params);
  const [viewportMode, setViewportMode] = useState<PreviewViewportMode>("desktop");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardPageHeader
        title="Virtual Try-On"
        description="AI-powered clothing preview — select a product and generate your try-on"
        actions={
          <div className="flex items-center gap-2.5">
            <PreviewViewportToggle value={viewportMode} onChange={setViewportMode} />
            <Badge variant="wearable">Wearable Agent</Badge>
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
        <TryOnLayout viewportMode={viewportMode} />
      </div>
    </div>
  );
}
