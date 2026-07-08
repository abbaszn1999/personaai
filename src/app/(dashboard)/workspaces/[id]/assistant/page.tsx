"use client";

import { use, useState } from "react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { ChatInterface } from "@/modules/shopping-agent/components/chat-interface";
import { PreviewViewportToggle, type PreviewViewportMode } from "@/modules/wearable-agent/components/preview-viewport-toggle";
import { PreviewViewportShell } from "@/modules/wearable-agent/components/preview-viewport-shell";
import { Badge } from "@/components/ui/badge";

interface Props { params: Promise<{ id: string }> }

export default function AssistantPage({ params }: Props) {
  use(params);
  const [viewportMode, setViewportMode] = useState<PreviewViewportMode>("desktop");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DashboardPageHeader
        title="Shopping Assistant"
        description="AI chat that helps your customers find the perfect product"
        actions={
          <div className="flex items-center gap-2.5">
            <PreviewViewportToggle value={viewportMode} onChange={setViewportMode} />
            <Badge variant="unwearable">Unwearable Agent</Badge>
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
        <PreviewViewportShell mode={viewportMode} layout="full">
          <ChatInterface viewportMode={viewportMode} />
        </PreviewViewportShell>
      </div>
    </div>
  );
}
