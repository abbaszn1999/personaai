"use client";

import * as React from "react";
import Image from "next/image";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatPersonaSegments } from "@/modules/store/mapping/persona-taxonomy";
import {
  STAGE_FIVE_PAGE_SIZES,
  type AcsStageFiveResponse,
  type AcsStageFiveRow,
  type ServerBrandType,
  type SizingResolutionSummary,
} from "../server-types";

function money(row: AcsStageFiveRow): string {
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

/** The deepest `persona > dept > cat > sub` entry in a product's categories, as a readable label. */
function personaPathOf(categories: string[]): { label: string; raw: string } | null {
  let best: string[] | null = null;
  for (const category of categories) {
    const parts = category.split(">").map((part) => part.trim());
    if (parts[0] !== "persona" || parts.length < 2) continue;
    if (!best || parts.length > best.length) best = parts;
  }
  if (!best) return null;
  return { label: formatPersonaSegments(best), raw: best.join(" > ") };
}

function shortId(id: string | null): string {
  if (!id) return "—";
  const marker = id.lastIndexOf("/");
  const value = marker >= 0 ? id.slice(marker + 1) : id;
  return value.length > 30 ? `…${value.slice(-29)}` : value;
}

function parseFitRows(row: AcsStageFiveRow): Array<Record<string, unknown>> {
  return row.fitRows.flatMap((value) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? [parsed as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });
}

function fitValue(value: unknown): string {
  if (Array.isArray(value)) {
    const [min, max] = value;
    if (min === null) return max === null ? "—" : `≤${String(max)}`;
    if (max === null) return `${String(min)}+`;
    return min === max ? String(min) : `${String(min)}–${String(max)}`;
  }
  return value === null || value === undefined ? "—" : String(value);
}

function AcsSizingPayloadModal({ row, onClose }: { row: AcsStageFiveRow; onClose: () => void }) {
  const fitRows = parseFitRows(row);
  const columns = [...new Set(fitRows.flatMap((fitRow) => Object.keys(fitRow)))];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      icon={<Box className="h-4 w-4" />}
      title={`${row.type} · ${row.title}`}
      description="Exact sizing payload currently stored on this ACS record."
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white"
        >
          Done &amp; Close
        </button>
      }
    >
      <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="font-semibold text-slate-500">ACS ID</span>
          <p className="mt-1 break-all font-mono text-[10px] text-slate-700">{row.id}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="font-semibold text-slate-500">Resolved sizing</span>
          <p className="mt-1 text-slate-700">
            {[row.fitAudience, row.fitGroup, row.fitChartVariant].filter(Boolean).join(" · ") || "No sizing payload"}
          </p>
        </div>
      </div>
      {fitRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-max text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-bold uppercase tracking-wide">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fitRows.map((fitRow, index) => (
                <tr key={`${String(fitRow.s ?? "row")}-${index}`}>
                  {columns.map((column) => (
                    <td key={column} className="px-4 py-3 font-mono text-slate-700">
                      {fitValue(fitRow[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          This ACS record has no sizing rows.
        </div>
      )}
    </Modal>
  );
}

/** How often a view the server is still rebuilding is asked for again. */
const REFRESH_POLL_MS = 3_000;
const SESSION_CACHE_PREFIX = "persona:stage5:";
/** Session storage is a few megabytes per origin; a 500-row page with every fit row can approach
 *  that, and failing to cache one is better than evicting everything else. */
const SESSION_CACHE_MAX_CHARS = 1_500_000;

/**
 * The last answer for each Stage 5 request, so returning to the stage — or reloading the page — paints
 * at once while the request that confirms it is in flight. Kept in memory for the session and in
 * session storage across reloads of the same tab.
 */
const memoryCache = new Map<string, unknown>();

function readCached<T>(key: string): T | null {
  if (memoryCache.has(key)) return memoryCache.get(key) as T;
  try {
    const stored = window.sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!stored) return null;
    const value = JSON.parse(stored) as T;
    memoryCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

function writeCached(key: string, value: unknown) {
  memoryCache.set(key, value);
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= SESSION_CACHE_MAX_CHARS) {
      window.sessionStorage.setItem(SESSION_CACHE_PREFIX + key, serialized);
    }
  } catch {
    // Quota or privacy mode: the memory copy still serves this session.
  }
}

export function StageFiveAcsTable({
  refreshKey,
  cacheScope,
}: {
  refreshKey: string | null | undefined;
  /** Whose catalog this is, so a cached answer is never shown to a different store. */
  cacheScope: string;
}) {
  const [response, setResponse] = React.useState<AcsStageFiveResponse | null>(null);
  const [summary, setSummary] = React.useState<SizingResolutionSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pollTick, setPollTick] = React.useState(0);
  const [summaryPollTick, setSummaryPollTick] = React.useState(0);
  /** False while the table still shows a different page or filter than the one being loaded. */
  const [showingRequested, setShowingRequested] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState<"all" | "PRIMARY" | "VARIANT">("all");
  const [availability, setAvailability] = React.useState<"all" | "IN_STOCK" | "OUT_OF_STOCK">("all");
  const [brandType, setBrandType] = React.useState<"all" | Extract<ServerBrandType, "global" | "private" | "none">>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<(typeof STAGE_FIVE_PAGE_SIZES)[number]>(25);
  const [preview, setPreview] = React.useState<AcsStageFiveRow | null>(null);
  const requestController = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (query) params.set("q", query);
    if (type !== "all") params.set("type", type);
    if (availability !== "all") params.set("availability", availability);
    if (brandType !== "all") params.set("brandType", brandType);
    const cacheKey = `${cacheScope}:${refreshKey ?? "draft"}:products:${params}`;

    const cached = readCached<AcsStageFiveResponse>(cacheKey);
    if (cached) setResponse(cached);
    setShowingRequested(cached !== null);
    setLoading(true);
    setError(null);

    try {
      const result = await fetch(`/api/store-connection/sizing/acs-products?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await result.json() as AcsStageFiveResponse & { error?: string };
      if (!result.ok) throw new Error(body.error ?? "Could not load ACS products");
      if (requestController.current !== controller) return;
      setResponse(body);
      setShowingRequested(true);
      writeCached(cacheKey, body);
      // Read the next page ahead, into the cache only, so Next paints at once. Skipped while the
      // server is still rebuilding, since that page would be replaced moments later anyway.
      if (!body.refreshing && page * pageSize < body.total) {
        const nextParams = new URLSearchParams(params);
        nextParams.set("offset", String(page * pageSize));
        const nextKey = `${cacheScope}:${refreshKey ?? "draft"}:products:${nextParams}`;
        if (!readCached(nextKey)) {
          void fetch(`/api/store-connection/sizing/acs-products?${nextParams}`, { cache: "no-store" })
            .then(async (next) => (next.ok ? writeCached(nextKey, await next.json()) : undefined))
            .catch(() => undefined);
        }
      }
      if (body.refreshing) {
        window.setTimeout(() => {
          if (requestController.current === null) setPollTick((tick) => tick + 1);
        }, REFRESH_POLL_MS);
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load ACS products");
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(false);
      }
    }
  }, [availability, brandType, cacheScope, page, pageSize, query, refreshKey, type]);

  const loadSummary = React.useCallback(async () => {
    const cacheKey = `${cacheScope}:${refreshKey ?? "draft"}:summary`;
    const cached = readCached<SizingResolutionSummary>(cacheKey);
    if (cached) setSummary(cached);
    try {
      const result = await fetch("/api/store-connection/sizing/resolution-summary", {
        cache: "no-store",
      });
      const body = await result.json() as SizingResolutionSummary & { error?: string };
      if (!result.ok) throw new Error(body.error ?? "Could not load sizing totals");
      setSummary(body);
      writeCached(cacheKey, body);
      if (body.refreshing) {
        window.setTimeout(() => setSummaryPollTick((tick) => tick + 1), REFRESH_POLL_MS);
      }
    } catch {
      if (!cached) setSummary(null);
    }
  }, [cacheScope, refreshKey]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      requestController.current?.abort();
    };
  }, [load, pollTick]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadSummary(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary, summaryPollTick]);

  const updating = Boolean(response?.refreshing || summary?.refreshing);

  const maxPage = Math.max(1, Math.ceil((response?.total ?? 0) / pageSize));
  const previewMode = response?.source === "preview";
  const cards = [
    { label: "Catalog products", value: summary?.total ?? "—", icon: Layers3 },
    {
      label: "Catalog variants",
      value: previewMode ? (summary?.variantCount ?? "—") : (response?.counts.variant ?? "—"),
      icon: Box,
    },
    { label: "Ready for sizing", value: summary?.matched ?? "—", icon: CheckCircle2 },
    { label: "Exact charts used", value: summary?.chartCount ?? "—", icon: ShieldCheck },
    { label: "Unresolved", value: summary?.unresolved ?? "—", icon: Tag },
  ];
  const mirrorCounts = previewMode
    ? [
        `Generated rows on page: ${(response?.counts.primary ?? 0) + (response?.counts.variant ?? 0)}`,
        `Primary: ${response?.counts.primary ?? 0}`,
        `Variants: ${response?.counts.variant ?? 0}`,
        `In stock: ${response?.counts.inStock ?? 0}`,
        `Out of stock: ${response?.counts.outOfStock ?? 0}`,
      ]
    : [
        `ACS records: ${(response?.counts.primary ?? 0) + (response?.counts.variant ?? 0)}`,
        `Primary: ${response?.counts.primary ?? 0}`,
        `Variants: ${response?.counts.variant ?? 0}`,
        `In stock: ${response?.counts.inStock ?? 0}`,
        `Out of stock: ${response?.counts.outOfStock ?? 0}`,
      ];

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {previewMode && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
            Preview mode — these are the exact PRIMARY and VARIANT records that will be sent to ACS; nothing on this screen requires a prior publish.
          </div>
        )}
        <div className="grid gap-3 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Icon className="h-4 w-4 text-violet-600" /> {label}
              </div>
              <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-200 bg-slate-50/70 px-4 pb-4 text-xs font-semibold text-slate-500">
          {mirrorCounts.map((count) => <span key={count}>{count}</span>)}
          {(summary?.unavailable ?? 0) > 0 && (
            <span className="text-amber-700" title="Scanned products the store no longer returns. They are not published.">
              No longer in store: {summary!.unavailable!.toLocaleString()}
            </span>
          )}
          {(summary?.withoutImage ?? 0) > 0 && (
            <span className="text-amber-700" title="Products with no image cannot be shown to shoppers, so they are left out of the setup and never published.">
              No image (not published): {summary!.withoutImage!.toLocaleString()}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 font-medium text-slate-400">
            {updating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-violet-600" />
                <span className="text-violet-700">Updating to the latest data…</span>
              </>
            ) : response?.builtAt ? (
              <span title={previewMode ? "When these records were generated" : "When ACS was last read"}>
                As of {new Date(response.builtAt).toLocaleTimeString()}
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
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
              placeholder="Search ACS ID, title, SKU, brand, category or sizing leaf"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-violet-400"
            />
          </form>
          <div className="flex flex-wrap gap-2">
            {(["all", "global", "private", "none"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setPage(1); setBrandType(value); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  brandType === value ? "bg-pink-500 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {value === "all"
                  ? "All brands"
                  : value === "none"
                    ? "Null / no brand"
                    : value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
            {(["all", "PRIMARY", "VARIANT"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setPage(1); setType(value); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  type === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {value === "all" ? "All types" : value === "PRIMARY" ? "Primary" : "Variants"}
              </button>
            ))}
            {(["all", "IN_STOCK", "OUT_OF_STOCK"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setPage(1); setAvailability(value); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  availability === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {value === "all" ? "All stock" : value === "IN_STOCK" ? "In stock" : "Out of stock"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className={`overflow-x-auto transition-opacity ${loading && response && !showingRequested ? "opacity-60" : ""}`} aria-busy={loading}>
          <table className="w-full min-w-[1480px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {["ACS product", "Type", "Parent", "SKU", "Brand", "Persona path", "Size", "Availability", "Sizing payload", ""].map((label) => (
                  <th key={label} className="px-4 py-3 font-bold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !response ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Reading ACS catalog…</td></tr>
              ) : response?.rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-slate-500">No ACS records match this view.</td></tr>
              ) : response?.rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-violet-50/30">
                  <td className="px-4 py-3">
                    <div className="flex min-w-[240px] gap-3">
                      {row.imageUrl ? (
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <Image
                            src={row.imageUrl}
                            alt={row.title}
                            fill
                            sizes="40px"
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                      ) : <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />}
                      <div>
                        <p className="font-semibold text-slate-900">{row.title}</p>
                        <p className="max-w-[260px] truncate font-mono text-[9px] text-slate-400" title={row.id}>{row.id}</p>
                        <p className="text-slate-400">{money(row)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      row.type === "PRIMARY" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"
                    }`}>{row.type}</span>
                  </td>
                  <td className="max-w-[180px] px-4 py-3 font-mono text-[10px] text-slate-500" title={row.primaryProductId ?? undefined}>
                    {row.type === "PRIMARY" ? "Self" : shortId(row.primaryProductId)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-700">{row.sku ?? "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-700">{row.brand ?? "No brand"}</p>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                      {row.brandType === "none" ? "Null / no brand" : row.brandType}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-slate-600">
                    {(() => {
                      const path = personaPathOf(row.categories);
                      if (!path) return row.categories.at(-1) ?? "—";
                      return (
                        <>
                          <p className="font-semibold text-slate-700">{path.label}</p>
                          <p className="truncate font-mono text-[10px] text-slate-400" title={path.raw}>{path.raw}</p>
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-violet-700">{row.sizes.join(", ") || row.fitSizeLabels.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${
                      row.availability === "IN_STOCK"
                        ? "bg-emerald-50 text-emerald-700"
                        : row.availability === "OUT_OF_STOCK"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-amber-50 text-amber-700"
                    }`}>{row.availability.replaceAll("_", " ")}</span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <p className="font-semibold text-slate-700">{row.fitChartVariant ?? "No sizing chart"}</p>
                    <p className="font-mono text-[10px] text-slate-400">{row.fitLeaf ?? "—"}</p>
                    <p className="text-[10px] text-slate-400">{row.fitRows.length} exact row{row.fitRows.length === 1 ? "" : "s"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={row.fitRows.length === 0}
                      onClick={() => setPreview(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-violet-700 disabled:opacity-30"
                    >
                      <Eye className="h-3.5 w-3.5" /> Sizing
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span>
            <strong>{(response?.total ?? 0).toLocaleString()}</strong>{" "}
            {previewMode ? "generated ACS records" : "ACS records"} · page {page} of {maxPage}
            {previewMode && response ? ` · ${response.rows.length} rows shown` : ""}
            {loading && !showingRequested ? ` · loading page ${page}…` : ""}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 font-semibold text-slate-500">
              Products per page
              <select
                value={pageSize}
                onChange={(event) => {
                  setPage(1);
                  setPageSize(Number(event.target.value) as (typeof STAGE_FIVE_PAGE_SIZES)[number]);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400"
              >
                {STAGE_FIVE_PAGE_SIZES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
            <button type="button" disabled={page >= maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      {preview && <AcsSizingPayloadModal row={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
