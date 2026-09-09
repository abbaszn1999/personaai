import { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Store,
  History,
  Package,
  Bell,
  Check,
} from 'lucide-react';
import {
  MockProduct,
  FoundSizeChart,
  GapItem,
  PathChartAssignment,
  BrandResearchedCategoryChart,
} from '../types';
import {
  FOUND_SIZE_CHARTS,
  INITIAL_PATH_ASSIGNMENTS,
  BRAND_RESEARCHED_CATEGORY_CHARTS,
} from '../data/mockData';
import {
  SYNC_HISTORY_DATA,
  NEW_SYNC_PRODUCTS,
  NEW_SYNC_FOUND_SIZE_CHARTS,
  NEW_SYNC_GAP_ITEMS,
  SyncHistoryEntry,
} from '../data/syncData';
import { Stage4SizeChartResearch } from './Stage4SizeChartResearch';
import { Stage5ChartAssignment } from './Stage5ChartAssignment';
import { Stage6Confirmation } from './Stage6Confirmation';
import { JsonExtractorLoading } from './JsonExtractorLoading';
import { SizeChartModal } from './SizeChartModal';
import { GapFillModal } from './GapFillModal';

interface SyncViewProps {
  onGoToSetup: () => void;
  onViewSizeChart?: (chart: FoundSizeChart, item?: MockProduct) => void;
  onOpenGapModal?: (item: GapItem) => void;
}

type SyncBoardStage = 1 | 2 | 3;

interface SyncStepMeta {
  stage: SyncBoardStage;
  title: string;
  shortLabel: string;
  badge?: string;
}

const SYNC_STEPS: SyncStepMeta[] = [
  { stage: 1, title: 'Size Chart Research', shortLabel: 'Research', badge: 'AI' },
  { stage: 2, title: 'Chart Assignment', shortLabel: 'Assignment', badge: 'Rule' },
  { stage: 3, title: 'Active Overview', shortLabel: 'Active' },
];

export function SyncView({
  onGoToSetup,
  onViewSizeChart,
  onOpenGapModal,
}: SyncViewProps) {
  // Sync High-Level View
  const [inSyncBoard, setInSyncBoard] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'alarm' | 'history'>('alarm');
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<SyncHistoryEntry | null>(null);

  // Sync Board Stepper State (Matching Setup design)
  const [syncStage, setSyncStage] = useState<SyncBoardStage>(1);
  const [highestReachedSyncStage, setHighestReachedSyncStage] = useState<SyncBoardStage>(1);

  // Sync Datasets
  const [syncFoundCharts] = useState<FoundSizeChart[]>([
    ...FOUND_SIZE_CHARTS,
    ...NEW_SYNC_FOUND_SIZE_CHARTS,
  ]);
  const [syncGapItems, setSyncGapItems] = useState<GapItem[]>(NEW_SYNC_GAP_ITEMS);
  const [syncProducts] = useState<MockProduct[]>(NEW_SYNC_PRODUCTS);
  const [syncPathAssignments, setSyncPathAssignments] = useState<PathChartAssignment[]>(INITIAL_PATH_ASSIGNMENTS);
  const [syncBrandCharts] = useState<BrandResearchedCategoryChart[]>(BRAND_RESEARCHED_CATEGORY_CHARTS);

  // Stage Processing States
  const [syncSizeChartResearchDone, setSyncSizeChartResearchDone] = useState(true);
  const [syncJsonExtractionDone, setSyncJsonExtractionDone] = useState(false);

  // Modals inside SyncView
  const [activeSizeChartModal, setActiveSizeChartModal] = useState<FoundSizeChart | null>(null);
  const [activeItemContext, setActiveItemContext] = useState<MockProduct | null>(null);
  const [activeGapModalItem, setActiveGapModalItem] = useState<GapItem | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Launch Sync Flow from Alarm - Directly opens the Size Chart tab without any loading
  const handleLaunchSync = () => {
    setInSyncBoard(true);
    setSyncStage(1);
    setHighestReachedSyncStage(1);
    setSyncSizeChartResearchDone(true);
  };

  const handleSelectSyncStage = (stage: SyncBoardStage) => {
    if (stage <= highestReachedSyncStage) {
      setSyncStage(stage);
    }
  };

  const handleAdvanceStage = (nextStage: SyncBoardStage) => {
    setSyncStage(nextStage);
    if (nextStage > highestReachedSyncStage) {
      setHighestReachedSyncStage(nextStage);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAutoFillGaps = () => {
    setSyncGapItems((prev) =>
      prev.map((g) => ({
        ...g,
        status: 'complete',
      }))
    );
    showToast('All size templates filled with standardized metric measurements');
  };

  const handleViewSizeChart = (chart: FoundSizeChart, item?: MockProduct) => {
    setActiveSizeChartModal(chart);
    setActiveItemContext(item || null);
    if (onViewSizeChart) {
      onViewSizeChart(chart, item);
    }
  };

  const handleOpenGapModal = (item: GapItem) => {
    setActiveGapModalItem(item);
    if (onOpenGapModal) {
      onOpenGapModal(item);
    }
  };

  const handleFillGapById = (gapId: string) => {
    const item = syncGapItems.find((g) => g.id === gapId);
    if (item) {
      handleOpenGapModal(item);
    }
  };

  const handleSaveGapItem = (updatedItem: GapItem) => {
    setSyncGapItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    setActiveGapModalItem(null);
    showToast(`Saved measurements for ${updatedItem.title}`);
  };

  const handleUpdateSyncPathAssignment = (id: string, variantId: string, variantName: string) => {
    setSyncPathAssignments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, assignedVariantId: variantId, assignedVariantName: variantName, isAutoMatched: false } : a
      )
    );
    showToast(`Updated chart assignment rule for category path`);
  };

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
      {/* ALARM & HISTORY SCREEN (BEFORE SYNC LAUNCH - SYNC DASHBOARD)              */}
      {/* ========================================================================= */}
      {!inSyncBoard && (
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
                    Real-time delta engine for Nordic Outfitters (Shopify)
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
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-700 font-extrabold">
                    48 New
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
                    {SYNC_HISTORY_DATA.length} Runs
                  </span>
                </button>
              </div>
            </div>

            {/* VIEW 1: ALARM & PENDING QUEUE */}
            {activeHistoryTab === 'alarm' && (
              <div className="space-y-6">
                {/* VIBRANT ALARM BANNER */}
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-purple-500/5 to-pink-500/10 rounded-3xl p-6 sm:p-8 border-2 border-amber-400/60 shadow-md">
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-400/20 rounded-full blur-2xl pointer-events-none"></div>

                  <div className="relative z-10 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs shadow-2xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                        <span>Catalog Delta Alarm Detected</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white/80 px-3 py-1 rounded-full border border-slate-200">
                        <Store className="w-3.5 h-3.5 text-purple-600" />
                        <span>Shopify Webhook Ingested · 14 mins ago</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <span>48 New Catalog Items Awaiting Size Sync</span>
                      </h2>
                      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                        New products and size variants have been detected in your connected Shopify store. The column mapping from your initial setup will be reused automatically. Run the sync engine to classify new brand profiles and research sizing measurements.
                      </p>
                    </div>

                    {/* Summary Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
                        <div className="flex items-center justify-between text-emerald-800 text-xs font-bold mb-1">
                          <span>⚡ Cached Size Models</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-900">32 SKUs</div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Nike, Adidas, Carhartt WIP, Moustache Store (Instant 0s application)
                        </p>
                      </div>

                      <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-purple-200/90 shadow-2xs">
                        <div className="flex items-center justify-between text-purple-800 text-xs font-bold mb-1">
                          <span>🔍 New Global Brands</span>
                          <Sparkles className="w-4 h-4 text-pink-500" />
                        </div>
                        <div className="text-2xl font-black text-slate-900">10 SKUs</div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Salomon &amp; Arc’teryx (Automated AI manufacturer web research)
                        </p>
                      </div>

                      <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-amber-200/90 shadow-2xs">
                        <div className="flex items-center justify-between text-amber-800 text-xs font-bold mb-1">
                          <span>⚠️ Category Gap Fill</span>
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="text-2xl font-black text-slate-900">6 SKUs</div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Nordic Knitwear Lab &amp; Unbranded Headwear (Quick template input)
                        </p>
                      </div>
                    </div>

                    {/* ACTION TRIGGER BUTTON */}
                    <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={handleLaunchSync}
                        className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg shadow-purple-500/25 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                      >
                        <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                        <span>Sync 48 Items Now</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveHistoryTab('history')}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        <span>View Past Sync Runs</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* INGESTED DELTA PRODUCTS PREVIEW CARD */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Package className="w-4 h-4 text-purple-600" />
                        <span>Delta Batch Ingestion Preview</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Sample products waiting in the Shopify webhook queue
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      <span>Store Mapping: <strong>Auto-Inherited</strong> (10/10 mapped)</span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {syncProducts.map((p) => (
                      <div key={p.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <img
                            src={p.imageUrl}
                            alt={p.title}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 truncate">{p.title}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.brandType === 'global'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : p.brandType === 'private'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {p.brand}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              <span>SKU: {p.sku}</span> · <span>{p.category}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0 text-right">
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">{p.price}</span>
                            <span className="text-[10px] text-emerald-600 font-semibold">Ready for Delta Sync</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: SYNC HISTORY LOG */}
            {activeHistoryTab === 'history' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <History className="w-4 h-4 text-purple-600" />
                        <span>Execution History &amp; Audit Trail</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Immutable record of all background sync jobs and calibration runs
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>99.9% Sync Accuracy</span>
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {SYNC_HISTORY_DATA.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-5 hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedHistoryEntry(entry)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                {entry.triggerType}
                              </span>
                              <span className="text-xs font-bold text-slate-900">{entry.timestamp}</span>
                              <span className="text-xs text-slate-400">({entry.relativeTime})</span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-1 max-w-2xl">{entry.notes}</p>
                          </div>

                          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
                            <div className="text-left sm:text-right">
                              <span className="text-xs font-bold text-slate-900 block">{entry.itemsCount} SKUs</span>
                              <span className="text-[10px] text-slate-500">Calibrated in {entry.durationSec}s</span>
                            </div>

                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>{entry.status}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* SYNC BOARD WITH EXACT SETUP DESIGN CLONED ACROSS ALL STAGES              */}
      {/* ========================================================================= */}
      {inSyncBoard && (
        <div className="flex-1 flex flex-col w-full min-w-0">
          {/* EXACT SETUP-STYLE FULL-WIDTH STEPPER TABS BAR */}
          <div className="w-full bg-white border-b border-slate-200/80 shadow-2xs">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
              <nav aria-label="Sync Progress">
                <ol className="flex items-center justify-between w-full gap-2">
                  {SYNC_STEPS.map((step, idx) => {
                    const isCompleted = syncStage > step.stage;
                    const isCurrent有效 = syncStage === step.stage;
                    const isAccessible = step.stage <= highestReachedSyncStage;

                    return (
                      <li key={step.stage} className="flex-1 flex items-center">
                        <div className="flex items-center w-full">
                          <button
                            type="button"
                            disabled={!isAccessible}
                            onClick={() => isAccessible && handleSelectSyncStage(step.stage)}
                            className={`group flex items-center gap-2.5 text-left w-full transition-all duration-200 rounded-lg p-1.5 ${
                              isAccessible ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'
                            }`}
                          >
                            {/* Step Circle Indicator */}
                            <div
                              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                                isCompleted
                                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                                  : isCurrent有效
                                  ? 'bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-purple-500/25 ring-3 ring-purple-100 ring-offset-1 scale-105'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200 group-hover:border-slate-300'
                              }`}
                            >
                              {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : step.stage}
                            </div>

                            {/* Text Label */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-semibold truncate transition-colors ${
                                    isCurrent有效
                                      ? 'text-purple-950 font-bold'
                                      : isCompleted
                                      ? 'text-slate-800'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  <span className="hidden xl:inline">{step.title}</span>
                                  <span className="xl:hidden">{step.shortLabel}</span>
                                </span>

                                {step.badge && (
                                  <span className="hidden lg:inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100/80 text-purple-700 uppercase tracking-wider">
                                    {step.badge}
                                  </span>
                                )}
                              </div>

                              <span className="hidden md:block text-[10px] text-slate-600 truncate">
                                {isCompleted ? 'Completed' : isCurrent有效 ? 'Active Stage' : `Step ${step.stage}`}
                              </span>
                            </div>
                          </button>

                          {/* Step Divider Arrow */}
                          {idx < SYNC_STEPS.length - 1 && (
                            <div className="hidden sm:flex items-center justify-center px-1 text-slate-300">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>
          </div>

          {/* Sync Delta Notification Sub-Header */}
          <div className="w-full bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-pink-500/10 border-b border-amber-200/80 px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-amber-900 bg-amber-100/90 border border-amber-300/80 px-2.5 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                Shopify Delta Ingestion
              </span>
              <span className="text-slate-600 font-medium">
                <strong>48 New SKUs</strong> · Auto-inherited Store Field Mappings
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInSyncBoard(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>Back to Sync Dashboard</span>
              </button>
            </div>
          </div>

          {/* Main Stage Content Cloned Directly from Setup Stages */}
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
            <div className="w-full">
              {/* STAGE 1: SIZE CHART RESEARCH */}
              {syncStage === 1 && (
                <Stage4SizeChartResearch
                  foundCharts={syncFoundCharts}
                  gapItems={syncGapItems}
                  isCompleted={true}
                  onSetCompleted={setSyncSizeChartResearchDone}
                  onViewChart={handleViewSizeChart}
                  onFillGap={handleFillGapById}
                  onPrev={() => setInSyncBoard(false)}
                  onNext={() => handleAdvanceStage(2)}
                  stageLabel="Sync Stage 1 of 3"
                  stepLabel="Size Chart Research & Verification"
                  isSyncFlow={true}
                />
              )}

              {/* STAGE 2: CHART ASSIGNMENT */}
              {syncStage === 2 && (
                <Stage5ChartAssignment
                  pathAssignments={syncPathAssignments}
                  brandCharts={syncBrandCharts}
                  products={syncProducts}
                  onUpdatePathAssignment={handleUpdateSyncPathAssignment}
                  onPrev={() => handleAdvanceStage(1)}
                  onNext={() => handleAdvanceStage(3)}
                />
              )}

              {/* STAGE 3: ACTIVE OVERVIEW & JSON EXTRACTION */}
              {syncStage === 3 && (
                !syncJsonExtractionDone ? (
                  <JsonExtractorLoading
                    onComplete={() => setSyncJsonExtractionDone(true)}
                    onCancel={() => handleSelectSyncStage(2)}
                  />
                ) : (
                  <Stage6Confirmation
                    products={syncProducts}
                    foundCharts={syncFoundCharts}
                    gapItems={syncGapItems}
                    onViewChart={handleViewSizeChart}
                    onPrev={() => handleAdvanceStage(2)}
                    onReset={() => setInSyncBoard(false)}
                    onRerunExtraction={() => setSyncJsonExtractionDone(false)}
                    stageLabel="Sync Stage 3 of 3 · Active Delta Catalog"
                  />
                )
              )}
            </div>
          </main>
        </div>
      )}

      {/* History Detail Drawer / Modal */}
      {selectedHistoryEntry && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
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
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Trigger Type</span>
                <span className="font-bold text-slate-900">{selectedHistoryEntry.triggerType}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Executed At</span>
                <span className="font-bold text-slate-900">{selectedHistoryEntry.timestamp}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">SKUs Processed</span>
                <span className="font-bold text-purple-700">{selectedHistoryEntry.itemsCount} SKUs</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Execution Time</span>
                <span className="font-bold text-slate-900">{selectedHistoryEntry.durationSec} seconds</span>
              </div>
              <div className="py-1.5">
                <span className="text-slate-500 block mb-1">Execution Summary</span>
                <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed font-medium">
                  {selectedHistoryEntry.notes}
                </p>
              </div>
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

      {/* Internal Modals for Sync View */}
      <SizeChartModal
        chart={activeSizeChartModal}
        item={activeItemContext}
        isOpen={!!activeSizeChartModal}
        onClose={() => setActiveSizeChartModal(null)}
      />

      <GapFillModal
        item={activeGapModalItem}
        isOpen={!!activeGapModalItem}
        onClose={() => setActiveGapModalItem(null)}
        onSave={handleSaveGapItem}
      />
    </div>
  );
}
