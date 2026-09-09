import { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Table as TableIcon,
  Code2,
  Sparkles,
  Tag,
  Plus,
  Trash2,
  ChevronDown,
  Sliders,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import {
  FoundSizeChart,
  MockProduct,
  SizingSystemOption,
  StoreSizingSystemConfig,
  ParentCategoryType,
  BrandResearchedCategoryChart,
  ResearchedChartVariant,
} from '../types';
import {
  STANDARD_CATEGORY_SIZING_TEMPLATES,
  CATEGORY_TEMPLATE_METADATA,
  normalizeToParentCategory,
} from '../utils/sizingStandards';
import { BRAND_RESEARCHED_CATEGORY_CHARTS } from '../data/mockData';

interface SizeChartModalProps {
  chart: FoundSizeChart | null;
  item?: MockProduct | null;
  isOpen: boolean;
  onClose: () => void;
  sizingConfig?: StoreSizingSystemConfig;
  onUpdateChart?: (updatedChart: FoundSizeChart) => void;
  brandCharts?: BrandResearchedCategoryChart[];
  initialCategory?: ParentCategoryType;
  initialVariantId?: string;
  isReadOnly?: boolean;
  onDeleteVariant?: (brand: string, parentCategory: ParentCategoryType, variantId: string) => void;
}

type ViewMode = 'table' | 'json';
type CategoryFilter = ParentCategoryType | 'ALL';

export function SizeChartModal({
  chart,
  item,
  isOpen,
  onClose,
  sizingConfig,
  brandCharts = BRAND_RESEARCHED_CATEGORY_CHARTS,
  initialCategory,
  initialVariantId,
  isReadOnly = false,
  onDeleteVariant,
}: SizeChartModalProps) {
  const isItemLevel = Boolean(item);
  const brandName = chart?.brand || item?.brand || 'Brand';

  // Compute sizing system from Store configuration
  const storeSelectedSystem: SizingSystemOption = useMemo(() => {
    if (!sizingConfig) return 'US';
    if (brandName && sizingConfig.brandOverrides[brandName]) {
      return sizingConfig.brandOverrides[brandName];
    }
    return sizingConfig.defaultSystem || 'US';
  }, [sizingConfig, brandName]);

  // View mode: Table view vs JSON
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Category filter state: specific parent category or 'ALL'
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('Tops');

  // Active variant mapping per category: Record<ParentCategoryType, string>
  const [selectedVariantIds, setSelectedVariantIds] = useState<Record<ParentCategoryType, string>>({
    Tops: '',
    'Outerwear / Jackets': '',
    Bottoms: '',
    'Dresses / Full-body': '',
    Footwear: '',
  });

  // Local editable store of variants per category
  const [categoryVariantsState, setCategoryVariantsState] = useState<
    Record<ParentCategoryType, ResearchedChartVariant[]>
  >({
    Tops: [],
    'Outerwear / Jackets': [],
    Bottoms: [],
    'Dresses / Full-body': [],
    Footwear: [],
  });

  // Deletion Confirmation Modal Target State
  const [deletingVariantTarget, setDeletingVariantTarget] = useState<{
    cat: ParentCategoryType;
    variant: ResearchedChartVariant;
  } | null>(null);

  // Copy state for JSON mode
  const [hasCopied, setHasCopied] = useState(false);

  // Helper to extract or generate default variants for a given category & brand
  const getInitialVariantsForCategory = (
    cat: ParentCategoryType,
    brand: string
  ): ResearchedChartVariant[] => {
    const brandLower = brand.toLowerCase().trim();

    // 1. Check in brandCharts matching brand & parentCategory
    const matchedChart = brandCharts.find(
      (c) => c.brand.toLowerCase() === brandLower && c.parentCategory === cat
    );

    if (matchedChart && matchedChart.variants && matchedChart.variants.length > 0) {
      return JSON.parse(JSON.stringify(matchedChart.variants));
    }

    // 2. Default standard variants: Men, Women, Unisex
    const normCat = normalizeToParentCategory(cat);
    const stdTemplate =
      STANDARD_CATEGORY_SIZING_TEMPLATES[normCat]?.[storeSelectedSystem] ||
      STANDARD_CATEGORY_SIZING_TEMPLATES.Tops.US;

    return [
      {
        id: `var-${brand.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${normCat.toLowerCase().replace(/[^a-z0-9]/g, '-')}-men`,
        variantName: 'Men Standard',
        parentCategory: normCat,
        headers: [...stdTemplate.headers],
        rows: JSON.parse(JSON.stringify(stdTemplate.rows)),
        confidence: 99.0,
        sourceUrl: `https://${brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.com/size-guide`,
        notes: `Official ${brand} standard specifications for ${normCat}`,
      },
      {
        id: `var-${brand.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${normCat.toLowerCase().replace(/[^a-z0-9]/g, '-')}-women`,
        variantName: 'Women Standard',
        parentCategory: normCat,
        headers: [...stdTemplate.headers],
        rows: JSON.parse(JSON.stringify(stdTemplate.rows)),
        confidence: 99.0,
        sourceUrl: `https://${brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.com/size-guide`,
        notes: `Official ${brand} women cut specifications for ${normCat}`,
      },
    ];
  };

  // Determine display categories
  const displayCategories: ParentCategoryType[] = useMemo(() => {
    if (!chart) return ['Tops', 'Bottoms', 'Footwear'];

    const setCats = new Set<ParentCategoryType>();
    (chart.categories || []).forEach((c) => {
      setCats.add(normalizeToParentCategory(c));
    });

    if (item?.parentCategory) {
      setCats.add(item.parentCategory);
    }

    if (initialCategory) {
      setCats.add(initialCategory);
    }

    if (setCats.size === 0) {
      setCats.add('Tops');
      setCats.add('Bottoms');
      setCats.add('Footwear');
    }

    return Array.from(setCats);
  }, [chart, item, initialCategory]);

  // Synchronize initial state when chart/item opens
  useEffect(() => {
    if (chart && isOpen) {
      const allParentCats: ParentCategoryType[] = [
        'Tops',
        'Outerwear / Jackets',
        'Bottoms',
        'Dresses / Full-body',
        'Footwear',
      ];

      const newVariantsMap: Record<ParentCategoryType, ResearchedChartVariant[]> = {
        Tops: [],
        'Outerwear / Jackets': [],
        Bottoms: [],
        'Dresses / Full-body': [],
        Footwear: [],
      };

      const newSelectedMap: Record<ParentCategoryType, string> = {
        Tops: '',
        'Outerwear / Jackets': '',
        Bottoms: '',
        'Dresses / Full-body': '',
        Footwear: '',
      };

      allParentCats.forEach((cat) => {
        const variants = getInitialVariantsForCategory(cat, brandName);
        newVariantsMap[cat] = variants;

        if (cat === initialCategory && initialVariantId) {
          const found = variants.find((v) => v.id === initialVariantId);
          newSelectedMap[cat] = found ? found.id : variants[0]?.id || '';
        } else {
          newSelectedMap[cat] = variants[0]?.id || '';
        }
      });

      if (initialCategory) {
        setSelectedCategory(initialCategory);
      } else if (item?.parentCategory) {
        setSelectedCategory(item.parentCategory);
      } else if (displayCategories.length > 0) {
        setSelectedCategory(displayCategories[0]);
      }

      setCategoryVariantsState(newVariantsMap);
      setSelectedVariantIds(newSelectedMap);
    }
  }, [chart, item, isOpen, storeSelectedSystem, brandName, initialCategory, initialVariantId]);

  // Active Category & Active Variant
  const currentActiveCategory: ParentCategoryType =
    selectedCategory === 'ALL' ? displayCategories[0] || 'Tops' : selectedCategory;

  const currentCategoryVariants = categoryVariantsState[currentActiveCategory] || [];
  const currentActiveVariantId =
    selectedVariantIds[currentActiveCategory] || currentCategoryVariants[0]?.id || '';

  const currentActiveVariant =
    currentCategoryVariants.find((v) => v.id === currentActiveVariantId) ||
    currentCategoryVariants[0];

  // Handler for switching active variant in a category
  const handleSelectVariant = (cat: ParentCategoryType, variantId: string) => {
    setSelectedVariantIds((prev) => ({
      ...prev,
      [cat]: variantId,
    }));
  };

  // Handler for cell changes
  const handleCellChange = (
    cat: ParentCategoryType,
    variantId: string,
    rowIndex: number,
    columnKey: string,
    value: string
  ) => {
    setCategoryVariantsState((prev) => {
      const catVariants = prev[cat] || [];
      const updated = catVariants.map((v) => {
        if (v.id === variantId) {
          const updatedRows = [...v.rows];
          updatedRows[rowIndex] = {
            ...updatedRows[rowIndex],
            [columnKey]: value,
          };
          return { ...v, rows: updatedRows };
        }
        return v;
      });
      return { ...prev, [cat]: updated };
    });
  };

  // Handler for adding a row
  const handleAddRow = (cat: ParentCategoryType, variantId: string) => {
    setCategoryVariantsState((prev) => {
      const catVariants = prev[cat] || [];
      const updated = catVariants.map((v) => {
        if (v.id === variantId) {
          const newRow: Record<string, string> = {};
          v.headers.forEach((h, idx) => {
            newRow[h] = idx === 0 ? 'Custom' : '';
          });
          return { ...v, rows: [...v.rows, newRow] };
        }
        return v;
      });
      return { ...prev, [cat]: updated };
    });
  };

  // Handler for deleting a row
  const handleDeleteRow = (
    cat: ParentCategoryType,
    variantId: string,
    rowIndex: number
  ) => {
    setCategoryVariantsState((prev) => {
      const catVariants = prev[cat] || [];
      const updated = catVariants.map((v) => {
        if (v.id === variantId) {
          if (v.rows.length <= 1) return v;
          return {
            ...v,
            rows: v.rows.filter((_, idx) => idx !== rowIndex),
          };
        }
        return v;
      });
      return { ...prev, [cat]: updated };
    });
  };

  // Handler for permanently deleting a variant table
  const handleConfirmDeleteVariant = () => {
    if (!deletingVariantTarget) return;
    const { cat, variant } = deletingVariantTarget;

    setCategoryVariantsState((prev) => {
      const currentList = prev[cat] || [];
      const filtered = currentList.filter((v) => v.id !== variant.id);

      if (filtered.length === 0) {
        const normCat = normalizeToParentCategory(cat);
        const stdTemplate =
          STANDARD_CATEGORY_SIZING_TEMPLATES[normCat]?.[storeSelectedSystem] ||
          STANDARD_CATEGORY_SIZING_TEMPLATES.Tops.US;
        filtered.push({
          id: `var-${brandName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${normCat.toLowerCase()}-standard`,
          variantName: 'Standard Fit',
          parentCategory: normCat,
          headers: [...stdTemplate.headers],
          rows: JSON.parse(JSON.stringify(stdTemplate.rows)),
          confidence: 99.0,
          notes: `Default standard sizing for ${cat}`,
        });
      }

      setSelectedVariantIds((sPrev) => ({
        ...sPrev,
        [cat]: filtered[0]?.id || '',
      }));

      return {
        ...prev,
        [cat]: filtered,
      };
    });

    if (onDeleteVariant) {
      onDeleteVariant(brandName, cat, variant.id);
    }

    setDeletingVariantTarget(null);
  };

  // Categories to render based on the category filter
  const categoriesToRender: ParentCategoryType[] =
    selectedCategory === 'ALL'
      ? displayCategories
      : [selectedCategory];

  // Prepare JSON Schema
  const currentJsonData = useMemo(() => {
    const variant = currentActiveVariant;
    return {
      brand: brandName,
      parent_category: currentActiveCategory,
      active_variant: variant?.variantName || 'Standard',
      sizing_system: storeSelectedSystem,
      confidence_score: variant?.confidence || chart?.confidence || 99.0,
      total_variants: currentCategoryVariants.length,
      headers: variant?.headers || [],
      size_chart: variant?.rows || [],
    };
  }, [
    brandName,
    currentActiveCategory,
    currentActiveVariant,
    currentCategoryVariants,
    storeSelectedSystem,
    chart,
  ]);

  const activeJsonString = JSON.stringify(currentJsonData, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(activeJsonString);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  if (!isOpen || !chart) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* ================= MODAL TOP HEADER ================= */}
        <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-xl font-bold text-slate-900">{brandName}</h3>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                Size Guide
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {chart.confidence}% Match
              </span>
              {isItemLevel && item && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  SKU: {item.sku}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Official sizing chart matrix for {brandName}. Switch variants or parent categories below.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= TOOLBAR: CATEGORIES & SIZING SYSTEM ================= */}
        <div className="px-6 py-3 bg-purple-50/70 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs flex-shrink-0">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-600 font-bold mr-1">Category:</span>

            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
              }`}
            >
              Show All ({displayCategories.length})
            </button>

            {displayCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Right Tools: Sizing System & View Toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-semibold">Store Size:</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-white text-purple-900 border border-purple-200 shadow-2xs">
                <Sliders className="w-3 h-3 text-purple-600" />
                {storeSelectedSystem} Sizing
              </span>
            </div>

            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3 h-3 text-purple-600" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'json'
                    ? 'bg-slate-900 text-pink-300 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3 h-3 text-pink-400" />
                <span>JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= MODAL BODY CONTENT ================= */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {viewMode === 'table' ? (
            <div className="space-y-6">
              {categoriesToRender.map((cat) => {
                const variants = categoryVariantsState[cat] || [];
                const activeVId = selectedVariantIds[cat] || variants[0]?.id || '';
                const activeVariant = variants.find((v) => v.id === activeVId) || variants[0];

                if (!activeVariant) return null;

                return (
                  <div key={cat} className="space-y-3">
                    {/* Category Header with Variant Dropdown & Add Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                      <h4 className="text-xs font-bold text-slate-900">
                        {brandName} — {cat} Sizing Matrix
                      </h4>

                      <div className="flex items-center gap-2">
                        {/* Type of Size Chart Dropdown */}
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor={`variant-select-${cat}`}
                            className="text-xs font-semibold text-slate-600"
                          >
                            Variant:
                          </label>
                          <div className="relative">
                            <select
                              id={`variant-select-${cat}`}
                              value={activeVId}
                              onChange={(e) => {
                                if (e.target.value === '__delete_variant__') {
                                  setDeletingVariantTarget({ cat, variant: activeVariant });
                                } else {
                                  handleSelectVariant(cat, e.target.value);
                                }
                              }}
                              className="appearance-none pl-2.5 pr-7 py-1 text-xs font-bold bg-white text-slate-900 border border-purple-300 rounded-lg shadow-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer hover:border-purple-500 transition-colors"
                            >
                              {variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.variantName}
                                </option>
                              ))}
                              {!isReadOnly && variants.length > 0 && (
                                <option value="__delete_variant__" className="text-red-600 font-bold">
                                  🗑️ Delete '{activeVariant.variantName}' table...
                                </option>
                              )}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-purple-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {!isReadOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => setDeletingVariantTarget({ cat, variant: activeVariant })}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                              title="Delete this variation table"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAddRow(cat, activeVariant.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Size Row
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Subtle Notes / Source bar if available */}
                    {activeVariant.notes && (
                      <div className="p-2 rounded-lg bg-purple-50/60 border border-purple-200/70 text-[11px] text-purple-900 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                          <span className="truncate">{activeVariant.notes}</span>
                        </div>
                        {activeVariant.sourceUrl && (
                          <a
                            href={activeVariant.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold text-purple-700 hover:underline flex items-center gap-1 flex-shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Official Source
                          </a>
                        )}
                      </div>
                    )}

                    {/* Standard Sizing Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            {activeVariant.headers.map((header) => {
                              const isReq =
                                header.toLowerCase().includes('size') ||
                                (cat === 'Tops' && header.toLowerCase().includes('chest')) ||
                                (cat === 'Outerwear / Jackets' && header.toLowerCase().includes('chest')) ||
                                (cat === 'Bottoms' && header.toLowerCase().includes('waist')) ||
                                (cat === 'Dresses / Full-body' && header.toLowerCase().includes('chest')) ||
                                cat === 'Footwear';

                              return (
                                <th key={header} className="px-3 py-2.5 font-bold">
                                  <div className="flex items-center gap-1">
                                    <span>{header}</span>
                                    {!isReadOnly && (
                                      isReq ? (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-purple-100 text-purple-800 font-mono font-bold">
                                          Req
                                        </span>
                                      ) : (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200/80 text-slate-600 font-mono font-normal">
                                          Opt
                                        </span>
                                      )
                                    )}
                                  </div>
                                </th>
                              );
                            })}
                            {!isReadOnly && <th className="px-3 py-2.5 w-12 text-center">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {activeVariant.rows.map((row, rIdx) => {
                            const firstHeader = activeVariant.headers[0];
                            const rowSize = (row[firstHeader] || '').trim().toUpperCase();
                            const isStoreSize =
                              isReadOnly && item?.sizes && item.sizes.length > 0
                                ? item.sizes.some((s) => {
                                    const su = s.trim().toUpperCase();
                                    return su === rowSize || rowSize.includes(su) || su.includes(rowSize);
                                  })
                                : true;

                            return (
                              <tr
                                key={rIdx}
                                className={`transition-all ${
                                  isReadOnly && !isStoreSize
                                    ? 'opacity-35 blur-[0.6px] hover:opacity-90 hover:blur-none bg-slate-50/40'
                                    : 'hover:bg-slate-50/80'
                                }`}
                              >
                                {activeVariant.headers.map((header, cIdx) => (
                                  <td key={header} className="p-1.5">
                                    {isReadOnly ? (
                                      <div className="flex items-center justify-between px-2.5 py-1">
                                        <span
                                          className={`text-xs ${
                                            cIdx === 0
                                              ? 'font-extrabold text-slate-900'
                                              : 'text-slate-700 font-medium'
                                          }`}
                                        >
                                          {row[header] || '—'}
                                        </span>
                                        {cIdx === 0 && isReadOnly && item?.sizes && (
                                          isStoreSize ? (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                              In Store
                                            </span>
                                          ) : (
                                            <span className="text-[9px] text-slate-400 italic">
                                              unstocked
                                            </span>
                                          )
                                        )}
                                      </div>
                                    ) : (
                                      <input
                                        type="text"
                                        value={row[header] || ''}
                                        onChange={(e) =>
                                          handleCellChange(
                                            cat,
                                            activeVariant.id,
                                            rIdx,
                                            header,
                                            e.target.value
                                          )
                                        }
                                        className={`w-full px-2.5 py-1 text-xs rounded-md border border-slate-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-hidden ${
                                          cIdx === 0
                                            ? 'font-bold text-slate-900 bg-slate-50/60'
                                            : 'text-slate-700 bg-white'
                                        }`}
                                      />
                                    )}
                                  </td>
                                ))}
                                {!isReadOnly && (
                                  <td className="p-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteRow(cat, activeVariant.id, rIdx)
                                      }
                                      disabled={activeVariant.rows.length <= 1}
                                      className={`p-1 rounded-md transition-colors ${
                                        activeVariant.rows.length <= 1
                                          ? 'text-slate-300 cursor-not-allowed'
                                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                                      }`}
                                      title="Delete size row"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* JSON View */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-100/80 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-800">
                    JSON Schema: {brandName} — {currentActiveCategory} ({currentActiveVariant?.variantName})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition-all cursor-pointer shadow-2xs"
                >
                  {hasCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-purple-600" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-[#0b0f19] shadow-inner text-xs font-mono">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
                  <span className="text-pink-400 font-semibold flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-purple-400" />
                    {brandName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_
                    {String(selectedCategory).toLowerCase().replace(/[^a-z0-9]/g, '_')}_
                    {currentActiveVariant?.variantName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'chart'}.json
                  </span>
                  <span className="text-slate-500">application/json</span>
                </div>
                <pre className="p-4 text-emerald-400 overflow-x-auto max-h-[380px] overflow-y-auto scrollbar-thin text-xs leading-relaxed font-mono selection:bg-purple-800 selection:text-white">
                  <code>{activeJsonString}</code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-500">
            Size chart configured for <strong>{brandName}</strong> across verified category specifications.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
            >
              Done &amp; Close
            </button>
          </div>
        </div>
      </div>

      {/* ================= DELETE VARIATION TABLE CONFIRMATION POPUP ================= */}
      {deletingVariantTarget && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl shadow-2xl border border-red-100 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-red-100 text-red-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-slate-900">
                  Delete Variation Table?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to permanently delete the <strong className="text-slate-900">"{deletingVariantTarget.variant.variantName}"</strong> variation table for <strong className="text-purple-900">{deletingVariantTarget.cat}</strong>?
                </p>
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 mt-2 font-medium">
                  ⚠️ This will completely remove this variation table and mature this step for the current category.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingVariantTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteVariant}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer shadow-xs"
              >
                Confirm &amp; Delete Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
