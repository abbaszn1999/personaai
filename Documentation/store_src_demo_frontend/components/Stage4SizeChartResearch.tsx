import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Eye,
  Edit3,
  ShieldCheck,
  Globe,
  FolderTree,
  Search,
  Filter,
  GitBranch,
} from 'lucide-react';
import {
  FoundSizeChart,
  GapItem,
  StoreSizingSystemConfig,
  SizingSystemOption,
  ParentCategoryType,
  BrandResearchedCategoryChart,
  MockProduct,
} from '../types';
import { normalizeToParentCategory } from '../utils/sizingStandards';
import { BRAND_RESEARCHED_CATEGORY_CHARTS } from '../data/mockData';

interface Stage4Props {
  foundCharts: FoundSizeChart[];
  gapItems: GapItem[];
  isCompleted: boolean;
  onSetCompleted: (completed: boolean) => void;
  onViewChart: (
    chart: FoundSizeChart,
    item?: MockProduct,
    initialCat?: ParentCategoryType,
    initialVariantId?: string
  ) => void;
  onFillGap: (gapId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  stageLabel?: string;
  stepLabel?: string;
  isSyncFlow?: boolean;
  sizingConfig?: StoreSizingSystemConfig;
  brandCharts?: BrandResearchedCategoryChart[];
}

const BRAND_SEARCH_STEPS = [
  'Searching Nike official size guides & fit archives…',
  'Searching Adidas international footwear & apparel charts…',
  'Searching Zara EU contemporary fit specifications…',
  'Searching Salomon & Arc’teryx delta outdoor fit matrices…',
  'Searching Stüssy streetwear sizing repositories…',
  'Searching Moustache Store, Urban Basics & private labels…',
  'Standardizing metric/imperial measurements across category paths…',
];

export function Stage4SizeChartResearch({
  foundCharts,
  gapItems,
  isCompleted,
  onSetCompleted,
  onViewChart,
  onFillGap,
  onPrev,
  onNext,
  stageLabel = 'Stage 4 of 5',
  stepLabel = 'Step 2 of 2 — Researching Size Charts',
  isSyncFlow,
  sizingConfig,
  brandCharts = BRAND_RESEARCHED_CATEGORY_CHARTS,
}: Stage4Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'found' | 'not_found' | 'no_brand'>('found');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'needs_action'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentBrandIndex, setCurrentBrandIndex] = useState(1);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);

  // Local state for found charts so user can interactively trigger research for un-enriched charts
  const [localFoundCharts, setLocalFoundCharts] = useState<FoundSizeChart[]>(foundCharts);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalFoundCharts(foundCharts);
  }, [foundCharts]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startResearch = () => {
    setIsRunning(true);
    setCurrentBrandIndex(1);
    setStatusMessageIndex(0);
    setProgressPercent(0);

    const totalDuration = 2400;
    const updateFreq = 50;
    const steps = totalDuration / updateFreq;
    let step = 0;

    intervalRef.current = setInterval(() => {
      step++;
      const pct = Math.min(100, Math.round((step / steps) * 100));
      setProgressPercent(pct);

      const brandNum = Math.min(50, Math.max(1, Math.round((pct / 100) * 50)));
      setCurrentBrandIndex(brandNum);

      // Change status step
      const msgIdx = Math.min(
        BRAND_SEARCH_STEPS.length - 1,
        Math.floor((pct / 100) * BRAND_SEARCH_STEPS.length)
      );
      setStatusMessageIndex(msgIdx);

      if (step >= steps) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsRunning(false);
        // Distinguish found templates vs not_found templates
        setLocalFoundCharts((prev) =>
          prev.map((c) => {
            if (c.templateStatus === 'not_found' || (c.rows && c.rows.length === 0)) {
              return {
                ...c,
                templateStatus: 'not_found' as const,
                isResearched: false,
                researchStatus: 'needs_research' as const,
                confidence: 0,
              };
            }
            return {
              ...c,
              templateStatus: 'found' as const,
              isResearched: true,
              researchStatus: 'done' as const,
              confidence: c.confidence > 0 ? c.confidence : 99.1,
              lastUpdated: c.lastUpdated.includes('Not enriched')
                ? 'Live Extracted from Official Brand Guide'
                : c.lastUpdated,
            };
          })
        );
        onSetCompleted(true);
      }
    }, updateFreq);
  };

  // Auto-run research loading when Stage 4 is opened if not yet completed
  useEffect(() => {
    if (!isCompleted && !isRunning) {
      startResearch();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Handler to generate size template for global brands where template was not found
  const handleGenerateTemplate = (chartId: string) => {
    setGeneratingIds((prev) => new Set(prev).add(chartId));

    setTimeout(() => {
      let newlyGeneratedChart: FoundSizeChart | null = null;
      setLocalFoundCharts((prev) => {
        return prev.map((c) => {
          if (c.id === chartId) {
            let headers = c.headers && c.headers.length > 0 ? c.headers : ['Size', 'Chest (cm)', 'Waist (cm)', 'Body Length (cm)'];
            let rows: Record<string, string>[] = [];

            if (c.categories.includes('Footwear')) {
              headers = ['US Size', 'UK Size', 'EUR Size', 'Foot Length (cm)'];
              rows = [
                { 'US Size': '8.0', 'UK Size': '7.5', 'EUR Size': '41.5', 'Foot Length (cm)': '26.0' },
                { 'US Size': '8.5', 'UK Size': '8.0', 'EUR Size': '42.0', 'Foot Length (cm)': '26.5' },
                { 'US Size': '9.0', 'UK Size': '8.5', 'EUR Size': '42.5', 'Foot Length (cm)': '27.0' },
                { 'US Size': '9.5', 'UK Size': '9.0', 'EUR Size': '43.0', 'Foot Length (cm)': '27.5' },
                { 'US Size': '10.0', 'UK Size': '9.5', 'EUR Size': '44.0', 'Foot Length (cm)': '28.0' },
                { 'US Size': '10.5', 'UK Size': '10.0', 'EUR Size': '44.5', 'Foot Length (cm)': '28.5' },
                { 'US Size': '11.0', 'UK Size': '10.5', 'EUR Size': '45.0', 'Foot Length (cm)': '29.0' },
                { 'US Size': '12.0', 'UK Size': '11.5', 'EUR Size': '46.5', 'Foot Length (cm)': '30.0' },
              ];
            } else if (c.categories.includes('Bottoms')) {
              headers = ['Waist Size', 'Waist (in)', 'Waist (cm)', 'Inseam (in)', 'Hip (cm)'];
              rows = [
                { 'Waist Size': '30', 'Waist (in)': '30.0–30.5', 'Waist (cm)': '76–78', 'Inseam (in)': '32', 'Hip (cm)': '92–95' },
                { 'Waist Size': '32', 'Waist (in)': '32.0–32.5', 'Waist (cm)': '81–83', 'Inseam (in)': '32', 'Hip (cm)': '97–100' },
                { 'Waist Size': '34', 'Waist (in)': '34.0–34.5', 'Waist (cm)': '86–88', 'Inseam (in)': '32', 'Hip (cm)': '102–105' },
                { 'Waist Size': '36', 'Waist (in)': '36.0–36.5', 'Waist (cm)': '91–93', 'Inseam (in)': '32', 'Hip (cm)': '107–110' },
              ];
            } else {
              headers = ['Size', 'Chest (cm)', 'Waist (cm)', 'Body Length (cm)', 'Shoulder (cm)'];
              rows = [
                { Size: 'S', 'Chest (cm)': '88–94', 'Waist (cm)': '74–79', 'Body Length (cm)': '69', 'Shoulder (cm)': '44' },
                { Size: 'M', 'Chest (cm)': '96–102', 'Waist (cm)': '81–86', 'Body Length (cm)': '71', 'Shoulder (cm)': '46' },
                { Size: 'L', 'Chest (cm)': '104–110', 'Waist (cm)': '89–94', 'Body Length (cm)': '73', 'Shoulder (cm)': '48' },
                { Size: 'XL', 'Chest (cm)': '112–118', 'Waist (cm)': '96–101', 'Body Length (cm)': '75', 'Shoulder (cm)': '50' },
                { Size: 'XXL', 'Chest (cm)': '120–126', 'Waist (cm)': '104–109', 'Body Length (cm)': '77', 'Shoulder (cm)': '52' },
              ];
            }

            newlyGeneratedChart = {
              ...c,
              templateStatus: 'found',
              isResearched: true,
              researchStatus: 'done',
              confidence: 98.7,
              lastUpdated: 'AI Generated Official Sizing Matrix',
              headers,
              rows,
            };
            return newlyGeneratedChart;
          }
          return c;
        });
      });

      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(chartId);
        return next;
      });

      // Immediately open the size chart popup modal so user can check and verify it!
      if (newlyGeneratedChart) {
        onViewChart(newlyGeneratedChart);
      }
    }, 850);
  };

  // Individual chart research handler to enrich a specific brand
  const handleEnrichChart = (chartId: string) => {
    setEnrichingIds((prev) => new Set(prev).add(chartId));

    setTimeout(() => {
      setLocalFoundCharts((prev) => {
        let updatedItem: FoundSizeChart | null = null;
        const nextCharts = prev.map((c) => {
          if (c.id === chartId) {
            updatedItem = {
              ...c,
              templateStatus: 'found',
              isResearched: true,
              researchStatus: 'done',
              confidence: 99.4,
              lastUpdated: `Live Extracted from ${c.brand}.com/size-guide`,
            };
            return updatedItem;
          }
          return c;
        });

        if (updatedItem) {
          onViewChart(updatedItem);
        }
        return nextCharts;
      });

      setEnrichingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(chartId);
        return nextSet;
      });
    }, 700);
  };

  // Split Gap items into Not Found Brands (Tab B) and No Brand Categories (Tab C)
  const notFoundBrands = gapItems.filter((item) => item.type === 'brand');
  const noBrandCategories = gapItems.filter((item) => item.type === 'category');

  // Filtered Found Charts
  const filteredFoundCharts = useMemo(() => {
    return localFoundCharts.filter((chart) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        chart.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chart.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase())) ||
        Boolean(chart.subCategories && chart.subCategories.some((sc) => sc.toLowerCase().includes(searchQuery.toLowerCase())));

      if (!matchesSearch) return false;

      const isFound = chart.templateStatus !== 'not_found' && Boolean(chart.rows && chart.rows.length > 0);
      if (statusFilter === 'done') {
        return isFound;
      }
      if (statusFilter === 'needs_action') {
        return !isFound;
      }
      return true;
    });
  }, [localFoundCharts, searchQuery, statusFilter]);

  // Filtered Not Found Brands (Tab B)
  const filteredNotFoundBrands = useMemo(() => {
    return notFoundBrands.filter((item) => {
      const parentCat = item.parentCategory || normalizeToParentCategory(item.categoryPath || item.title || '');
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
        parentCat.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const isDone = item.status === 'complete';
      if (statusFilter === 'done') {
        return isDone;
      }
      if (statusFilter === 'needs_action') {
        return !isDone;
      }
      return true;
    });
  }, [notFoundBrands, searchQuery, statusFilter]);

  // Filtered No Brand Categories (Tab C)
  const filteredNoBrandCategories = useMemo(() => {
    return noBrandCategories.filter((item) => {
      const parentCat = item.parentCategory || normalizeToParentCategory(item.categoryPath || item.title || '');
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.categoryPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        parentCat.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const isDone = item.status === 'complete';
      if (statusFilter === 'done') {
        return isDone;
      }
      if (statusFilter === 'needs_action') {
        return !isDone;
      }
      return true;
    });
  }, [noBrandCategories, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-pink-500" />
              {stageLabel} · AI Agent
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">Autonomous Web Research</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {stepLabel}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Our AI crawls verified manufacturer repositories to extract precise garment measurements and conversion tables for all identified brands and category paths.
          </p>
        </div>
      </div>

      {/* STATE 1: INITIAL STATE (Not run yet) */}
      {!isCompleted && !isRunning && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-xs flex flex-col items-center justify-center space-y-6 min-h-[380px]">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 text-purple-700 flex items-center justify-center shadow-inner border border-purple-200/50">
            <Globe className="w-10 h-10 stroke-[1.75]" />
          </div>

          <div className="max-w-lg space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Official Brand Size Chart Crawler</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              We&apos;ll search the web for each brand&apos;s official size chart. For private brands and unbranded segments with multiple category paths (shoes, blazers, t-shirts, pants), distinct sizing charts can be filled individually.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={startResearch}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-base font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-lg shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-pink-200" />
              <span>Run Size Chart Research</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 max-w-2xl w-full border-t border-slate-100 text-left">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs font-bold text-slate-900 block">Verified Manufacturer Guides</span>
              <span className="text-[11px] text-slate-500">Cites official domain sizing guidelines</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs font-bold text-slate-900 block">Path-Specific Coverage</span>
              <span className="text-[11px] text-slate-500">Distinct matrices for shoes, blazers, pants &amp; tops</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs font-bold text-slate-900 block">Unit Normalization</span>
              <span className="text-[11px] text-slate-500">Converts IN/CM and US/UK/EU sizing</span>
            </div>
          </div>
        </div>
      )}

      {/* STATE 2: RUNNING SIMULATION */}
      {isRunning && (
        <div className="bg-white rounded-2xl border border-purple-200/80 p-12 text-center shadow-lg shadow-purple-500/5 flex flex-col items-center justify-center space-y-6 min-h-[380px]">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] text-white flex items-center justify-center shadow-md animate-pulse">
              <Globe className="w-10 h-10 animate-spin" />
            </div>
            <div className="absolute -inset-2 rounded-2xl border-2 border-pink-300 animate-ping opacity-25"></div>
          </div>

          <div className="max-w-md space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-bold font-mono">
              Researching brand {currentBrandIndex} of 50…
            </div>
            <h3 className="text-xl font-bold text-slate-900">Extracting Official Size Matrices...</h3>
            <p className="text-sm font-semibold text-purple-700 h-6 transition-all">
              {BRAND_SEARCH_STEPS[statusMessageIndex]}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>{Math.round((progressPercent / 100) * 38)} of 38 charts identified</span>
              <span className="text-purple-700">{progressPercent}%</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] rounded-full transition-all duration-100 ease-out"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* STATE 3: RESULTS TABS */}
      {isCompleted && !isRunning && (
        <div className="space-y-6">
          {/* Result Tabs Navigation & Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-wrap gap-2">
              {/* Tab A: Found & Filled / Global Brands */}
              <button
                type="button"
                onClick={() => setActiveTab('found')}
                className={`flex-1 min-w-[200px] flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'found'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSyncFlow
                    ? `Global Brands (${localFoundCharts.length} Brands)`
                    : `Found & Filled (${localFoundCharts.length} Brands)`}
                </span>
              </button>

              {/* Tab B: Not Found / Private Brands */}
              <button
                type="button"
                onClick={() => setActiveTab('not_found')}
                className={`flex-1 min-w-[200px] flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'not_found'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>
                  {isSyncFlow
                    ? `Private Brands (${notFoundBrands.length} Category Paths)`
                    : `Not Found / Private Brands (${notFoundBrands.length} Category Paths)`}
                </span>
              </button>

              {/* Tab C: No Brand */}
              <button
                type="button"
                onClick={() => setActiveTab('no_brand')}
                className={`flex-1 min-w-[200px] flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'no_brand'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>
                  {isSyncFlow
                    ? `No Brand (${noBrandCategories.length} Category Paths)`
                    : `No Brand / Fallbacks (${noBrandCategories.length} Category Paths)`}
                </span>
              </button>
            </div>

            {/* Quick Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-slate-400" /> Filter:
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Global Brands ({localFoundCharts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('done')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    statusFilter === 'done'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Template Found ({localFoundCharts.filter(c => c.templateStatus === 'found' || (c.rows && c.rows.length > 0)).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('needs_action')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    statusFilter === 'needs_action'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Template Not Found ({localFoundCharts.filter(c => c.templateStatus === 'not_found' || !c.rows || c.rows.length === 0).length})</span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search global brands or categories…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-white transition-all"
                />
              </div>
            </div>
          </div>

          {/* TAB A CONTENT: FOUND & FILLED / GLOBAL BRANDS */}
          {activeTab === 'found' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-emerald-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <h3 className="font-bold text-sm text-slate-900">
                    Global Brand Sizing Charts ({filteredFoundCharts.length} Brands)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-800 font-semibold bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {localFoundCharts.filter(c => c.templateStatus === 'found' || (c.rows && c.rows.length > 0)).length} Templates Found
                  </span>
                  {localFoundCharts.filter(c => c.templateStatus === 'not_found' || !c.rows || c.rows.length === 0).length > 0 && (
                    <span className="text-xs text-amber-800 font-semibold bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-200">
                      {localFoundCharts.filter(c => c.templateStatus === 'not_found' || !c.rows || c.rows.length === 0).length} Need Generation
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/90 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3.5">Brand</th>
                      <th className="px-5 py-3.5">Category Coverage</th>
                      <th className="px-5 py-3.5">Sub Category Coverage</th>
                      <th className="px-5 py-3.5">SKU Count</th>
                      <th className="px-5 py-3.5">Source &amp; Status</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFoundCharts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-xs text-slate-500">
                          No matching brand size charts found for the active filter.
                        </td>
                      </tr>
                    ) : (
                      filteredFoundCharts.map((chart) => {
                        const hasTemplate = chart.templateStatus === 'found' || (chart.rows && chart.rows.length > 0);
                        const isGenerating = generatingIds.has(chart.id);

                        return (
                          <tr key={chart.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Brand */}
                            <td className="px-5 py-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{chart.brand}</span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                                    Global Brand
                                  </span>
                                </div>
                                {/* Researched Sizing Systems with Store Type Highlighted */}
                                {(() => {
                                  const storeType = (sizingConfig?.brandOverrides[chart.brand] || sizingConfig?.defaultSystem || 'US') as SizingSystemOption;
                                  return (
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      <span className="text-slate-400 font-medium">Standards:</span>
                                      {(['US', 'UK', 'EU'] as SizingSystemOption[]).map((sys) => {
                                        const isSelected = sys === storeType;
                                        return (
                                          <span
                                            key={sys}
                                            className={`px-1.5 py-0.5 rounded font-bold font-mono transition-colors ${
                                              isSelected
                                                ? 'bg-purple-100 text-purple-900 border border-purple-300 shadow-xs'
                                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                                            }`}
                                            title={isSelected ? `${sys} is store-selected type from Tab 1` : `${sys} standard covered`}
                                          >
                                            {sys} {isSelected ? '★' : ''}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>

                            {/* Category Coverage Tags */}
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-1.5">
                                {chart.categories.map((cat) => {
                                  const normCat = normalizeToParentCategory(cat);
                                  return (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => {
                                        if (hasTemplate) {
                                          onViewChart(chart, undefined, normCat);
                                        } else {
                                          handleGenerateTemplate(chart.id);
                                        }
                                      }}
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                                        hasTemplate
                                          ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-900 border-purple-200'
                                          : 'bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border-slate-200'
                                      }`}
                                      title={hasTemplate ? `View ${chart.brand} ${cat} template` : `Click to generate ${chart.brand} ${cat} template`}
                                    >
                                      <span>{cat}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Sub Category Coverage */}
                            <td className="px-5 py-4 max-w-[280px]">
                              <div className="flex flex-wrap gap-1.5">
                                {chart.subCategories && chart.subCategories.length > 0 ? (
                                  chart.subCategories.map((subCat) => (
                                    <span
                                      key={subCat}
                                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs"
                                      title={`${chart.brand} · Sub-category: ${subCat}`}
                                    >
                                      {subCat}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate-400 italic">No subcategories mapped</span>
                                )}
                              </div>
                            </td>

                            {/* SKU Count */}
                            <td className="px-5 py-4 font-mono text-slate-700 font-semibold whitespace-nowrap">
                              {chart.skuCount ?? 6} SKUs
                            </td>

                            {/* Source & Status */}
                            <td className="px-5 py-4">
                              {hasTemplate ? (
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    {chart.confidence > 0 ? chart.confidence : 99.2}%
                                  </span>
                                  <span className="text-xs text-slate-500 truncate max-w-[240px]" title={chart.lastUpdated}>
                                    {chart.lastUpdated}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    Template Not Found
                                  </span>
                                  <span className="text-xs text-slate-500 truncate max-w-[220px]" title={chart.lastUpdated}>
                                    {chart.lastUpdated}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Action Button: Template Found (opens popup) vs Generate (creates chart & opens popup) */}
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center gap-2 justify-end">
                                {hasTemplate ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewChart(chart)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                                    title={`Click to check ${chart.brand} size chart template in popup`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Template Found</span>
                                    <Eye className="w-3.5 h-3.5 text-emerald-600/70 group-hover:text-emerald-800 transition-colors ml-0.5" />
                                  </button>
                                ) : (
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateTemplate(chart.id)}
                                      disabled={isGenerating}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 shadow-sm shadow-purple-500/20 active:scale-98 transition-all cursor-pointer disabled:opacity-60"
                                      title={`Generate size chart template for ${chart.brand}`}
                                    >
                                      {isGenerating ? (
                                        <>
                                          <Sparkles className="w-3.5 h-3.5 text-pink-200 animate-spin" />
                                          <span>Generating…</span>
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="w-3.5 h-3.5 text-pink-200" />
                                          <span>Generate</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB B CONTENT: NOT FOUND / PRIVATE BRANDS */}
          {activeTab === 'not_found' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden space-y-0">
              <div className="px-6 py-4 border-b border-slate-200 bg-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="font-bold text-sm text-slate-900">
                    {isSyncFlow
                      ? `Private Brand Sizing Specifications (${filteredNotFoundBrands.length} Paths)`
                      : `Private Brands & Missing Public Size Specifications (${filteredNotFoundBrands.length} Paths)`}
                  </h3>
                </div>
                <span className="text-xs text-amber-900 font-semibold bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 self-start sm:self-auto">
                  Path-Specific Size Matrix Required
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/90 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5">Brand Name</th>
                      <th className="px-6 py-3.5">Category Path</th>
                      <th className="px-6 py-3.5">Category Coverage</th>
                      <th className="px-6 py-3.5">SKU Count</th>
                      <th className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNotFoundBrands.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-xs text-slate-500">
                          No matching private brand templates found for the active filter.
                        </td>
                      </tr>
                    ) : (
                      filteredNotFoundBrands.map((item) => {
                        const isDone = item.status === 'complete';
                        const parentCat = (item.parentCategory || normalizeToParentCategory(item.categoryPath || item.title || '')) as ParentCategoryType;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Brand Name */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{item.brandName}</span>
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    Private Brand
                                  </span>
                                </div>
                                {(() => {
                                  const storeType = (sizingConfig?.brandOverrides[item.brandName] || sizingConfig?.defaultSystem || 'US') as SizingSystemOption;
                                  return (
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      <span className="text-slate-400 font-medium">Templates:</span>
                                      {(['US', 'UK', 'EU'] as SizingSystemOption[]).map((sys) => (
                                        <span
                                          key={sys}
                                          className={`px-1.5 py-0.5 rounded font-bold font-mono ${
                                            sys === storeType
                                              ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                                          }`}
                                        >
                                          {sys} {sys === storeType ? '★' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>

                            {/* Category Path Column */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-700 bg-slate-100/90 px-2.5 py-1 rounded-md border border-slate-200/80">
                                <FolderTree className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                                <span>{item.categoryPath}</span>
                              </span>
                            </td>

                            {/* Category Coverage Column */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-100">
                                {parentCat}
                              </span>
                            </td>

                            {/* SKU Count */}
                            <td className="px-6 py-4 font-mono text-slate-700 font-semibold">{item.skuCount} SKUs</td>

                            {/* Action: Shows Done (with edit template) vs To Fill */}
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center gap-2 justify-end">
                                {isDone ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      Done
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onFillGap(item.id)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                      title="Inspect or edit template matrix"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                                      Edit Template
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                      Needs Template
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onFillGap(item.id)}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 shadow-sm shadow-purple-500/20 active:scale-98 transition-all cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Fill Template
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB C CONTENT: NO BRAND (NULL) */}
          {activeTab === 'no_brand' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden space-y-0">
              <div className="px-6 py-4 border-b border-slate-200 bg-rose-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-rose-600" />
                  <h3 className="font-bold text-sm text-slate-900">
                    {isSyncFlow
                      ? `No Brand Products by Category Path (${filteredNoBrandCategories.length} Paths)`
                      : `Unbranded (Null) Products by Category Path (${filteredNoBrandCategories.length} Paths)`}
                  </h3>
                </div>
                <span className="text-xs text-rose-800 font-semibold bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200 self-start sm:self-auto">
                  Missing Brand Specification
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/90 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5">Brand Entity</th>
                      <th className="px-6 py-3.5">Category Path</th>
                      <th className="px-6 py-3.5">Category Coverage</th>
                      <th className="px-6 py-3.5">SKU Count</th>
                      <th className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNoBrandCategories.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-xs text-slate-500">
                          No matching unbranded fallbacks found for the active filter.
                        </td>
                      </tr>
                    ) : (
                      filteredNoBrandCategories.map((item) => {
                        const isDone = item.status === 'complete';
                        const parentCat = (item.parentCategory || normalizeToParentCategory(item.categoryPath || item.title || '')) as ParentCategoryType;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Brand Entity */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{item.brandName}</span>
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                                    Null Brand
                                  </span>
                                </div>
                                {(() => {
                                  const storeType = (sizingConfig?.defaultSystem || 'US') as SizingSystemOption;
                                  return (
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      <span className="text-slate-400 font-medium">Templates:</span>
                                      {(['US', 'UK', 'EU'] as SizingSystemOption[]).map((sys) => (
                                        <span
                                          key={sys}
                                          className={`px-1.5 py-0.5 rounded font-bold font-mono ${
                                            sys === storeType
                                              ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                                          }`}
                                        >
                                          {sys} {sys === storeType ? '★' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>

                            {/* Category Path */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-700 bg-slate-100/90 px-2.5 py-1 rounded-md border border-slate-200/80">
                                <FolderTree className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                                <span>{item.categoryPath}</span>
                              </span>
                            </td>

                            {/* Category Coverage Column */}
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-100">
                                {parentCat}
                              </span>
                            </td>

                            {/* Affected SKUs */}
                            <td className="px-6 py-4 font-mono text-slate-700 font-semibold">{item.skuCount} SKUs</td>

                            {/* Action: Shows Done vs To Fill */}
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center gap-2 justify-end">
                                {isDone ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      Done
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onFillGap(item.id)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                                      title="Inspect or edit fallback matrix"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                                      Edit Fallback
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                      Needs Fallback
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => onFillGap(item.id)}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 shadow-sm active:scale-98 transition-all cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      Fill Fallback
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bottom Summary Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                {localFoundCharts.filter(c => c.isResearched !== false).length} size charts ready
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                {notFoundBrands.filter(b => b.status === 'complete').length} of {notFoundBrands.length} private templates done
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                {noBrandCategories.filter(c => c.status === 'complete').length} of {noBrandCategories.length} fallbacks done
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onPrev}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>

              <button
                type="button"
                onClick={onNext}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
              >
                <span>Proceed to Chart Assignment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
