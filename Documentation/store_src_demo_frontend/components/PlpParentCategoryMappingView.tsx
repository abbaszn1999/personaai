import React, { useState, useMemo } from 'react';
import {
  Layers,
  Shirt,
  Shield,
  Footprints,
  Sparkles,
  Search,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Wand2,
  ChevronDown,
  Store,
  FolderTree,
} from 'lucide-react';
import { ParentCategoryType, PlatformType } from '../types';
import {
  STANDARD_PARENT_CATEGORIES,
  CATEGORY_TEMPLATE_METADATA,
} from '../utils/sizingStandards';

export interface SelectedPlpItem {
  id: string;
  path: string;
  title: string;
  parentGroup?: string;
  subGroup?: string;
  skuCount: number;
  sourceType: 'woocommerce' | 'shopify';
  collectionOrCategorySource: string;
  parentCategory: ParentCategoryType;
  aiConfidence?: number;
  isCustomMapped?: boolean;
}

interface PlpParentCategoryMappingViewProps {
  platform: PlatformType;
  selectedPlps: SelectedPlpItem[];
  onUpdatePlpCategory: (plpId: string, parentCategory: ParentCategoryType) => void;
  onBatchUpdateCategory: (plpIds: string[], parentCategory: ParentCategoryType) => void;
  onAutoMapAllWithAi: () => void;
  onBackToTree: () => void;
  onConfirmAndContinue: () => void;
}

export function PlpParentCategoryMappingView({
  platform,
  selectedPlps,
  onUpdatePlpCategory,
  onBatchUpdateCategory,
  onAutoMapAllWithAi,
  onBackToTree,
  onConfirmAndContinue,
}: PlpParentCategoryMappingViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [parentCatFilter, setParentCatFilter] = useState<'all' | ParentCategoryType>('all');
  const [selectedPlpRowIds, setSelectedPlpRowIds] = useState<string[]>([]);
  const [batchTargetCategory, setBatchTargetCategory] = useState<ParentCategoryType>('Tops');
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Category statistics across the 5 standard categories
  const categoryCounts = useMemo(() => {
    const counts: Record<ParentCategoryType, number> = {
      Tops: 0,
      'Outerwear / Jackets': 0,
      Bottoms: 0,
      'Dresses / Full-body': 0,
      Footwear: 0,
    };
    selectedPlps.forEach((p) => {
      if (counts[p.parentCategory] !== undefined) {
        counts[p.parentCategory] = (counts[p.parentCategory] || 0) + 1;
      }
    });
    return counts;
  }, [selectedPlps]);

  const totalSkus = useMemo(() => {
    return selectedPlps.reduce((acc, p) => acc + (p.skuCount || 0), 0);
  }, [selectedPlps]);

  // Filtered PLPs
  const filteredPlps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return selectedPlps.filter((plp) => {
      if (parentCatFilter !== 'all' && plp.parentCategory !== parentCatFilter) {
        return false;
      }
      if (q) {
        const matchesTitle = plp.title.toLowerCase().includes(q);
        const matchesPath = plp.path.toLowerCase().includes(q);
        const matchesCategory = plp.parentCategory.toLowerCase().includes(q);
        const matchesSource = plp.collectionOrCategorySource.toLowerCase().includes(q);
        return matchesTitle || matchesPath || matchesCategory || matchesSource;
      }
      return true;
    });
  }, [selectedPlps, parentCatFilter, searchQuery]);

  // Row selection handlers
  const handleToggleRowSelect = (id: string) => {
    setSelectedPlpRowIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllVisible = () => {
    const visibleIds = filteredPlps.map((p) => p.id);
    const allSelected = visibleIds.every((id) => selectedPlpRowIds.includes(id));
    if (allSelected) {
      setSelectedPlpRowIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedPlpRowIds(Array.from(new Set([...selectedPlpRowIds, ...visibleIds])));
    }
  };

  // Run AI auto-classify with animation
  const handleTriggerAiClassification = () => {
    setIsAiScanning(true);
    setTimeout(() => {
      onAutoMapAllWithAi();
      setIsAiScanning(false);
      setToastMessage(`Gemini AI matched ${selectedPlps.length} PLPs to standard sizing categories.`);
      setTimeout(() => setToastMessage(null), 4000);
    }, 500);
  };

  // Apply batch category to selected rows
  const handleApplyBatchCategory = () => {
    if (selectedPlpRowIds.length === 0) return;
    onBatchUpdateCategory(selectedPlpRowIds, batchTargetCategory);
    setToastMessage(`Assigned ${selectedPlpRowIds.length} PLPs to "${batchTargetCategory}".`);
    setSelectedPlpRowIds([]);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const getCategoryBadge = (category: ParentCategoryType) => {
    switch (category) {
      case 'Tops':
        return {
          bg: 'bg-indigo-50 text-indigo-900 border-indigo-200',
          badge: 'bg-indigo-600 text-white',
          icon: <Shirt className="w-4 h-4 text-indigo-600" />,
        };
      case 'Outerwear / Jackets':
        return {
          bg: 'bg-cyan-50 text-cyan-900 border-cyan-200',
          badge: 'bg-cyan-600 text-white',
          icon: <Shield className="w-4 h-4 text-cyan-600" />,
        };
      case 'Bottoms':
        return {
          bg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
          badge: 'bg-emerald-600 text-white',
          icon: <Layers className="w-4 h-4 text-emerald-600" />,
        };
      case 'Dresses / Full-body':
        return {
          bg: 'bg-purple-50 text-purple-900 border-purple-200',
          badge: 'bg-purple-600 text-white',
          icon: <Sparkles className="w-4 h-4 text-purple-600" />,
        };
      case 'Footwear':
        return {
          bg: 'bg-amber-50 text-amber-900 border-amber-200',
          badge: 'bg-amber-600 text-white',
          icon: <Footprints className="w-4 h-4 text-amber-600" />,
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-900 border-slate-200',
          badge: 'bg-slate-600 text-white',
          icon: <Shirt className="w-4 h-4 text-slate-600" />,
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast notification */}
      {toastMessage && (
        <div className="p-3 bg-purple-900 text-white text-xs font-semibold rounded-xl flex items-center justify-between gap-2 shadow-lg animate-in fade-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-purple-300 hover:text-white text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Header Card with Breadcrumb Stepper */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
        {/* Step Indicator Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Step 1 Pill */}
            <button
              type="button"
              onClick={onBackToTree}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer border border-slate-200"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Step 1: Hierarchy Scope</span>
              <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded font-mono">
                {selectedPlps.length} Selected
              </span>
            </button>

            <span className="text-slate-300 font-bold">&rarr;</span>

            {/* Step 2 Pill (Active) */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
              <span>Step 2: Map PLPs to 5 Parent Categories</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{selectedPlps.length} PLPs</span>
            <span>&bull;</span>
            <span className="font-semibold text-slate-700">{totalSkus.toLocaleString()} Total SKUs</span>
            <span>&bull;</span>
            <span className="capitalize px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-600">
              {platform === 'shopify' ? 'Shopify Collections' : 'WooCommerce Taxonomy'}
            </span>
          </div>
        </div>

        {/* Title & Actions */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Map Selected PLPs to the 5 Parent Sizing Categories</span>
            </h1>
            <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
              Every selected category and collection (PLP) is classified into one of the 5 parent categories (Tops, Outerwear / Jackets, Bottoms, Dresses / Full-body, Footwear). This establishes the required sizing measurement fields and templates.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleTriggerAiClassification}
              disabled={isAiScanning}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200/90 shadow-2xs transition-all cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <Wand2 className={`w-3.5 h-3.5 text-purple-600 ${isAiScanning ? 'animate-spin' : ''}`} />
              <span>{isAiScanning ? 'Classifying with AI...' : 'Auto-Classify All with AI'}</span>
            </button>
          </div>
        </div>

        {/* 5 Standard Parent Categories Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {STANDARD_PARENT_CATEGORIES.map((category) => {
            const count = categoryCounts[category] || 0;
            const meta = CATEGORY_TEMPLATE_METADATA[category];
            const badge = getCategoryBadge(category);
            const isSelectedFilter = parentCatFilter === category;

            return (
              <button
                key={category}
                type="button"
                onClick={() => setParentCatFilter(isSelectedFilter ? 'all' : category)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                  isSelectedFilter
                    ? 'ring-2 ring-purple-600 shadow-xs ' + badge.bg
                    : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="p-1.5 rounded-lg bg-white border border-slate-200/60 shadow-2xs">
                    {badge.icon}
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      count > 0 ? 'bg-purple-100 text-purple-900' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{category}</h4>
                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                  Req: {meta.requiredFields.join(', ')}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action & Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input & Category Filters */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search selected PLP, path, or collection..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white text-slate-800"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setParentCatFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                parentCatFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({selectedPlps.length})
            </button>
          </div>
        </div>

        {/* Batch Operations */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {selectedPlpRowIds.length > 0 && (
            <div className="flex items-center gap-1.5 bg-purple-50 p-1 rounded-lg border border-purple-200 text-xs">
              <span className="font-semibold text-purple-900 px-1.5">
                {selectedPlpRowIds.length} selected:
              </span>
              <select
                value={batchTargetCategory}
                onChange={(e) => setBatchTargetCategory(e.target.value as ParentCategoryType)}
                className="bg-white text-slate-800 text-xs font-semibold px-2 py-1 rounded border border-purple-200 focus:outline-none cursor-pointer"
              >
                {STANDARD_PARENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyBatchCategory}
                className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold cursor-pointer transition-colors"
              >
                Apply
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleSelectAllVisible}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
          >
            {filteredPlps.every((p) => selectedPlpRowIds.includes(p.id))
              ? 'Deselect Visible'
              : 'Select Visible'}
          </button>
        </div>
      </div>

      {/* Mappings Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-3.5 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredPlps.length > 0 &&
                      filteredPlps.every((p) => selectedPlpRowIds.includes(p.id))
                    }
                    onChange={handleToggleSelectAllVisible}
                    className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </th>
                <th className="px-3.5 py-3">Selected PLP / Category Path</th>
                <th className="px-3.5 py-3">Catalog Source</th>
                <th className="px-3.5 py-3">SKU Count</th>
                <th className="px-3.5 py-3 min-w-[220px]">Mapped Parent Category</th>
                <th className="px-3.5 py-3">Match Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPlps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    <p className="font-semibold text-slate-600 text-sm">No matching PLPs found</p>
                    <p className="text-xs mt-1">Try clearing search or filter query.</p>
                  </td>
                </tr>
              ) : (
                filteredPlps.map((plp) => {
                  const isSelected = selectedPlpRowIds.includes(plp.id);
                  const badge = getCategoryBadge(plp.parentCategory);

                  return (
                    <tr
                      key={plp.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-purple-50/40' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3.5 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRowSelect(plp.id)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>

                      {/* PLP Path & Title */}
                      <td className="px-3.5 py-3 min-w-[240px]">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{plp.title}</span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                            <span>{plp.path}</span>
                          </p>
                        </div>
                      </td>

                      {/* Catalog Source */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {platform === 'shopify' ? (
                            <Store className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <FolderTree className="w-3 h-3 text-purple-600" />
                          )}
                          <span className="truncate max-w-[140px]" title={plp.collectionOrCategorySource}>
                            {plp.collectionOrCategorySource}
                          </span>
                        </span>
                      </td>

                      {/* SKU Count */}
                      <td className="px-3.5 py-3 font-semibold text-slate-700 whitespace-nowrap">
                        {plp.skuCount.toLocaleString()} units
                      </td>

                      {/* Parent Category Interactive Selector (5 standard categories only) */}
                      <td className="px-3.5 py-3 whitespace-nowrap min-w-[220px]">
                        <div className="relative inline-block w-full">
                          <select
                            value={plp.parentCategory}
                            onChange={(e) => onUpdatePlpCategory(plp.id, e.target.value as ParentCategoryType)}
                            className={`w-full appearance-none pl-8 pr-7 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400 ${badge.bg}`}
                          >
                            {STANDARD_PARENT_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat} className="bg-white text-slate-900 font-normal">
                                {cat}
                              </option>
                            ))}
                          </select>
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                            {badge.icon}
                          </div>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </td>

                      {/* AI Match Confidence */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>AI Auto-Matched</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToTree}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Hierarchy &amp; Tree Scope</span>
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-600">
            <strong>{selectedPlps.length}</strong> PLPs mapped across the <strong>5 Parent Categories</strong>.
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onConfirmAndContinue}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Confirm PLP Mappings &amp; Continue to Setup (Stage 1)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
