"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { StageColumnMapping } from "@/modules/store/components/stage-column-mapping";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useSizingStore } from "../store";

/**
 * Stage 1 — which of the merchant's columns feeds each field of the search index, and the one place
 * that mapping is reviewed, changed and approved.
 *
 * A thin wrapper on purpose: loading, the empty catalog case and the brand union live here, the table
 * itself in `StageColumnMapping`, which the Mapping page can render on its own terms.
 *
 * No `StageHeaderBanner` here, unlike every other stage — the demo's own Stage 1
 * (`Documentation/store_src_demo_frontend/components/Stage1ColumnMapping.tsx`) doesn't open with one
 * either. `SetupStepper`'s "Column Mapping" label and the table's own sub-bar already say what this
 * stage is. The stage action lives in the table's bottom bar for the same reason, which is why
 * `SetupPipeline` hides its own footer here rather than showing two Continue buttons.
 */
export function StageFieldMapping({
  onApproveAndContinue,
  onSkipToOverview,
  actionPending,
  actionLabel,
}: {
  onApproveAndContinue: () => void;
  onSkipToOverview: () => void;
  actionPending: boolean;
  actionLabel: string;
}) {
  const { columns, brands: sampleBrands, isLoading, hasLoaded, error } = useStoreConnectionStore((s) => s.mapping);
  const approved = useStoreConnectionStore((s) => s.acsMapping.approved);
  const loadMapping = useStoreConnectionStore((s) => s.loadMapping);
  const summary = useSizingStore((s) => s.summary);

  /**
   * The brands a Part 2 sizing exception can be attached to.
   *
   * Both sources, unioned on the brand key. The sample read by this stage's own discovery call is
   * what makes the control usable on a fresh store — the phase map puts the exception here, ahead of
   * the Stage 2 scan that writes coverage. Coverage is the fuller list once it exists, so a merchant
   * returning after a scan sees every brand rather than only the sampled ones. Unbranded rows are
   * dropped: there is no brand there to hold an exception.
   */
  const brands = React.useMemo(() => {
    const byKey = new Map(sampleBrands.map((brand) => [brand.brandKey, brand]));
    for (const brand of summary?.brands ?? []) {
      if (brand.name === null || byKey.has(brand.brandKey)) continue;
      byKey.set(brand.brandKey, { brandKey: brand.brandKey, name: brand.name });
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [sampleBrands, summary]);

  React.useEffect(() => {
    if (!hasLoaded && !isLoading) void loadMapping();
  }, [hasLoaded, isLoading, loadMapping]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading real products from your store…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-error)]">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }

  if (hasLoaded && columns.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
        No products found in your mapped categories yet. Map some categories on the Mapping page, then come back.
      </p>
    );
  }

  return (
    <StageColumnMapping
      brands={brands}
      approved={approved}
      onApproveAndContinue={onApproveAndContinue}
      onSkipToOverview={onSkipToOverview}
      actionPending={actionPending}
      actionLabel={actionLabel}
    />
  );
}
