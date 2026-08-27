"use client";

import * as React from "react";
import { X, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { useStoreConnectionStore } from "@/modules/store/store";
import { buildFieldRows } from "@/modules/store/mapping-fields";

function sampleTabLabel(sample: { raw: Record<string, unknown> }, index: number): string {
  const title = sample.raw.title;
  return typeof title === "string" && title.length > 0 ? title : `Product ${index + 1}`;
}

/**
 * The one-time gate: a real product from the merchant's own store, run through the exact mapper
 * the real backfill uses, shown as a field-by-field table before the merchant can start indexing.
 * One row per field the mapper actually touches — including the ACS-only attributes it assigns
 * for search isolation — rather than a curated handful, so nothing about the real payload is
 * hidden. Approving replays whatever category save triggered this modal — see
 * `approveMappingPreview`.
 */
export function MappingPreviewModal() {
  const mappingPreview = useStoreConnectionStore((s) => s.mappingPreview);
  const closeMappingPreview = useStoreConnectionStore((s) => s.closeMappingPreview);
  const approveMappingPreview = useStoreConnectionStore((s) => s.approveMappingPreview);
  const [approving, setApproving] = React.useState(false);
  const [selectedSample, setSelectedSample] = React.useState(0);

  const samples = mappingPreview.samples;
  // Clamp rather than reset on every render — a shrinking sample count (e.g. a re-fetch after
  // narrowing the category selection) shouldn't yank the merchant back to product 1 mid-review.
  const activeIndex = Math.min(selectedSample, Math.max(samples.length - 1, 0));
  const activeSample = samples[activeIndex];

  if (!mappingPreview.isOpen) return null;

  async function handleApprove() {
    setApproving(true);
    await approveMappingPreview();
    setApproving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-base)] px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Review your product mapping</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              How each field on a real product from your store maps onto AI Commerce Search, exactly as the
              first import will send it.
            </p>
          </div>
          <button onClick={closeMappingPreview} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {mappingPreview.isLoading && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
            </div>
          )}

          {mappingPreview.error && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-error)] py-4">
              <AlertCircle className="h-4 w-4" /> {mappingPreview.error}
            </div>
          )}

          {!mappingPreview.isLoading && !mappingPreview.error && samples.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">
              No products found yet in this selection to preview.
            </p>
          )}

          {!mappingPreview.isLoading && !mappingPreview.error && samples.length > 0 && activeSample && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {samples.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedSample(i)}
                    className={cn(
                      "max-w-[10rem] truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      i === activeIndex
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                        : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                    )}
                    title={sampleTabLabel(activeSample, i)}
                  >
                    {sampleTabLabel(sample, i)}
                  </button>
                ))}
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
                <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] bg-[var(--color-surface-raised)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <div className="px-3 py-2">Field</div>
                  <div className="px-3 py-2">From your store</div>
                  <div className="px-3 py-2 text-[var(--color-brand)]">Sent to search (ACS)</div>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {buildFieldRows(activeSample).map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] text-xs"
                    >
                      <div className="px-3 py-2.5 font-medium text-[var(--color-text-primary)] flex items-center gap-1.5">
                        {row.label}
                        {row.internal && (
                          <Badge variant="neutral" className="text-[9px] px-1.5 py-0">
                            Internal
                          </Badge>
                        )}
                      </div>
                      <div className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                        <p className="text-[var(--color-text-primary)]">{row.storeValue}</p>
                        {row.storePath && (
                          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{row.storePath}</p>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <p className={row.notSent ? "text-[var(--color-text-muted)] italic" : "text-[var(--color-text-primary)]"}>
                          {row.acsValue}
                        </p>
                        {!row.notSent && (
                          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{row.acsPath}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-[var(--color-text-muted)]">
                Rows marked <Badge variant="neutral" className="text-[9px] px-1.5 py-0">Internal</Badge> are
                attributes AI Commerce Search needs to keep your catalog isolated and correctly scoped — they
                are not fields your store sends.
              </p>
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-base)] px-5 py-4">
          <Button variant="secondary" size="sm" onClick={closeMappingPreview}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={approving}
            disabled={mappingPreview.isLoading || samples.length === 0}
            onClick={handleApprove}
          >
            <Check className="h-3.5 w-3.5" /> Approve &amp; start indexing
          </Button>
        </div>
      </div>
    </div>
  );
}
