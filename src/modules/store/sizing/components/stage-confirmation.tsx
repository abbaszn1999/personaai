"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Loader2,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  isBodyMeasurement,
  isSizingGroup,
  MEASUREMENTS,
  measurementsFor,
  type Measurement,
} from "@/lib/sizing/measurements";
import { audienceForPersonaPath } from "@/lib/sizing/variant-match";
import type {
  ServerBrandType,
  SizingResolutionSummary,
  SizingSampleResponse,
  SizingSampleRow,
} from "../server-types";
import { isRunWorking } from "../server-types";
import { useSizingStore } from "../store";

const PAGE_SIZE = 25;
const STATUS_LABELS: Record<string, string> = {
  matched: "Ready",
  "sizes-unknown": "Rescan needed",
  "no-leaf": "No sizing leaf",
  unclassified: "Brand unclassified",
  "stale-brand-mapping": "Brand mapping changed",
  "no-chart": "No chart covers this leaf",
  ambiguous: "Several charts cover this leaf",
  "fit-only": "Fit-specific chart only",
  "parent-mismatch": "Leaf and parent disagree",
  "sizes-unresolved": "Size labels do not match",
};

function money(row: SizingSampleRow): string {
  if (row.price === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: row.currency ?? "USD",
    }).format(row.price);
  } catch {
    return `${row.price} ${row.currency ?? ""}`.trim();
  }
}

function brandTypeParam(type: "all" | ServerBrandType): string {
  return type === "all" ? "" : `&brandType=${encodeURIComponent(type)}`;
}

type PreviewChartRow = NonNullable<SizingSampleRow["chartRows"]>[number];

function stockedChartRows(preview: SizingSampleRow): PreviewChartRow[] {
  return (preview.chartRows ?? []).filter((chartRow) => {
    const labels = [chartRow.size, ...Object.values(chartRow.aliases ?? {})];
    return preview.canonicalSizes?.some((size) => labels.includes(size));
  });
}

function bodyMeasurementsForPreview(preview: SizingSampleRow): Measurement[] {
  if (!isSizingGroup(preview.sizingCategory)) return [];
  const audience = preview.primaryLeafKey
    ? audienceForPersonaPath(preview.primaryLeafKey) ?? "unisex"
    : "unisex";
  return measurementsFor(preview.sizingCategory, audience).filter(isBodyMeasurement);
}

function measurementRange(row: PreviewChartRow, measurement: Measurement): string {
  const min = row[`${measurement}_min`];
  const max = row[`${measurement}_max`];
  if (typeof min === "number" && typeof max === "number") {
    return min === max ? String(min) : `${min}–${max}`;
  }
  if (typeof min === "number") return `${min}+`;
  if (typeof max === "number") return `≤${max}`;
  return "—";
}

function StageFiveChartPreview({
  preview,
  onClose,
}: {
  preview: SizingSampleRow;
  onClose: () => void;
}) {
  const chartRows = stockedChartRows(preview);
  const measurements = bodyMeasurementsForPreview(preview);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      icon={<Ruler className="h-4 w-4" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {preview.canonicalBrandKey || preview.brand || "No brand"}
          <span className="rounded-md border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-strong)]">
            {preview.chartVariantName}
          </span>
        </span>
      }
      description="Only chart rows matching this product's stocked canonical sizes are shown."
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-4 py-2 text-xs font-bold text-[var(--color-text-inverse)] shadow-sm transition-opacity hover:opacity-90"
        >
          Done &amp; Close
        </button>
      }
    >
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-bold">Size</th>
              <th className="whitespace-nowrap px-4 py-3 font-bold">Aliases</th>
              {measurements.map((measurement) => (
                <th key={measurement} className="whitespace-nowrap px-4 py-3 font-bold">
                  {MEASUREMENTS[measurement].label}
                  <span className="ml-1 font-normal text-[var(--color-text-muted)]">
                    ({MEASUREMENTS[measurement].unit})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {chartRows.map((chartRow) => (
              <tr key={chartRow.size} className="transition-colors hover:bg-[var(--color-brand-light)]/30">
                <td className="whitespace-nowrap px-4 py-3 font-bold text-[var(--color-text-primary)]">
                  {chartRow.size}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--color-text-secondary)]">
                  {Object.values(chartRow.aliases ?? {}).join(" · ") || "—"}
                </td>
                {measurements.map((measurement) => (
                  <td
                    key={measurement}
                    className="whitespace-nowrap px-4 py-3 font-mono text-[var(--color-text-secondary)]"
                  >
                    {measurementRange(chartRow, measurement)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function StageConfirmation() {
  const router = useRouter();
  const pathname = usePathname();
  const run = useSizingStore((state) => state.run);
  const loadRun = useSizingStore((state) => state.loadRun);
  const prevStage = useSizingStore((state) => state.prevStage);

  const [rows, setRows] = React.useState<SizingSampleRow[]>([]);
  const [summary, setSummary] = React.useState<SizingResolutionSummary | null>(null);
  const [brandType, setBrandType] = React.useState<"all" | ServerBrandType>("all");
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [preview, setPreview] = React.useState<SizingSampleRow | null>(null);
  const publishRunId = React.useRef<string | null>(null);
  const publishObservedWorking = React.useRef(false);

  const loadOverview = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const cursor = (page - 1) * PAGE_SIZE;
    const params =
      `?include=resolution&pageSize=${PAGE_SIZE}&count=1&cursor=${cursor}` +
      brandTypeParam(brandType) +
      (query ? `&q=${encodeURIComponent(query)}` : "");
    try {
      const [sampleResponse, summaryResponse] = await Promise.all([
        fetch(`/api/store-connection/sizing/sample${params}`, { cache: "no-store" }),
        fetch("/api/store-connection/sizing/resolution-summary", { cache: "no-store" }),
      ]);
      const sampleBody = await sampleResponse.json() as SizingSampleResponse & { error?: string };
      const summaryBody = await summaryResponse.json() as SizingResolutionSummary & { error?: string };
      if (!sampleResponse.ok) throw new Error(sampleBody.error ?? "Could not load products");
      if (!summaryResponse.ok) throw new Error(summaryBody.error ?? "Could not load resolution totals");
      setRows(sampleBody.rows);
      setSummary(summaryBody);
      setTotal(sampleBody.filteredTotal ?? sampleBody.selectionTotal ?? summaryBody.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Active Overview");
    } finally {
      setLoading(false);
    }
  }, [brandType, page, query]);

  React.useEffect(() => {
    void loadRun();
  }, [loadRun]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  React.useEffect(() => {
    if (!isRunWorking(run)) return;
    const timer = window.setInterval(() => void loadRun(), 2_000);
    return () => window.clearInterval(timer);
  }, [loadRun, run]);

  React.useEffect(() => {
    if (!publishing || !publishObservedWorking.current || run?.id !== publishRunId.current) return;
    if (isRunWorking(run)) return;

    const timer = window.setTimeout(() => {
      setPublishing(false);
      publishRunId.current = null;
      publishObservedWorking.current = false;
      if (run.status === "complete") {
        setNotice("Sizing products were republished to ACS successfully.");
        void loadOverview();
      } else if (run.status === "failed") {
        setError(run.error ?? "Sizing publish failed.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview, publishing, run]);

  async function startPublish() {
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/store-connection/sizing/publish", { method: "POST" });
      const body = await response.json() as {
        run?: NonNullable<typeof run>;
        error?: string;
        message?: string;
        rescanning?: boolean;
      };
      if (!response.ok) throw new Error(body.error ?? "Could not publish sizing");
      if (body.run) {
        publishRunId.current = body.run.id;
        publishObservedWorking.current = isRunWorking(body.run);
      }
      if (body.rescanning) {
        setNotice(body.message ?? "A fresh catalog scan has started.");
      }
      await loadRun();
    } catch (caught) {
      setPublishing(false);
      publishRunId.current = null;
      publishObservedWorking.current = false;
      setError(caught instanceof Error ? caught.message : "Could not publish sizing");
    }
  }

  const matched = summary?.matched ?? 0;
  const percentage = summary?.matchPercent ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const publishWorking = publishing || isRunWorking(run);
  const publishProgress =
    publishWorking && run?.phaseTotal && run.phaseDone !== null
      ? ` ${Math.min(run.phaseDone, run.phaseTotal).toLocaleString()}/${run.phaseTotal.toLocaleString()}`
      : "";
  const publishLabel = publishWorking
    ? run?.stage === "resolve"
      ? `Preparing sizing data…${publishProgress}`
      : run?.stage === "publish"
        ? `Publishing to ACS…${publishProgress}`
        : `Preparing catalog…${publishProgress}`
    : run?.publishedAt
      ? "Republish sizing"
      : "Finish & publish sizing";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-pink-50 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-violet-700">Stage 5 of 5 · Active Catalog</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  {percentage}% resolved
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Active Catalog &amp; Size-Chart Mapping Matrix
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Every result below is resolved from the product&apos;s primary Persona leaf and Stage 4 chart coverage.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-4">
          {[
            { label: "Catalog products", value: summary?.total ?? "—", icon: Layers },
            { label: "Ready for sizing", value: matched, icon: CheckCircle2 },
            { label: "Exact charts used", value: summary?.chartCount ?? "—", icon: ShieldCheck },
            { label: "Unresolved", value: summary?.unresolved ?? "—", icon: Tag },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Icon className="h-4 w-4 text-violet-600" /> {label}
              </div>
              <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(queryInput.trim());
            }}
          >
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search SKU, product or brand"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-violet-400"
            />
          </form>
          <div className="flex flex-wrap gap-2">
            {(["all", "global", "private", "none"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setPage(1);
                  setBrandType(type);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  brandType === type ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {type === "all" ? "All" : type === "none" ? "No brand" : type[0].toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {notice && (
          <div className="m-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            {notice}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {["Product", "Brand", "Merchant path", "Sizing leaf", "Store sizes", "Canonical sizes", "Final chart", "Status", ""].map((label) => (
                  <th key={label} className="px-4 py-3 font-bold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Resolving products…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-500">No products match this view.</td></tr>
              ) : rows.map((row) => {
                const ready = row.resolutionStatus === "matched";
                return (
                  <tr key={row.externalId} className="align-top hover:bg-violet-50/30">
                    <td className="px-4 py-3">
                      <div className="flex min-w-[190px] gap-3">
                        {row.imageUrl ? <Image src={row.imageUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-slate-100" />}
                        <div><p className="font-semibold text-slate-900">{row.title}</p><p className="text-slate-400">{row.sku ?? "No SKU"} · {money(row)}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{row.canonicalBrandKey || row.brand || "No brand"}</p><p className="text-slate-400">{row.brand ?? "Unbranded"}</p></td>
                    <td className="max-w-[180px] px-4 py-3 text-slate-600">{row.storeCategoryPath.join(" › ") || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{row.primaryLeafKey ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.sizes.join(", ") || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-violet-700">{row.canonicalSizes?.join(", ") || "—"}</td>
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{row.chartVariantName ?? "—"}</p><p className="max-w-[150px] truncate font-mono text-[9px] text-slate-400">{row.chartKey}</p></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{STATUS_LABELS[row.resolutionStatus ?? ""] ?? "Pending"}</span></td>
                    <td className="px-4 py-3">
                      <button type="button" disabled={!ready} onClick={() => setPreview(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-violet-700 disabled:opacity-30"><Eye className="h-3.5 w-3.5" /> Chart</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span><strong>{total.toLocaleString()}</strong> products · page {page} of {maxPage}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
            <button type="button" disabled={page >= maxPage || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={prevStage} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" /> Back to Size Chart Research</button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {run?.publishedAt && !publishWorking && (
            <button type="button" onClick={() => router.push(`${pathname}?section=sizingtester`)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-2.5 text-sm font-bold text-violet-700 shadow-sm">Open Sizing Tester <ArrowRight className="h-4 w-4" /></button>
          )}
          <button
            type="button"
            disabled={publishWorking || loading}
            aria-busy={publishWorking}
            onClick={() => void startPublish()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {publishLabel}
          </button>
        </div>
      </div>

      {preview && (
        <StageFiveChartPreview preview={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
