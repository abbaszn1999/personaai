"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import {
  PreviewViewportToggle,
  type PreviewViewportMode,
} from "@/modules/wearable-agent/components/preview-viewport-toggle";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore } from "@/modules/workspaces/store";

interface Props { params: Promise<{ id: string }> }

export default function TryOnPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const ws = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === id));
  const [viewportMode, setViewportMode] = useState<PreviewViewportMode>("desktop");

  // This preview is wearable-only — an unwearable workspace has no avatar/try-on to show,
  // so bounce to its actual agent preview instead of rendering the wrong layout.
  useEffect(() => {
    if (ws && ws.mode !== "wearable") router.replace(`/workspaces/${id}/assistant`);
  }, [ws, id, router]);

  if (ws && ws.mode !== "wearable") return null;

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
        <TryOnLayout viewportMode={viewportMode} workspaceId={id} />
      </div>
    </div>
  );
}
