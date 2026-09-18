import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Layers,
  Tag,
  Eye,
  Ruler,
  CheckCircle,
  Sparkles,
  RotateCcw,
  Store,
  ShieldCheck,
  Zap,
  Sliders,
  Check,
  ChevronDown,
  Info,
  SlidersHorizontal,
  ArrowRightLeft,
  Filter,
  CheckCircle2,
  FolderTree,
  X,
} from 'lucide-react';
import {
  MockProduct,
  FoundSizeChart,
  GapItem,
  ParentCategoryType,
  StoreSizingSystemConfig,
  SizingSystemOption,
  BrandResearchedCategoryChart,
  PathChartAssignment,
  SkuChartOverride,
  FinalSkuChartResult,
  ResearchedChartVariant,
} from '../types';
import {
  normalizeToParentCategory,
  getCanonicalSizes,
  resolveFinalSkuChart,
  getAvailableVariantsForBrandAndCategory,
  isSizeAvailableInItem,
} from '../utils/sizingStandards';

interface Stage6Props {
  products: MockProduct[];
  foundCharts: FoundSizeChart[];
  gapItems: GapItem[];
  brandCharts?: BrandResearchedCategoryChart[];
  pathAssignments?: PathChartAssignment[];
  skuOverrides?: Record<string, SkuChartOverride>;
  sizingConfig?: StoreSizingSystemConfig;
  onUpdatePathAssignment?: (
    brand: string,
    merchantPath: string,
    assignedVariantId: string,
    assignedVariantName: string
  ) => void;
  onUpdateSkuOverride?: (sku: string, override: SkuChartOverride | null) => void;
  onViewChart: (
    chart: FoundSizeChart,
    item?: MockProduct,
    initialCat?: ParentCategoryType,
    initialVariantId?: string,
    isReadOnly?: boolean
  ) => void;
  onPrev: () => void;
  onReset: () => void;
  onRerunExtraction?: () => void;
  stageLabel?: string;
  hasExistingSizeChart?: boolean;
}

type BrandFilterType = 'all' | 'global' | 'private' | 'null';

export function Stage6Confirmation({
  products,
  foundCharts,
  gapItems,
  brandCharts = [],
  pathAssignments = [],
  skuOverrides = {},
  sizingConfig,
  onUpdatePathAssignment,
  onUpdateSkuOverride,
  onViewChart,
  onPrev,
  onReset,
  onRerunExtraction,
  stageLabel = 'Stage 6 of 6 · Active Catalog',
  hasExistingSizeChart = false,
}: Stage6Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<BrandFilterType>('all');
  const [showFinishModal, setShowFinishModal] = useState(false);

  // Inspector SKU selector
  const [inspectedSkuId, setInspectedSkuId] = useState<string>(
    products[0]?.id || 'prod-1'
  );

  // SKU Override Modal / Popover State
  const [editingSkuOverride, setEditingSkuOverride] = useState<MockProduct | null>(null);

  // Previewing Size Chart Modal State (Simple popup table with stock status)
  const [previewingProductChart, setPreviewingProductChart] = useState<{
    product: MockProduct;
    resolution: FinalSkuChartResult;
  } | null>(null);

  // Widget simulator state in finish modal
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [customerHeight, setCustomerHeight] = useState('178');
  const [customerWeight, setCustomerWeight] = useState('74');
  const [fitPreference, setFitPreference] = useState<'fitted' | 'regular' | 'relaxed'>('regular');
  const [isSimulating, setIsSimulating] = useState(false);
  const [showCopiedSnippet, setShowCopiedSnippet] = useState(false);

  // Global store-level size type chosen in Column Mapping (US, UK, EU, Alpha, Numeric)
  const storeDefaultSizeType: SizingSystemOption = sizingConfig?.defaultSystem || 'US';

  // Memoized resolution map for all products
  const productChartResolutionMap = useMemo(() => {
    const map = new Map<string, FinalSkuChartResult>();
    products.forEach((prod) => {
      const storeSys = (sizingConfig?.brandOverrides[prod.brand || ''] ||
        sizingConfig?.defaultSystem ||
        'US') as SizingSystemOption;
      const res = resolveFinalSkuChart(
        prod,
        storeSys,
        brandCharts,
        pathAssignments,
        skuOverrides
      );
      map.set(prod.id, res);
    });
    return map;
  }, [products, sizingConfig, brandCharts, pathAssignments, skuOverrides]);

  // Product currently being inspected in the 6-Step Size-Chart Architecture Pipeline
  const inspectedProduct = useMemo(() => {
    return products.find((p) => p.id === inspectedSkuId) || products[0];
  }, [products, inspectedSkuId]);

  const inspectedResolution = useMemo(() => {
    if (!inspectedProduct) return null;
    return productChartResolutionMap.get(inspectedProduct.id) || null;
  }, [inspectedProduct, productChartResolutionMap]);

  // Calculate counts for brand filters
  const globalCount = products.filter((p) => p.brandType === 'global').length;
  const privateCount = products.filter((p) => p.brandType === 'private').length;
  const nullCount = products.filter(
    (p) => p.brandType === 'null' || !p.brand || p.brand.trim() === ''
  ).length;
  const allCount = products.length;

  const filteredProducts = products.filter((prod) => {
    const isNullBrand = prod.brandType === 'null' || !prod.brand || prod.brand.trim() === '';
    const brandName = prod.brand || '';
    const resolution = productChartResolutionMap.get(prod.id);
    const parentCat = (prod.parentCategory ||
      normalizeToParentCategory(prod.category || prod.subCategory || prod.title)).toLowerCase();
    const canonicals = getCanonicalSizes(prod).join(' ').toLowerCase();

    const matchesSearch =
      prod.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parentCat.includes(searchTerm.toLowerCase()) ||
      canonicals.includes(searchTerm.toLowerCase()) ||
      (resolution && resolution.chartName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (resolution && resolution.assignedVariantName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (brandFilter === 'all') return true;
    if (brandFilter === 'global') return prod.brandType === 'global';
    if (brandFilter === 'private') return prod.brandType === 'private';
    if (brandFilter === 'null') return isNullBrand;

    return true;
  });

  const selectedProduct = products[selectedProductIndex] || products[0];

  const calculateRecommendation = () => {
    const h = parseInt(customerHeight, 10) || 175;
    const w = parseInt(customerWeight, 10) || 70;

    let baseSize = 'M';
    if (w < 65 || h < 168) baseSize = 'S';
    else if (w > 88 || h > 188) baseSize = 'XXL';
    else if (w > 80 || h > 182) baseSize = 'XL';
    else if (w > 72 || h > 176) baseSize = 'L';

    if (fitPreference === 'relaxed' && baseSize === 'M') baseSize = 'L';
    if (fitPreference === 'fitted' && baseSize === 'L') baseSize = 'M';

    return baseSize;
  };

  const handleTestFit = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
    }, 500);
  };

  // Open simple popup size chart modal with stock status
  const handleOpenFinalChartModal = (product: MockProduct) => {
    const res = productChartResolutionMap.get(product.id);
    if (!res) return;
    setPreviewingProductChart({
      product,
      resolution: res,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-98 duration-200">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
              {stageLabel}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              100% Size Charts Assigned
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Active Catalog &amp; Size-Chart Mapping Matrix
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Inspect all items with their resolved brand size-chart variants and SKU-filtered measurements.
            Click <strong className="text-purple-700 font-semibold">View Chart</strong> to view the exact dimensions available for each specific SKU.
          </p>
        </div>

        {/* Search Bar & Actions */}
        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
          {onRerunExtraction && (
            <button
              type="button"
              onClick={onRerunExtraction}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
              title="Re-run the automated JSON Extraction Pipeline"
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-500" />
              <span>Re-run Extractor</span>
            </button>
          )}

          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search SKU, brand, title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-slate-50/50"
            />
          </div>
        </div>
      </div>

      {/* Brand Type Filters & Legend */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 text-xs font-medium pl-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> Filter by Brand Type:
          </span>

          {/* All Brands */}
          <button
            type="button"
            onClick={() => setBrandFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              brandFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <span>All Items</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {allCount}
            </span>
          </button>

          {/* Global Brands (Green) */}
          <button
            type="button"
            onClick={() => setBrandFilter('global')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              brandFilter === 'global'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Global Brands</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'global' ? 'bg-white/20 text-white' : 'bg-emerald-200/80 text-emerald-900'
              }`}
            >
              {globalCount}
            </span>
          </button>

          {/* Private Brands (Yellow) */}
          <button
            type="button"
            onClick={() => setBrandFilter('private')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              brandFilter === 'private'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>Private Brands</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'private' ? 'bg-white/20 text-white' : 'bg-amber-200/80 text-amber-900'
              }`}
            >
              {privateCount}
            </span>
          </button>

          {/* Null / No Brand (Red) */}
          <button
            type="button"
            onClick={() => setBrandFilter('null')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              brandFilter === 'null'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Null / No Brand</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                brandFilter === 'null' ? 'bg-white/20 text-white' : 'bg-rose-200/80 text-rose-900'
              }`}
            >
              {nullCount}
            </span>
          </button>
        </div>

        {/* Color Legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 border-t sm:border-t-0 pt-2 sm:pt-0">
          <span className="font-semibold text-slate-400">Legend:</span>
          <span className="flex items-center gap-1 font-medium text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Green = Global
          </span>
          <span className="flex items-center gap-1 font-medium text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Yellow = Private
          </span>
          <span className="flex items-center gap-1 font-medium text-rose-700">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Red = Null
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN CATALOG DATA TABLE                                                   */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Product (title)</th>
                <th className="px-3 py-3.5">SKU (id)</th>
                <th className="px-3 py-3.5">Brand</th>
                <th className="px-3 py-3.5">Merchant Path &amp; Category</th>
                <th className="px-3 py-3.5">Sizes in Store</th>
                <th className="px-3 py-3.5">Canonical Size</th>
                <th className="px-4 py-3.5 text-right sm:text-left bg-purple-50/50 text-purple-900 border-l border-purple-100">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Ruler className="w-3.5 h-3.5 text-purple-600" />
                    <span>Final Chart</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const isNull =
                  product.brandType === 'null' || !product.brand || product.brand.trim() === '';
                const isPrivate = product.brandType === 'private';
                const isGlobal = product.brandType === 'global';
                const resolution = productChartResolutionMap.get(product.id);
                const parentCat = (product.parentCategory ||
                  normalizeToParentCategory(product.category || product.subCategory || product.title)) as ParentCategoryType;
                const canonicalList = getCanonicalSizes(product);

                return (
                  <tr
                    key={product.id}
                    className={`transition-colors ${
                      isNull
                        ? 'bg-rose-50/20 hover:bg-rose-50/50'
                        : isPrivate
                        ? 'bg-amber-50/20 hover:bg-amber-50/50'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Image & Title */}
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0 border border-slate-200/80 shadow-2xs"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 line-clamp-1" title={product.title}>
                            {product.title}
                          </p>
                          <p className="text-[11px] text-slate-400 line-clamp-1">{product.description}</p>
                        </div>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-3 font-mono text-slate-600 whitespace-nowrap">
                      <span className="font-bold text-slate-800">
                        {product.sku}
                      </span>
                    </td>

                    {/* Brand Field with Color-coded Tags */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {isNull ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          <span>Null (No Brand)</span>
                        </span>
                      ) : isPrivate ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          <span>{product.brand}</span>
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-200/60 px-1 py-0.2 rounded">
                            Private
                          </span>
                        </span>
                      ) : isGlobal ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>{product.brand}</span>
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-200/60 px-1 py-0.2 rounded">
                            Global
                          </span>
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          {product.brand}
                        </span>
                      )}
                    </td>

                    {/* Merchant Path & Parent Category */}
                    <td className="px-3 py-3 whitespace-nowrap max-w-[200px]">
                      <div className="space-y-0.5">
                        <span
                          className="text-[11px] text-slate-600 block truncate font-medium"
                          title={product.category}
                        >
                          {product.category}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-semibold border border-purple-200">
                          {parentCat}
                        </span>
                      </div>
                    </td>

                    {/* Sizes in Store */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1 max-w-[130px]">
                        {product.sizes.map((sz) => (
                          <span
                            key={sz}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-medium border border-slate-200"
                          >
                            {sz}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Canonical Size Column */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {canonicalList.length > 0 ? (
                          canonicalList.map((csz) => (
                            <span
                              key={csz}
                              className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 font-mono text-[11px] font-bold border border-purple-200"
                            >
                              {csz}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 text-xs italic">Auto mapped</span>
                        )}
                      </div>
                    </td>

                    {/* FINAL CHART ACTION COLUMN */}
                    <td className="px-4 py-3 whitespace-nowrap bg-purple-50/20 border-l border-purple-100">
                      <div className="flex items-center justify-between gap-2.5">
                        {resolution?.hasNoChart ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            🚫 No Size Chart
                          </span>
                        ) : (
                          <>
                            <div className="flex flex-col">
                              <span
                                className="text-[11px] font-bold text-purple-950 truncate max-w-[150px]"
                                title={resolution?.chartName}
                              >
                                {resolution?.chartName}
                              </span>
                              <span className="text-[10px] text-emerald-700 font-semibold">
                                ✓ {resolution?.finalRows.length || 0} SKU Sizes Filtered
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenFinalChartModal(product)}
                              title={`View Size Chart for ${product.sku}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-600 hover:text-white hover:border-purple-600 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex-shrink-0"
                            >
                              <Eye className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>View Chart</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom summary and navigation bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>
                <strong>12,480 total SKUs</strong> synchronized
              </span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {globalCount} Global
              </span>
              <span className="flex items-center gap-1 text-amber-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> {privateCount} Private
              </span>
              <span className="flex items-center gap-1 text-rose-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> {nullCount} Null
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onPrev}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {hasExistingSizeChart ? 'Back to Step 1 (Column Mapping)' : 'Back to Chart Assignment'}
            </button>

            {/* FINISH AND GO TO DASHBOARD BUTTON */}
            <button
              type="button"
              onClick={() => setShowFinishModal(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Finish &amp; Go to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SKU OVERRIDE MODAL (STEP 5)                                               */}
      {/* ========================================================================= */}
      {editingSkuOverride && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                  Step 5: SKU-Level Chart Override
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  Override Chart for SKU: {editingSkuOverride.sku}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkuOverride(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-800">{editingSkuOverride.title}</p>
                <p className="text-slate-500">
                  Brand: <strong>{editingSkuOverride.brand}</strong> · Path: <strong>{editingSkuOverride.category}</strong>
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Select Override Variant for this specific SKU:
                </label>
                {(() => {
                  const parentCat = (editingSkuOverride.parentCategory ||
                    normalizeToParentCategory(editingSkuOverride.category)) as ParentCategoryType;
                  const available = getAvailableVariantsForBrandAndCategory(
                    editingSkuOverride.brand || '',
                    parentCat,
                    brandCharts
                  );

                  return (
                    <div className="space-y-2">
                      {available.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            onUpdateSkuOverride?.(editingSkuOverride.sku, {
                              sku: editingSkuOverride.sku,
                              targetVariantId: v.id,
                              reason: `Manual Override: ${v.variantName}`,
                            });
                            setEditingSkuOverride(null);
                          }}
                          className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition-all flex items-center justify-between cursor-pointer"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{v.variantName}</span>
                            <span className="text-[11px] text-slate-500">
                              {v.gender ? `Gender: ${v.gender} · ` : ''}
                              {v.fitType ? `Fit: ${v.fitType} · ` : ''}
                              {v.rows ? v.rows.length : 0} standard sizing rows
                            </span>
                          </div>
                          <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg">
                            Apply
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {skuOverrides[editingSkuOverride.sku] && (
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-amber-800 font-semibold">Currently overridden</span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSkuOverride?.(editingSkuOverride.sku, null);
                      setEditingSkuOverride(null);
                    }}
                    className="text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                  >
                    Clear Override (Revert to Path)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SIMPLE POPUP TABLE MODAL: SIZE CHART WITH STORE STOCK STATUS              */}
      {/* ========================================================================= */}
      {previewingProductChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">
                    Product Size Chart
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md">
                    SKU: {previewingProductChart.product.sku}
                  </span>
                  {previewingProductChart.resolution.isSkuOverride && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                      SKU Override
                    </span>
                  )}
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {previewingProductChart.product.brand || 'Store'} — {previewingProductChart.resolution.assignedVariantName}
                  <span className="text-slate-500 font-medium text-sm ml-1.5">
                    ({previewingProductChart.product.parentCategory || normalizeToParentCategory(previewingProductChart.product.category)})
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingProductChart(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary Sub-Banner */}
            <div className="px-6 py-3 bg-purple-50/50 border-b border-purple-100/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={previewingProductChart.product.imageUrl}
                  alt={previewingProductChart.product.title}
                  className="w-10 h-10 rounded-lg object-cover border border-purple-200/80 shrink-0 shadow-2xs"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {previewingProductChart.product.title}
                  </p>
                  <div className="text-[11px] text-slate-600 flex items-center gap-2 mt-0.5">
                    <span>Path: <strong className="text-purple-900">{previewingProductChart.product.category}</strong></span>
                    <span>·</span>
                    <span>Store Sizes: <strong className="text-slate-900">{previewingProductChart.product.sizes.join(', ')}</strong></span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider block">
                  Store Availability
                </span>
                <span className="text-xs font-extrabold text-emerald-700">
                  {previewingProductChart.product.sizes.length} Sizes Stocked
                </span>
              </div>
            </div>

            {/* Sizing Table with Stock Status */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      {previewingProductChart.resolution.headers.map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">Stock Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {previewingProductChart.resolution.rows.map((row, idx) => {
                      const firstHeader = previewingProductChart.resolution.headers[0];
                      const sizeVal = row[firstHeader] || Object.values(row)[0] || '';
                      const isStocked = isSizeAvailableInItem(
                        sizeVal,
                        previewingProductChart.product.sizes,
                        getCanonicalSizes(previewingProductChart.product)
                      );

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isStocked
                              ? 'bg-white hover:bg-purple-50/30'
                              : 'bg-slate-50/50 text-slate-400 hover:bg-slate-100/50'
                          }`}
                        >
                          {previewingProductChart.resolution.headers.map((h, cIdx) => (
                            <td
                              key={h}
                              className={`px-4 py-2.5 font-mono ${
                                cIdx === 0
                                  ? isStocked
                                    ? 'font-extrabold text-slate-900'
                                    : 'font-semibold text-slate-400'
                                  : isStocked
                                  ? 'text-slate-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {row[h] || '—'}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right font-sans">
                            {isStocked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                                In Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200">
                                Unstocked
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {previewingProductChart.resolution.source && (
                <p className="text-[11px] text-slate-500 mt-4 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <strong>Source &amp; Spec:</strong> {previewingProductChart.resolution.source} · Measurements in {previewingProductChart.resolution.unit || 'cm'}
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                Showing full brand sizing matrix with store SKU inventory indicators
              </div>
              <button
                type="button"
                onClick={() => setPreviewingProductChart(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close Size Chart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CELEBRATION & DASHBOARD CONFIRMATION MODAL */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Hero */}
            <div className="bg-gradient-to-br from-[#8B5CF6]/15 via-pink-50 to-white p-8 border-b border-purple-100 text-center relative overflow-hidden">
              <div className="relative z-10 space-y-4 max-w-xl mx-auto">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] text-white shadow-xl shadow-purple-500/30 ring-8 ring-purple-100/70">
                  <Sparkles className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                    Onboarding Complete! 🎉
                  </h2>
                  <p className="text-sm font-medium text-purple-950/80 mt-1.5">
                    Your entire catalog of <strong className="text-purple-700 font-bold">12,480 SKUs</strong> across 50 brand entities is fully connected with verified sizing matrices.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/50 border-b border-slate-200">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 text-center shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Store Catalog</span>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">12,480 SKUs</p>
                <span className="text-[10px] text-emerald-600 font-bold">100% Synced</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 text-center shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Brand Clusters</span>
                <p className="text-lg font-extrabold text-purple-700 mt-0.5">50 Entities</p>
                <span className="text-[10px] text-purple-600 font-bold">Classified</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 text-center shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Size Matrices</span>
                <p className="text-lg font-extrabold text-emerald-600 mt-0.5">100% Filled</p>
                <span className="text-[10px] text-emerald-700 font-bold">Verified</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 text-center shadow-2xs">
                <span className="text-[10px] font-bold uppercase text-slate-400">Persona API</span>
                <p className="text-lg font-extrabold text-pink-600 mt-0.5">Active</p>
                <span className="text-[10px] text-pink-700 font-bold">&lt;40ms Latency</span>
              </div>
            </div>

            {/* Live Interactive Fit Widget Simulation */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-bold text-slate-900">Try Storefront Size Recommendation</h4>
                </div>
                <span className="text-xs text-slate-500">Live preview on product page</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.title}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200"
                />
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs font-bold text-slate-900 truncate">{selectedProduct.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Height: {customerHeight}cm · Weight: {customerWeight}kg · Fit: {fitPreference}
                  </p>
                </div>
                <div className="p-2.5 px-4 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white text-center shadow-xs">
                  <span className="text-[10px] uppercase tracking-wider text-purple-200 block font-semibold">Recommended Size</span>
                  <span className="text-xl font-extrabold">{calculateRecommendation()}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Onboarding Flow Demo</span>
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowFinishModal(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Back to Catalog
                </button>

                <button
                  type="button"
                  onClick={() => {
                    alert('🎉 Congratulations! Persona Fit Intelligence is successfully configured and active.');
                    setShowFinishModal(false);
                  }}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Launch Persona Dashboard</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
