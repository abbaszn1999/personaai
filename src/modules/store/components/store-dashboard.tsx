"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Palette, SlidersHorizontal } from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { SettingsSection } from "@/components/ui/settings-section";
import { ConnectStoreView } from "./connect-store-view";
import { CategoryMappingView } from "../mapping/category-mapping-view";
import { StyleGuideEditor } from "./style-guide-editor";
import { SetupPipeline } from "../sizing/components/setup-pipeline";
import { SizeFilterPanel } from "../sizing/components/size-filter-panel";
import { useStoreConnect } from "../hooks/use-store-connect";
import { useSizingStore } from "../sizing/store";

/**
 * Connection → Categories → Setup → Size Filter → Style Guide, which is the order the work actually
 * happens in.
 *
 * The old "Catalog Sync" tab is gone: it sat before Setup and could start an index, so a merchant
 * could produce a searchable-but-unsizable catalog by using it and never opening Setup. Its index
 * control is now Setup's final step. "Sync" (daily delta) is hidden until it is built, rather than
 * shipping a tab backed entirely by mocks.
 */
type StoreTab = "connection" | "mapping" | "setup" | "sizefilter" | "style";

const VALID_TABS = new Set<StoreTab>(["connection", "mapping", "setup", "sizefilter", "style"]);

/** `catalog` was the retired Catalog Sync tab. Anything still linking to it — a bookmark, the
 *  catalog-ready CTA — lands on Setup, which is where indexing lives now, rather than silently
 *  falling back to Connection. */
const RETIRED_TABS: Record<string, StoreTab> = { categories: "mapping", catalog: "setup", sync: "setup" };

function parseTab(value: string | null): StoreTab {
  if (!value) return "connection";
  if (VALID_TABS.has(value as StoreTab)) return value as StoreTab;
  return RETIRED_TABS[value] ?? "connection";
}

function StoreDashboardInner() {
  const store = useStoreConnect();
  const connection = store.connection;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requestedTab = parseTab(searchParams.get("section"));
  const activeTab = !connection && requestedTab !== "connection" ? "connection" : requestedTab;
  const goToSetupStageOne = useSizingStore((s) => s.goToStage);

  function goToTab(tab: StoreTab) {
    router.push(`${pathname}?section=${tab}`);
  }

  async function handleConnect() {
    await store.connect();
  }

  return (
    <>
      <DashboardPageHeader
        title="Store"
        description="Connect and manage your e-commerce platform"
      />
      {/* `store-theme` re-tunes the semantic colors for a dark surface (see globals.css). Scoped
       *  here rather than on `.dashboard-theme` so only the store pages move for now. Dialogs
       *  render inline rather than through a portal, so they inherit it too. */}
      <div className="store-theme min-h-[calc(100vh-140px)] p-6 pt-4">
        {store.syncError && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
            {store.syncError}
          </div>
        )}

        <div className="w-full min-w-0 animate-fade-in">
          {activeTab === "connection" && (
            <ConnectStoreView
              store={store}
              onConnect={handleConnect}
              onContinueToCategories={() => goToTab("mapping")}
            />
          )}

          {activeTab === "mapping" && connection && (
            <CategoryMappingView
              connection={connection}
              onContinueToSetup={() => {
                goToSetupStageOne(1);
                goToTab("setup");
              }}
            />
          )}

          {/* No `SettingsSection` card here, unlike the tabs below — Setup already opens with its
           *  own stepper (`SetupStepper`) and each stage's own header banner, matching the demo's
           *  Setup tab, which is the stepper and the stage content with no title card above them. */}
          {activeTab === "setup" && connection && <SetupPipeline />}

          {activeTab === "sizefilter" && connection && (
            <SettingsSection
              title="Size Filter"
              description="How strictly a size has to match a shopper before Persona rules an item out"
              icon={<SlidersHorizontal className="h-4 w-4" />}
              accent="wearable"
            >
              <SizeFilterPanel />
            </SettingsSection>
          )}

          {activeTab === "style" && connection && (
            <SettingsSection
              title="Style Guide"
              description="Soft styling guidance your agent leans on when building outfits and bundles"
              icon={<Palette className="h-4 w-4" />}
              accent="wearable"
            >
              <StyleGuideEditor />
            </SettingsSection>
          )}
        </div>
      </div>
    </>
  );
}

export function StoreDashboard() {
  return (
    <Suspense fallback={null}>
      <StoreDashboardInner />
    </Suspense>
  );
}
