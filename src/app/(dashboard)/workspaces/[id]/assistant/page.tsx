"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { ChatInterface } from "@/modules/shopping-agent/components/chat-interface";
import { PreviewViewportToggle, type PreviewViewportMode } from "@/modules/wearable-agent/components/preview-viewport-toggle";
import { PreviewViewportShell } from "@/modules/wearable-agent/components/preview-viewport-shell";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { params: Promise<{ id: string }> }

export default function AssistantPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const ws = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === id));
  const [viewportMode, setViewportMode] = useState<PreviewViewportMode>("desktop");

  // This preview is unwearable-only — a wearable workspace's real agent is the try-on layout,
  // so bounce there instead of rendering the wrong preview.
  useEffect(() => {
    if (ws && ws.mode !== "unwearable") router.replace(`/workspaces/${id}/try-on`);
  }, [ws, id, router]);

  if (ws && ws.mode !== "unwearable") return null;

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
          <ChatInterface viewportMode={viewportMode} workspaceId={id} />
        </PreviewViewportShell>
      </div>
    </div>
  );
}
