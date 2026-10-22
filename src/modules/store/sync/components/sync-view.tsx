"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Store,
  History,
  Package,
  Bell,
  Check,
  Loader2,
  Search,
  ImageOff,
} from 'lucide-react';
import { useStoreConnectionStore } from '@/modules/store/store';
import { SYNC_CANCELLED_MESSAGE } from '@/lib/sync/constants';
import {
  syncApi,
  type PendingProductState,
  type PendingProductView,
  type SyncHistoryView,
  type SyncRunResponse,
  type SyncSummary,
} from '../sync-api';
import { SyncBoard } from './sync-board';

interface SyncViewProps {
  onGoToSetup: () => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  wordpress: 'WordPress',
  custom: 'Store',
};

const SOURCE_LABELS: Record<string, string> = {
  webhook: 'Webhook',
  reconcile: 'Hourly check',
  manual: 'Manual check',
};

const STATE_LABELS: Record<PendingProductState, { label: string; className: string }> = {
  ready: { label: 'Ready for Delta Sync', className: 'text-emerald-600' },
  new_brand: { label: 'New brand · classified on sync', className: 'text-purple-600' },
  needs_chart: { label: 'Needs a size chart', className: 'text-amber-600' },
  no_chart_needed: { label: 'No size chart needed', className: 'text-slate-500' },
};

const HISTORY_STATUS: Record<SyncHistoryView['status'], { label: string; className: string }> = {
  complete: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'In progress', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** Refreshes the queue while the dashboard is open, so webhook arrivals show without a reload. */
const SUMMARY_POLL_MS = 60_000;

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

function triggerLabel(entry: SyncHistoryView): string {
  if (entry.kind === 'setup') return 'Store Setup';
  return 'Delta Sync';
}

function sourcesLabel(entry: SyncHistoryView): string {
  const parts = Object.entries(entry.sources)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([source, count]) => `${SOURCE_LABELS[source] ?? source} (${count})`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

/**
 * The Sync tab: products added to the store since Setup published, held here until the merchant
 * syncs them, and the record of every sync. "Sync items now" opens the two-step board, which is
 * Setup's Stage 4 and Stage 5 over only those products. See `./sync-board`.
 */
export function SyncView({ onGoToSetup }: SyncViewProps) {
  const connection = useStoreConnectionStore((s) => s.connection);
  const [inSyncBoard, setInSyncBoard] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'alarm' | 'history'>('alarm');
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<SyncHistoryView | null>(null);

  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [liveRun, setLiveRun] = useState<SyncRunResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<PendingProductView[]>([]);
  const [history, setHistory] = useState<SyncHistoryView[]>([]);
  const [busy, setBusy] = useState<'start' | 'check' | 'more' | 'history' | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextSummary, nextRun] = await Promise.all([syncApi.summary(), syncApi.run()]);
      setSummary(nextSummary);
      setProducts(nextSummary.pending.products);
      setHistory(nextSummary.history.entries);
      setLiveRun(nextRun);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the sync queue.');
    }
  }, []);

  useEffect(() => {
    if (inSyncBoard) return;
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), SUMMARY_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [inSyncBoard, refresh]);

  const run = liveRun?.run ?? null;
  const runLive = run !== null && (run.status === 'pending' || run.status === 'running' || run.status === 'blocked');
  const runStopped = run !== null && run.status === 'failed' && run.error !== SYNC_CANCELLED_MESSAGE;
  const pending = summary?.pending;
  const pendingTotal = pending?.total ?? 0;
  const platform = PLATFORM_LABELS[connection?.platform ?? 'custom'] ?? 'Store';

  const handleLaunchSync = async () => {
    if (runLive || runStopped) {
      setInSyncBoard(true);
      return;
    }
    setBusy('start');
    try {
      await syncApi.start();
      setInSyncBoard(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not start the sync.');
      void refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleCheck = async () => {
    setBusy('check');
    try {
      const result = await syncApi.check();
      showToast(
        result.found > 0
          ? `Found ${plural(result.found, 'new product')}.`
          : `No new products — checked ${plural(result.checked, 'product')}.`,
      );
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not check the store.');
    } finally {
      setBusy(null);
    }
  };

  const loadMoreProducts = async () => {
    setBusy('more');
    try {
      const next = await syncApi.summary(products.length);
      setProducts((current) => [...current, ...next.pending.products]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load more products.');
    } finally {
      setBusy(null);
    }
  };

  const loadMoreHistory = async () => {
    setBusy('history');
    try {
      const next = await syncApi.summary(0, history.filter((entry) => entry.kind === 'sync').length);
      setHistory((current) => [...current, ...next.history.entries]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load older runs.');
    } finally {
      setBusy(null);
    }
  };

  const exitBoard = () => {
    setInSyncBoard(false);
    void refresh();
  };

  const counts = pending?.counts;
  const newBrandNames = pending?.newBrandNames ?? [];
  const runProductCount = liveRun?.products?.total ?? 0;
  const historyTotal = summary?.history.total ?? 0;
  const coverage = summary?.history.chartCoveragePercent ?? null;

  return (
    <div className="flex-1 flex flex-col w-full min-w-0 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SYNC BOARD: Setup's Stage 4 + Stage 5 over the sync's products. Rendered  */}
      {/* on the Store's own surface so it looks exactly like Setup.                */}
      {/* ========================================================================= */}
      {inSyncBoard && <SyncBoard onExit={exitBoard} notify={showToast} />}

      {/* ========================================================================= */}
      {/* ALARM & HISTORY SCREEN (SYNC DASHBOARD)                                    */}
      {/* ========================================================================= */}
      {!inSyncBoard && (
        <div className="sync-brand flex min-h-[calc(100vh-200px)] w-full flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-slate-50 font-sans text-slate-900 selection:bg-purple-200 selection:text-purple-900">
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="w-full space-y-6">
            {/* Header Card with Segmented Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-100/80 border border-purple-200 flex items-center justify-center text-purple-700 font-bold flex-shrink-0">
                  <RefreshCw className="w-5 h-5 text-purple-700 animate-spin-slow" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    Continuous Catalog &amp; Size Sync
                  </h1>
                  <p className="text-xs text-slate-500">
                    Real-time delta engine for {connection?.storeName || 'your store'} ({platform})
                  </p>
                </div>
              </div>

              {/* Segmented Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveHistoryTab('alarm')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeHistoryTab === 'alarm'
                      ? 'bg-white text-purple-950 shadow-2xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>Sync Queue</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    pendingTotal > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {pendingTotal.toLocaleString()} New
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveHistoryTab('history')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeHistoryTab === 'history'
                      ? 'bg-white text-purple-950 shadow-2xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-purple-600" />
                  <span>Sync History</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-700 font-bold">
                    {historyTotal.toLocaleString()} Runs
                  </span>
                </button>
              </div>
            </div>

            {loadError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {loadError}
              </div>
            )}

            {!summary && !loadError && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading the sync queue…
              </div>
            )}

            {/* VIEW 1: ALARM & PENDING QUEUE */}
            {summary && activeHistoryTab === 'alarm' && (
              <div className="space-y-6">
                {!summary.trackingActive ? (
                  <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3">
                    <h2 className="text-xl font-extrabold text-slate-900">Publish your catalog from Setup first</h2>
                    <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                      Sync tracks products added after your first Setup publish. Until then, every product goes out with Setup&apos;s own publish.
                    </p>
                    <button
                      type="button"
                      onClick={onGoToSetup}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 cursor-pointer"
                    >
                      <span>Go to Setup</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : runLive || runStopped ? (
                  <div className="relative overflow-hidden bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-pink-500/10 rounded-3xl p-6 sm:p-8 border-2 border-purple-300/70 shadow-md space-y-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-xs shadow-2xs border ${
                      runStopped ? 'bg-rose-100 text-rose-900 border-rose-300' : 'bg-purple-100 text-purple-900 border-purple-300'
                    }`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${runStopped ? 'bg-rose-500' : 'bg-purple-500 animate-ping'}`}></span>
                      <span>{runStopped ? 'Sync stopped' : 'Sync in progress'}</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {runStopped
                        ? `A sync of ${plural(runProductCount, 'product')} stopped before publishing`
                        : `Syncing ${plural(runProductCount, 'new product')}`}
                    </h2>
                    <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                      {runStopped
                        ? 'Open it to retry from where it stopped, or cancel it to put its products back in the queue.'
                        : 'Open the sync to review its size charts and publish. Products detected meanwhile wait for the next sync.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleLaunchSync()}
                      className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/25 transition-all cursor-pointer"
                    >
                      <span>{runStopped ? 'Open stopped sync' : 'Resume sync'}</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                ) : pendingTotal === 0 ? (
                  <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-200 shadow-2xs space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Catalog in sync</span>
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">No new products waiting</h2>
                    <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                      New products in your selected categories appear here as {platform} reports them, and from the hourly store check.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <CheckButton busy={busy === 'check'} disabled={busy !== null} onClick={() => void handleCheck()} />
                      <HistoryButton onClick={() => setActiveHistoryTab('history')} />
                    </div>
                  </div>
                ) : (
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-pink-500/10 rounded-3xl p-6 sm:p-8 border-2 border-amber-400/60 shadow-md">
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-400/20 rounded-full blur-2xl pointer-events-none"></div>

                  <div className="relative z-10 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs shadow-2xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                        <span>Catalog Delta Alarm Detected</span>
                      </div>

                      {pending?.lastDetectedAt && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white/80 px-3 py-1 rounded-full border border-slate-200">
                          <Store className="w-3.5 h-3.5 text-purple-600" />
                          <span>
                            Last found by {SOURCE_LABELS[pending.lastSource ?? ''] ?? 'store check'} · {relativeTime(pending.lastDetectedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <span>{pendingTotal.toLocaleString()} New Catalog Item{pendingTotal === 1 ? '' : 's'} Awaiting Size Sync</span>
                      </h2>
                      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                        New products have been detected in your connected {platform} store. They are held here, untouched, until you sync them. The column mapping, Persona map and size settings from your setup are reused automatically; the sync classifies only brands your store has never had.
                      </p>
                    </div>

                    {/* Summary Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
                        <div className="flex items-center justify-between text-emerald-800 text-xs font-bold mb-1">
                          <span>⚡ Cached Size Models</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-900">{(counts?.ready ?? 0).toLocaleString()} SKUs</div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Known brands with a saved chart (applied instantly)
                          {(counts?.no_chart_needed ?? 0) > 0 && ` · ${plural(counts!.no_chart_needed, 'product')} need no chart`}
                        </p>
                      </div>

                      <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-purple-200/90 shadow-2xs">
                        <div className="flex items-center justify-between text-purple-800 text-xs font-bold mb-1">
                          <span>🔍 New Brands</span>
                          <Sparkles className="w-4 h-4 text-pink-500" />
                        </div>
                        <div className="text-2xl font-black text-slate-900">{(counts?.new_brand ?? 0).toLocaleString()} SKUs</div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {newBrandNames.length > 0
                            ? `${newBrandNames.join(', ')} (AI-classified on sync)`
                            : 'No brands your store has not had before'}
                        </p>
                      </div>

                      <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-amber-200/90 shadow-2xs">
                        <div className="flex items-center justify-between text-amber-800 text-xs font-bold mb-1">
                          <span>⚠️ Category Gap Fill</span>
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-900">{(counts?.needs_chart ?? 0).toLocaleString()} SKUs</div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Known brands with no chart for the subcategory yet (fill in step 1)
                        </p>
                      </div>
                    </div>

                    {/* ACTION TRIGGER BUTTON */}
                    <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleLaunchSync()}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/25 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy === 'start'
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />}
                        <span>Sync {pendingTotal.toLocaleString()} Item{pendingTotal === 1 ? '' : 's'} Now</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </button>

                      <CheckButton busy={busy === 'check'} disabled={busy !== null} onClick={() => void handleCheck()} />
                      <HistoryButton onClick={() => setActiveHistoryTab('history')} />
                    </div>
                  </div>
                </div>
                )}

                {/* INGESTED DELTA PRODUCTS PREVIEW CARD */}
                {summary.trackingActive && products.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Package className="w-4 h-4 text-purple-600" />
                        <span>Delta Batch Ingestion Preview</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Products waiting for the next sync, newest first
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      <span>Store Mapping: <strong>Auto-Inherited</strong> from Setup</span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {products.map((p) => (
                      <div key={p.externalId} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.title}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0">
                              <ImageOff className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 truncate">{p.title}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                                p.brandType === 'global'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : p.brandType === 'private'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : p.brandType === 'new'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {p.brandLabel || 'No brand'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              <span>SKU: {p.sku || '—'}</span>
                              {p.sizingCategory && <> · <span>{p.sizingCategory}</span></>}
                              {' · '}<span>{SOURCE_LABELS[p.source] ?? p.source} · {relativeTime(p.detectedAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0 text-right">
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">{p.price ?? '—'}</span>
                            <span className={`text-[10px] font-semibold ${STATE_LABELS[p.state].className}`}>
                              {STATE_LABELS[p.state].label}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {products.length < pendingTotal && (
                    <div className="p-3 border-t border-slate-100 text-center">
                      <button
                        type="button"
                        onClick={() => void loadMoreProducts()}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer disabled:opacity-60"
                      >
                        {busy === 'more' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Show more ({(pendingTotal - products.length).toLocaleString()} more)
                      </button>
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

            {/* VIEW 2: SYNC HISTORY LOG */}
            {summary && activeHistoryTab === 'history' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <History className="w-4 h-4 text-purple-600" />
                        <span>Execution History &amp; Audit Trail</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Every sync of new products, and the Setup publish they build on
                      </p>
                    </div>

                    {coverage !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{coverage}% Size Chart Coverage</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {history.length === 0 && (
                    <p className="p-8 text-center text-xs text-slate-500">No syncs yet.</p>
                  )}

                  <div className="divide-y divide-slate-100">
                    {history.map((entry) => {
                      const status = HISTORY_STATUS[entry.status];
                      return (
                      <div
                        key={`${entry.kind}:${entry.id}`}
                        className="p-5 hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedHistoryEntry(entry)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                {triggerLabel(entry)}
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {new Date(entry.publishedAt ?? entry.startedAt).toLocaleString()}
                              </span>
                              <span className="text-xs text-slate-400">({relativeTime(entry.publishedAt ?? entry.startedAt)})</span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-1 max-w-2xl">{entry.note}</p>
                          </div>

                          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
                            <div className="text-left sm:text-right">
                              <span className="text-xs font-bold text-slate-900 block">{entry.productCount.toLocaleString()} SKUs</span>
                              {entry.durationSec !== null && (
                                <span className="text-[10px] text-slate-500">Calibrated in {entry.durationSec.toLocaleString()}s</span>
                              )}
                            </div>

                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${status.className}`}>
                              {entry.status === 'complete' && <Check className="w-3 h-3 stroke-[3]" />}
                              <span>{status.label}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  {history.filter((entry) => entry.kind === 'sync').length + (history.some((entry) => entry.kind === 'setup') ? 1 : 0) < historyTotal && (
                    <div className="p-3 border-t border-slate-100 text-center">
                      <button
                        type="button"
                        onClick={() => void loadMoreHistory()}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer disabled:opacity-60"
                      >
                        {busy === 'history' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Show older runs
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
        </div>
      )}

      {/* History Detail Drawer / Modal */}
      {selectedHistoryEntry && (
        <div className="sync-brand fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm">Sync Run Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryEntry(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <DetailRow label="Trigger Type" value={triggerLabel(selectedHistoryEntry)} />
              {selectedHistoryEntry.kind === 'sync' && (
                <DetailRow label="Detected By" value={sourcesLabel(selectedHistoryEntry)} />
              )}
              <DetailRow label="Started At" value={new Date(selectedHistoryEntry.startedAt).toLocaleString()} />
              {selectedHistoryEntry.publishedAt && (
                <DetailRow label="Published At" value={new Date(selectedHistoryEntry.publishedAt).toLocaleString()} />
              )}
              <DetailRow label="SKUs Processed" value={`${selectedHistoryEntry.productCount.toLocaleString()} SKUs`} accent />
              {selectedHistoryEntry.kind === 'sync' && (
                <>
                  <DetailRow label="Published" value={selectedHistoryEntry.publishedCount.toLocaleString()} />
                  <DetailRow
                    label="Brands"
                    value={`${selectedHistoryEntry.newBrands.toLocaleString()} new · ${selectedHistoryEntry.knownBrands.toLocaleString()} known`}
                  />
                  <DetailRow
                    label="Size Charts"
                    value={`${selectedHistoryEntry.charts.matched.toLocaleString()} matched · ${selectedHistoryEntry.charts.unresolved.toLocaleString()} without chart · ${selectedHistoryEntry.charts.unsized.toLocaleString()} not sized`}
                  />
                </>
              )}
              {selectedHistoryEntry.durationSec !== null && (
                <DetailRow label="Execution Time" value={`${selectedHistoryEntry.durationSec.toLocaleString()} seconds`} />
              )}
              <DetailRow label="Status" value={HISTORY_STATUS[selectedHistoryEntry.status].label} />
              <div className="py-1.5">
                <span className="text-slate-500 block mb-1">Execution Summary</span>
                <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed font-medium">
                  {selectedHistoryEntry.note}
                </p>
              </div>
              {selectedHistoryEntry.sampleTitles.length > 0 && (
                <div className="py-1.5">
                  <span className="text-slate-500 block mb-1">Products</span>
                  <ul className="text-slate-700 space-y-0.5">
                    {selectedHistoryEntry.sampleTitles.map((title) => (
                      <li key={title} className="truncate">· {title}</li>
                    ))}
                    {selectedHistoryEntry.productCount > selectedHistoryEntry.sampleTitles.length && (
                      <li className="text-slate-400">
                        and {(selectedHistoryEntry.productCount - selectedHistoryEntry.sampleTitles.length).toLocaleString()} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHistoryEntry(null)}
                className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 cursor-pointer"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-right ${accent ? 'text-purple-700' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function CheckButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : <Search className="w-3.5 h-3.5 text-slate-500" />}
      <span>{busy ? 'Checking your store…' : 'Check for new products'}</span>
    </button>
  );
}

function HistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
    >
      <History className="w-3.5 h-3.5 text-slate-500" />
      <span>View Past Sync Runs</span>
    </button>
  );
}
