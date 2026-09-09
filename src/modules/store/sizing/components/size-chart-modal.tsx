"use client";

import * as React from "react";
import {
  Ruler,
  ShieldCheck,
  Globe,
  CalendarClock,
  ExternalLink,
  AlertTriangle,
  Users,
  Layers2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import type { ResearchedChart } from "../server-types";
import type { FoundSizeChart } from "../types";

/** A real stored chart carries its own defect list; the sync views' mock charts do not. Narrowing on
 *  that is what lets one modal render either without the caller having to say which it passed. */
function isResearched(chart: FoundSizeChart | ResearchedChart): chart is ResearchedChart {
  return "quality" in chart;
}

/**
 * A researched size chart exactly as it will be used.
 *
 * Read-only on purpose: a researched chart is shared across every store on Persona that carries
 * the brand, so letting one merchant edit it would silently change another merchant's
 * recommendations. Merchant-specific numbers belong in a gap fill or a Size Filter override.
 *
 * The measurement columns are whatever the chart actually has — a footwear chart shares no column
 * with a tops chart, and the bounds arrive already formatted, so nothing here knows the measurement
 * vocabulary.
 */
export function SizeChartModal() {
  const target = useSizingStore((s) => s.chartModal);
  const close = useSizingStore((s) => s.closeChartModal);

  const chart = target?.chart;
  const product = target?.product ?? null;

  return (
    <Modal
      isOpen={Boolean(chart)}
      onClose={close}
      icon={<Ruler className="h-4 w-4" />}
      title={chart ? `${chart.brand} size chart` : ""}
      // A real chart leads with its variant and the heading it was transcribed from: the variant is
      // what identifies it and what Phase 5 will assign, the heading is how a merchant checks that
      // the variant was named off the right table.
      description={
        chart
          ? isResearched(chart)
            ? [chart.variantName, chart.sourceTitle].filter(Boolean).join(" · ")
            : chart.categories.join(" · ")
          : undefined
      }
      footer={
        <Button variant="secondary" size="sm" onClick={close}>
          Close
        </Button>
      }
    >
      {chart && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isResearched(chart) ? (chart.needsReview ? "warning" : "success") : "success"}>
              <ShieldCheck className="h-3 w-3" /> {chart.confidence}% confidence
            </Badge>
            {isResearched(chart) && (
              <>
                <Badge variant="info">
                  <Layers2 className="h-3 w-3" /> {chart.variantName || "Unnamed variant"}
                </Badge>
                <Badge variant="neutral">
                  <Users className="h-3 w-3" /> {chart.audience}
                </Badge>
              </>
            )}
            <Badge variant="neutral">
              <Globe className="h-3 w-3" /> {chart.region}
            </Badge>
            <Badge variant="neutral">
              <CalendarClock className="h-3 w-3" /> Updated {chart.lastUpdated}
            </Badge>
            {chart.skuCount !== undefined && (
              <Badge variant="info">{chart.skuCount.toLocaleString()} items</Badge>
            )}
            {isResearched(chart) ? (
              chart.sourceUrl ? (
                <a
                  href={chart.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={chart.sourceUrl}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View source
                </a>
              ) : null
            ) : (
              chart.isInheritedFromSetup && (
                <Badge variant="default">{chart.inheritedFromSetupLabel ?? "Reused from setup"}</Badge>
              )
            )}
          </div>

          {/* Defects found in the chart itself, spelled out rather than reduced to a colour. The
              confidence badge above is the model's opinion of its own work; these are checks on the
              artifact, and when the two disagree it is this list that has been right. */}
          {isResearched(chart) && chart.quality.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {chart.quality.map((flag) => (
                <li
                  key={flag.code}
                  className={cn(
                    "flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[11px]",
                    flag.severity === "error"
                      ? "border-[var(--color-error-border)] bg-[var(--color-error-light)] text-[var(--color-error)]"
                      : "border-[var(--color-warning-border)] bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-bold">{flag.label}.</span>{" "}
                    <span className="text-[var(--color-text-secondary)]">{flag.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {product && (
            <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
              Opened from <span className="text-[var(--color-text-primary)]">{product.title}</span>{" "}
              <span className="font-mono">({product.sku})</span>
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--color-surface-elevated)]">
                  {chart.headers.map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {chart.rows.map((row, index) => (
                  <tr
                    key={index}
                    className={cn(index % 2 === 1 && "bg-[var(--color-surface-base)]")}
                  >
                    {chart.headers.map((header, columnIndex) => (
                      <td
                        key={header}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5",
                          columnIndex === 0
                            ? "font-semibold text-[var(--color-text-primary)]"
                            : "font-mono text-[var(--color-text-secondary)]"
                        )}
                      >
                        {row[header] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10px] text-[var(--color-text-muted)]">
            Every measurement is a body range in centimetres, not a garment measurement. The label
            columns beside them (EU, UK, US, neck, denim inch) are the brand&apos;s own printed sizes, kept
            so your stock&apos;s size strings can be matched back to a row.{" "}
            {!isResearched(chart) || chart.shared
              ? `This chart is shared across all Persona stores carrying ${chart.brand} — to adjust how strictly it is applied to your catalog, use the Size Filter tab.`
              : "This chart belongs to your store alone — to adjust how strictly it is applied, use the Size Filter tab."}
          </p>
        </>
      )}
    </Modal>
  );
}
