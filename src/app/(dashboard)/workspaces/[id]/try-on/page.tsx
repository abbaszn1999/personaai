"use client";

import { use } from "react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { TryOnLayout } from "@/modules/wearable-agent/components/try-on-layout";
import { Badge } from "@/components/ui/badge";

interface Props { params: Promise<{ id: string }> }

export default function TryOnPage({ params }: Props) {
  use(params);
  return (
    <>
      <DashboardPageHeader
        title="Virtual Try-On"
        description="AI-powered clothing preview — select a product and generate your try-on"
        actions={<Badge variant="wearable">Wearable Agent</Badge>}
      />
      <div className="p-6">
        <TryOnLayout />
      </div>
    </>
  );
}
