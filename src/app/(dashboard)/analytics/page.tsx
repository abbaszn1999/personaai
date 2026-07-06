"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/modules/workspaces/store";

export default function AnalyticsRedirectPage() {
  const router = useRouter();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const id = activeWorkspaceId ?? workspaces[0]?.id;

  useEffect(() => {
    if (id) {
      router.replace(`/workspaces/${id}/analytics`);
    } else {
      router.replace("/");
    }
  }, [id, router]);

  return null;
}
