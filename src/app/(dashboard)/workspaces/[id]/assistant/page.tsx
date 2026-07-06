"use client";

import { use } from "react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { ChatInterface } from "@/modules/shopping-agent/components/chat-interface";
import { Badge } from "@/components/ui/badge";

interface Props { params: Promise<{ id: string }> }

export default function AssistantPage({ params }: Props) {
  use(params);
  return (
    <>
      <DashboardPageHeader
        title="Shopping Assistant"
        description="AI chat that helps your customers find the perfect product"
        actions={<Badge variant="unwearable">Unwearable Agent</Badge>}
      />
      <div className="p-6">
        <ChatInterface />
      </div>
    </>
  );
}
