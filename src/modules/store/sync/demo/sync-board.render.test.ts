import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/store",
}));

import { SyncBoard } from "../components/sync-board";
import { StageConfirmation } from "@/modules/store/sizing/components/stage-confirmation-acs";
import { DemoSizingProvider, useDemoSizingTools } from "./demo-sizing-provider";
import { useSizingStore } from "@/modules/store/sizing/store";

function ActiveOverview() {
  const { source, publisher, onOpenTester } = useDemoSizingTools();
  return React.createElement(StageConfirmation, {
    stageLabel: "Sync Stage 2 of 2",
    source,
    publisher,
    cacheScope: "sync-demo",
    onOpenTester,
  });
}

describe("sync board", () => {
  it("renders Size Chart Research and the two-step stepper on demo data", () => {
    const html = renderToString(React.createElement(SyncBoard, { onExit: () => undefined, notify: () => undefined }));

    // Two steps, not three.
    expect(html).toContain("Size Chart Research");
    expect(html).toContain("Active Overview");
    expect(html).not.toContain("Chart Assignment");
    // The real Stage 4 screen, with demo numbers: 4 of 5 global brands charted.
    expect(html).toContain("Sync Stage 1 of 2");
    expect(html).toContain("4 of 5 brands charted");
    expect(html).toContain("Global brands (5)");
    expect(html).toContain("Private labels (2)");
    expect(html).toContain("No brand (1)");
    expect(html).toContain("Arc’teryx");
    // The same Back / Continue footer Setup uses.
    expect(html).toContain("Continue");
    expect(html).toContain("Back to Sync Dashboard");
  });

  it("renders Active Overview on demo data without touching the live store", () => {
    const before = useSizingStore.getState().run;
    const html = renderToString(
      React.createElement(
        DemoSizingProvider,
        { notify: () => undefined, onPrevStage: () => undefined },
        React.createElement(ActiveOverview),
      ),
    );

    expect(html).toContain("Sync Stage 2 of 2");
    expect(html).toContain("ACS Product Preview");
    expect(html).toContain("Not published");
    expect(useSizingStore.getState().run).toBe(before);
  });
});
