"use client";

import * as React from "react";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MappingFieldTable, countMappedFields } from "@/modules/store/components/mapping-field-table";
import { buildFieldRows } from "@/modules/store/mapping-fields";
import { useStoreConnectionStore } from "@/modules/store/store";
import { useSizingStore } from "../store";
import { StageHeaderBanner } from "./stage-header-banner";

/**
 * Stage 1 — where the merchant's product fields land in the search index, and the one place the
 * mapping is reviewed, changed and approved.
 *
 * It used to be read-only, telling merchants to go approve on the Categories tab while the actual
 * Approve button lived in a modal that opened from two other places. All of that collapsed here:
 * approving is the gate on indexing, indexing is the last step of this pipeline, so the decision and
 * its consequence now sit in the same flow.
 */
export function StageFieldMapping() {
  const { samples, groups, optionRoles, isLoading, hasLoaded, isApproving, error } = useStoreConnectionStore(
    (s) => s.mapping
  );
  const approved = useStoreConnectionStore((s) => s.acsMapping.approved);
  const loadMapping = useStoreConnectionStore((s) => s.loadMapping);
  const approveMapping = useStoreConnectionStore((s) => s.approveMapping);
  const startRun = useSizingStore((s) => s.startRun);
  const nextStage = useSizingStore((s) => s.nextStage);
  const summary = useSizingStore((s) => s.summary);

  /**
   * The brands a Part 2 sizing exception can be attached to.
   *
   * Sourced from the scan's coverage rather than from the sample products on this screen: coverage
   * has every brand in the selection, while a sample is three products. Unbranded rows are dropped —
   * there is no brand there to hold an exception. Empty before the first scan, which the panel says
   * outright instead of showing an input that cannot match anything.
   */
  const brands = React.useMemo(
    () =>
      (summary?.brands ?? [])
        .filter((brand) => brand.name !== null)
        .map((brand) => ({ brandKey: brand.brandKey, name: brand.name as string })),
    [summary]
  );

  React.useEffect(() => {
    if (!hasLoaded && !isLoading) void loadMapping();
  }, [hasLoaded, isLoading, loadMapping]);

  /**
   * Approval is what starts the catalog read, rather than a separate button two stages later.
   *
   * The scan can only run against an approved mapping — it reads sizes, audience and brand through
   * it — so approving *is* the moment the work becomes possible, and every later trigger was just a
   * second confirmation of a decision already made. Safe to fire on approval specifically because
   * the button only exists while the mapping is unapproved: changing a field clears the approval,
   * so a re-approval always means the previous scan read a mapping that no longer applies.
   */
  const approveAndScan = React.useCallback(async () => {
    if (!(await approveMapping())) return;
    await startRun();
    // Forward onto the stage that reports the scan. Approving otherwise looks like nothing happened
    // — the work is a background job, so without this the only feedback for starting a multi-minute
    // catalog read is a badge changing to "Approved".
    nextStage();
  }, [approveMapping, startRun, nextStage]);

  const stats = samples.length > 0 ? countMappedFields(buildFieldRows(samples[0], optionRoles)) : null;

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={1}
        eyebrow="Review, adjust, then approve"
        title="Connect Your Store — Field Mapping"
        description={
          groups.length > 0
            ? "Every field the importer reads from a real product in your store, and where it lands in search. Most of it is detected automatically — check the option groups at the bottom if any of yours are named something we wouldn't recognise, then approve."
            : "Every field the importer reads from a real product in your store, and where it lands in search. Approving this is what unlocks indexing at the end of setup."
        }
        actions={
          <div className="flex items-center gap-2">
            {stats && (
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-3.5 py-2 text-left">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Auto-mapped
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-[var(--color-brand-strong)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  {stats.mapped}/{stats.total} Fields
                </div>
              </div>
            )}
            {approved ? (
              <Badge variant="success">
                <Check className="h-3 w-3" /> Approved
              </Badge>
            ) : (
              samples.length > 0 && (
                <Button onClick={() => void approveAndScan()} disabled={isApproving}>
                  {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve &amp; read catalog
                </Button>
              )
            )}
          </div>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading a real product from your store…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 py-4 text-sm text-[var(--color-error)]">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {!isLoading && !error && hasLoaded && samples.length === 0 && (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          No products found in your selected categories yet. Pick categories on the Categories tab, then come back.
        </p>
      )}

      {!isLoading && samples.length > 0 && <MappingFieldTable samples={samples} brands={brands} />}
    </div>
  );
}
