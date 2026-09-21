"use client";

import { WsGeneralSection } from "./ws-general-section";
import { WsDangerSection } from "./ws-danger-section";
import type { Workspace } from "@/modules/workspaces/types";

interface Props { workspace: Workspace }

export function WorkspaceSettingsDashboard({ workspace }: Props) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <WsGeneralSection workspace={workspace} />
      <WsDangerSection workspace={workspace} />
    </div>
  );
}
