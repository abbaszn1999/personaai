import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Search,
  Tag,
  Store,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Slash,
  Check,
  Filter,
} from 'lucide-react';
import { DiscoveredBrand } from '../types';

interface Stage3Props {
  brands: DiscoveredBrand[];
  isCompleted: boolean;
  onSetCompleted: (completed: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onUpdateBrand?: (brandName: string, updates: Partial<DiscoveredBrand>) => void;
  stageLabel?: string;
  stepLabel?: string;
}

type BrandTypeFilter = 'all' | 'global' | 'private' | 'null';
type BrandStatusFilter = 'all' | 'Verified' | 'Pending Research' | 'Needs Review' | 'Excluded';

const STATUS_MESSAGES = [
  'Reading product titles & descriptions…',
  'Cross-referencing brand names with entity repository…',
  'Classifying brand types: Global, Private, and Null entities…',
  'Finalizing brand catalog breakdown and size research targets…',
];

const BRAND_STATUS_OPTIONS: {
  value: DiscoveredBrand['status'];
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
}[] = [
  {
    value: 'Verified',
    label: 'Verified',
    badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100',
    dotClass: 'bg-emerald-500',
    description: 'Confirmed brand entity ready for size chart matching',
  },
  {
    value: 'Pending Research',
    label: 'Pending Research',
    badgeClass: 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100',
    dotClass: 'bg-sky-500',
    description: 'Scheduled for automated web search in Stage 4',
  },
  {
    value: 'Needs Review',
    label: 'Needs Review',
    badgeClass: 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100',
    dotClass: 'bg-amber-500',
    description: 'Ambiguous entity or custom private label requiring review',
  },
  {
    value: 'Excluded',
    label: 'Excluded',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200',
    dotClass: 'bg-slate-400',
    description: 'Ignored from automated size chart crawlers',
  },
];

export function Stage3BrandDiscovery({
  brands,
  isCompleted,
  onSetCompleted,
  onPrev,
  onNext,
  onUpdateBrand,
  stageLabel = 'Stage 3 of 5',
  stepLabel = 'Step 1 of 2 — Brand Discovery & Classification',
}: Stage3Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [scannedCount, setScannedCount] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [brandTypeFilter, setBrandTypeFilter] = useState<BrandTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<BrandStatusFilter>('all');
  const [lastUpdatedBrand, setLastUpdatedBrand] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startDiscovery = () => {
    setIsRunning(true);
    setStatusIndex(0);
    setScannedCount(0);
    setProgressPercent(0);

    const totalDuration = 4200;
    const updateFreq = 60;
    const steps = totalDuration / updateFreq;
    let step = 0;

    intervalRef.current = setInterval(() => {
      step++;
      const pct = Math.min(100, Math.round((step / steps) * 100));
      setProgressPercent(pct);
      setScannedCount(Math.min(12480, Math.round((pct / 100) * 12480)));

      // Rotate status message every ~1.2s
      if (pct > 75) setStatusIndex(3);
      else if (pct > 50) setStatusIndex(2);
      else if (pct > 25) setStatusIndex(1);
      else setStatusIndex(0);

      if (step >= steps) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsRunning(false);
        onSetCompleted(true);
      }
    }, updateFreq);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Compute metrics
  const globalBrands = brands.filter((b) => b.brandType === 'global');
  const privateBrands = brands.filter((b) => b.brandType === 'private');
  const nullBrands = brands.filter((b) => b.brandType === 'null' || b.isUnbranded);

  const verifiedBrands = brands.filter((b) => b.status === 'Verified');
  const pendingBrands = brands.filter((b) => b.status === 'Pending Research');
  const reviewBrands = brands.filter((b) => b.status === 'Needs Review');
  const excludedBrands = brands.filter((b) => b.status === 'Excluded');

  const globalSKUs = globalBrands.reduce((acc, b) => acc + b.skuCount, 0);
  const privateSKUs = privateBrands.reduce((acc, b) => acc + b.skuCount, 0);
  const nullSKUs = nullBrands.reduce((acc, b) => acc + b.skuCount, 0);

  // Status Change Handler
  const handleStatusChange = (brandName: string, newStatus: DiscoveredBrand['status']) => {
    if (onUpdateBrand) {
      onUpdateBrand(brandName, { status: newStatus });
      setLastUpdatedBrand(brandName);
      setTimeout(() => setLastUpdatedBrand(null), 2500);
    }
  };

  // Brand Type Change Handler
  const handleTypeChange = (brandName: string, newType: 'global' | 'private' | 'null') => {
    if (onUpdateBrand) {
      onUpdateBrand(brandName, {
        brandType: newType,
        isUnbranded: newType === 'null',
      });
      setLastUpdatedBrand(brandName);
      setTimeout(() => setLastUpdatedBrand(null), 2500);
    }
  };

  // Quick batch actions
  const handleMarkAllVisibleAsVerified = () => {
    if (!onUpdateBrand) return;
    visibleBrands.forEach((b) => {
      onUpdateBrand(b.name, { status: 'Verified' });
    });
    setLastUpdatedBrand('all_verified');
    setTimeout(() => setLastUpdatedBrand(null), 2500);
  };

  // Filtering
  const filteredBrands = brands.filter((b) => {
    const matchesSearch = b.name.toLowerCase().includes(filterQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (brandTypeFilter !== 'all') {
      if (brandTypeFilter === 'global' && b.brandType !== 'global') return false;
      if (brandTypeFilter === 'private' && b.brandType !== 'private') return false;
      if (brandTypeFilter === 'null' && !(b.brandType === 'null' || b.isUnbranded)) return false;
    }

    if (statusFilter !== 'all') {
      if (b.status !== statusFilter) return false;
    }

    return true;
  });

  const visibleBrands = showAllBrands ? filteredBrands : filteredBrands.slice(0, 8);

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
            <span className="text-xs font-medium text-slate-500">Autonomous Classification</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {stepLabel}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Our AI scans your catalog titles, descriptions, and SKU tags to classify brand entities into <strong className="text-emerald-700 font-semibold">Global Brands</strong>, <strong className="text-amber-700 font-semibold">Private Brands</strong>, and <strong className="text-rose-700 font-semibold">Null / Missing Brands</strong>. You can change any brand's status or entity classification below.
          </p>
        </div>
      </div>

      {/* STATE 1: INITIAL STATE (Not run yet) */}
      {!isCompleted && !isRunning && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-xs flex flex-col items-center justify-center space-y-6 min-h-[380px]">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 text-purple-700 flex items-center justify-center shadow-inner border border-purple-200/50">
            <Cpu className="w-10 h-10 stroke-[1.75]" />
          </div>

          <div className="max-w-lg space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Brand Discovery Engine Ready</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Our AI will scan all 12,480 SKUs and categorize brands into Global, Private (e.g., Moustache Store), and Null entities.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={startDiscovery}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-base font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-lg shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-yellow-300 animate-spin" />
              <span>Launch Brand Discovery</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: SCANNING / RUNNING */}
      {isRunning && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-6 min-h-[380px]">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-purple-50 flex items-center justify-center border border-purple-200 shadow-inner">
              <Sparkles className="w-12 h-12 text-purple-600 animate-bounce" />
            </div>
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] opacity-30 blur-sm -z-10 animate-pulse"></div>
          </div>

          <div className="max-w-md space-y-2">
            <h3 className="text-xl font-bold text-slate-900">AI Agent Scanning Catalog...</h3>
            <p className="text-sm font-semibold text-purple-700 h-6 transition-all">
              {STATUS_MESSAGES[statusIndex]}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>{scannedCount.toLocaleString()} / 12,480 SKUs Scanned</span>
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

      {/* STATE 3: RESULTS STATE */}
      {isCompleted && !isRunning && (
        <div className="space-y-6">
          {/* Top Summary Metrics: Global (Green), Private (Yellow), Null (Red) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Global Brands (Green) */}
            <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs bg-gradient-to-b from-emerald-50/30 to-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Global Brands
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold border border-emerald-300">
                  {globalBrands.length} Brands
                </span>
              </div>
              <div className="text-2xl font-extrabold text-emerald-950 mt-2 flex items-center gap-2">
                <span>{globalSKUs.toLocaleString()} SKUs</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs text-emerald-700 mt-1 font-medium">
                {((globalSKUs / 12480) * 100).toFixed(1)}% of catalog · Automated crawling eligible
              </p>
            </div>

            {/* Private Brands (Yellow) */}
            <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs bg-gradient-to-b from-amber-50/40 to-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Private Brands
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                  {privateBrands.length} Brands
                </span>
              </div>
              <div className="text-2xl font-extrabold text-amber-950 mt-2 flex items-center gap-2">
                <span>{privateSKUs.toLocaleString()} SKUs</span>
                <Store className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-xs text-amber-700 mt-1 font-medium">
                {((privateSKUs / 12480) * 100).toFixed(1)}% of catalog · e.g. Moustache Store
              </p>
            </div>

            {/* Null / No Brand (Red) */}
            <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs bg-gradient-to-b from-rose-50/40 to-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  Null / No Brand
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 font-bold border border-rose-300">
                  {nullBrands.length} Segment
                </span>
              </div>
              <div className="text-2xl font-extrabold text-rose-950 mt-2 flex items-center gap-2">
                <span>{nullSKUs.toLocaleString()} SKUs</span>
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-xs text-rose-700 mt-1 font-medium">
                {((nullSKUs / 12480) * 100).toFixed(1)}% of catalog · Handled by Category Fallbacks in Stage 4
              </p>
            </div>
          </div>

          {/* Filter Bar by Brand Type & Brand Status */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Type Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-slate-400 text-xs font-medium pl-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Type:
                </span>

                {/* All */}
                <button
                  type="button"
                  onClick={() => setBrandTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    brandTypeFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>All Types</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      brandTypeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {brands.length}
                  </span>
                </button>

                {/* Global (Green) */}
                <button
                  type="button"
                  onClick={() => setBrandTypeFilter('global')}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    brandTypeFilter === 'global'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Global</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      brandTypeFilter === 'global' ? 'bg-white/20 text-white' : 'bg-emerald-200/80 text-emerald-900'
                    }`}
                  >
                    {globalBrands.length}
                  </span>
                </button>

                {/* Private (Yellow) */}
                <button
                  type="button"
                  onClick={() => setBrandTypeFilter('private')}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    brandTypeFilter === 'private'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Private</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      brandTypeFilter === 'private' ? 'bg-white/20 text-white' : 'bg-amber-200/80 text-amber-900'
                    }`}
                  >
                    {privateBrands.length}
                  </span>
                </button>

                {/* Null (Red) */}
                <button
                  type="button"
                  onClick={() => setBrandTypeFilter('null')}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    brandTypeFilter === 'null'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>Null</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      brandTypeFilter === 'null' ? 'bg-white/20 text-white' : 'bg-rose-200/80 text-rose-900'
                    }`}
                  >
                    {nullBrands.length}
                  </span>
                </button>
              </div>

              {/* Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search brand name..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                />
              </div>
            </div>

            {/* Quick Helper Banner with Interactive Change Status Callout */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                  <ShieldCheck className="w-3.5 h-3.5" /> Interactive Editing:
                </span>
                <span>Click the <strong>Brand Type</strong> badges in the table below to change any brand's classification.</span>
              </div>
            </div>
          </div>

          {/* Results Table Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900">Discovered Brand Entities</h3>
                <span className="text-xs text-slate-500 font-medium">
                  (Showing {visibleBrands.length} of {filteredBrands.length} entities)
                </span>
              </div>

              {lastUpdatedBrand && (
                <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-in fade-in flex items-center gap-1">
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>Updated successfully!</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/90 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Brand Entity</th>
                    <th className="px-4 py-3.5">Brand Type</th>
                    <th className="px-6 py-3.5">SKU Count</th>
                    <th className="px-6 py-3.5">Catalog Share</th>
                    <th className="px-6 py-3.5 text-right">Research Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleBrands.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-xs text-slate-500">
                        No brands found matching "{filterQuery}" with current filters.
                      </td>
                    </tr>
                  ) : (
                    visibleBrands.map((brand) => {
                      const isNull = brand.brandType === 'null' || brand.isUnbranded;
                      const isPrivate = brand.brandType === 'private';
                      const isGlobal = brand.brandType === 'global';

                      return (
                        <tr
                          key={brand.name}
                          className={`transition-colors ${
                            isNull
                              ? 'bg-rose-50/20 hover:bg-rose-50/50'
                              : isPrivate
                              ? 'bg-amber-50/20 hover:bg-amber-50/50'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          {/* Brand Name */}
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="font-bold text-slate-900">{brand.name}</span>
                              {brand.isUnbranded && (
                                <span className="text-[10px] text-slate-400 italic">(Catalog fallback)</span>
                              )}
                            </div>
                          </td>

                          {/* Brand Type Selector (Global, Private, Null) */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="relative inline-block">
                              <select
                                value={brand.brandType}
                                onChange={(e) =>
                                  handleTypeChange(
                                    brand.name,
                                    e.target.value as 'global' | 'private' | 'null'
                                  )
                                }
                                className={`text-xs font-bold py-1 pl-2.5 pr-6 rounded-lg border shadow-2xs appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                                  isNull
                                    ? 'bg-rose-50 text-rose-900 border-rose-300'
                                    : isPrivate
                                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-950 border-emerald-300'
                                }`}
                                title="Change Brand Classification Type"
                              >
                                <option value="global">● Global Brand</option>
                                <option value="private">● Private Brand</option>
                                <option value="null">● Null / No Brand</option>
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>

                          {/* SKU Count */}
                          <td className="px-6 py-3.5 font-mono text-sm text-slate-700">
                            {brand.skuCount.toLocaleString()}
                          </td>

                          {/* Share Bar */}
                          <td className="px-6 py-3.5 min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isNull
                                      ? 'bg-rose-500'
                                      : isPrivate
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, brand.percentage * 3.5)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-mono text-slate-500 w-12 text-right">
                                {brand.percentage}%
                              </span>
                            </div>
                          </td>

                          {/* Next Step / Research Target */}
                          <td className="px-6 py-3.5 text-right">
                            {isNull ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                Category Fallback Matrix
                              </span>
                            ) : isPrivate ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                <Store className="w-3.5 h-3.5 text-amber-600" />
                                Store Matrix Required
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Automated Web Search
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Expand / Collapse 50 Brands */}
            <div className="px-6 py-3 bg-slate-50/70 border-t border-slate-200 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowAllBrands(!showAllBrands)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 transition-colors cursor-pointer"
              >
                {showAllBrands ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    <span>Collapse to top brands</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    <span>Show all {filteredBrands.length} brands in view</span>
                  </>
                )}
              </button>
            </div>

            {/* Bottom Action Bar */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={onPrev}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Preview
              </button>

              <button
                type="button"
                onClick={onNext}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
              >
                <span>Start Size Chart Research</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
