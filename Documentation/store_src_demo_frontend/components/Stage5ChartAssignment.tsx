import { useState, useMemo } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  ChevronDown,
  Package,
  Eye,
  Check,
  AlertTriangle,
  Plus,
  Ban,
  X,
  PlusCircle,
  FileSpreadsheet,
} from 'lucide-react';
import {
  PathChartAssignment,
  BrandResearchedCategoryChart,
  ResearchedChartVariant,
  MockProduct,
  StandardParentCategoryType,
  StoreSizingSystemConfig,
  SizingSystemOption,
} from '../types';
import {
  STANDARD_PARENT_CATEGORIES,
  getAvailableVariantsForBrandAndCategory,
  STANDARD_CATEGORY_SIZING_TEMPLATES,
} from '../utils/sizingStandards';

interface Stage5ChartAssignmentProps {
  pathAssignments: PathChartAssignment[];
  brandCharts: BrandResearchedCategoryChart[];
  products: MockProduct[];
  sizingConfig?: StoreSizingSystemConfig;
  onUpdatePathAssignment: (id: string, variantId: string | null, variantName: string) => void;
  onAddResearchedVariant?: (
    brand: string,
    parentCategory: StandardParentCategoryType,
    variant: ResearchedChartVariant
  ) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function Stage5ChartAssignment({
  pathAssignments,
  brandCharts,
  products,
  sizingConfig,
  onUpdatePathAssignment,
  onAddResearchedVariant,
  onPrev,
  onNext,
}: Stage5ChartAssignmentProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('all');
  const [selectedParentFilter, setSelectedParentFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    'all' | 'assigned' | 'unassigned' | 'auto' | 'custom'
  >('all');

  // Inspection Modals
  const [inspectingAssignment, setInspectingAssignment] = useState<PathChartAssignment | null>(null);
  const [previewingVariant, setPreviewingVariant] = useState<{
    brand: string;
    parentCategory: string;
    variant: ResearchedChartVariant;
  } | null>(null);

  // Make Template Modal State
  const [templateModalAssignment, setTemplateModalAssignment] = useState<PathChartAssignment | null>(null);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [customCategoryType, setCustomCategoryType] = useState<StandardParentCategoryType>('Tops');
  const [customSystem, setCustomSystem] = useState<SizingSystemOption>(sizingConfig?.defaultSystem || 'US');
  const [customHeaders, setCustomHeaders] = useState<string[]>(['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Length (cm)']);
  const [customRows, setCustomRows] = useState<Record<string, string>[]>([
    { Size: 'S', 'Chest Min (cm)': '88', 'Chest Max (cm)': '96', 'Length (cm)': '70' },
    { Size: 'M', 'Chest Min (cm)': '96', 'Chest Max (cm)': '104', 'Length (cm)': '72' },
    { Size: 'L', 'Chest Min (cm)': '104', 'Chest Max (cm)': '112', 'Length (cm)': '74' },
    { Size: 'XL', 'Chest Min (cm)': '112', 'Chest Max (cm)': '124', 'Length (cm)': '76' },
  ]);

  // Extract unique brands from assignments
  const uniqueBrands = useMemo(() => {
    const brandsSet = new Set(pathAssignments.map((a) => a.brand));
    return Array.from(brandsSet).sort();
  }, [pathAssignments]);

  // Check unassigned counts
  const unassignedAssignments = useMemo(() => {
    return pathAssignments.filter(
      (a) =>
        a.assignedVariantId === null ||
        a.status === 'unassigned' ||
        a.assignedVariantName.toLowerCase().includes('unassigned')
    );
  }, [pathAssignments]);

  const unassignedSkuCount = useMemo(() => {
    return unassignedAssignments.reduce((acc, curr) => acc + curr.skuCount, 0);
  }, [unassignedAssignments]);

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    return pathAssignments.filter((assignment) => {
      const isUnassigned =
        assignment.assignedVariantId === null ||
        assignment.status === 'unassigned' ||
        assignment.assignedVariantName.toLowerCase().includes('unassigned');

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesBrand = assignment.brand.toLowerCase().includes(q);
        const matchesPath = assignment.merchantPath.toLowerCase().includes(q);
        const matchesParent = assignment.parentCategory.toLowerCase().includes(q);
        const matchesVariant = assignment.assignedVariantName.toLowerCase().includes(q);
        if (!matchesBrand && !matchesPath && !matchesParent && !matchesVariant) {
          return false;
        }
      }

      // Brand filter
      if (selectedBrandFilter !== 'all' && assignment.brand !== selectedBrandFilter) {
        return false;
      }

      // Parent category filter
      if (selectedParentFilter !== 'all' && assignment.parentCategory !== selectedParentFilter) {
        return false;
      }

      // Status filter
      if (selectedStatusFilter === 'unassigned' && !isUnassigned) {
        return false;
      }
      if (selectedStatusFilter === 'assigned' && isUnassigned) {
        return false;
      }
      if (selectedStatusFilter === 'auto' && (isUnassigned || assignment.isAutoMatched === false)) {
        return false;
      }
      if (selectedStatusFilter === 'custom' && (isUnassigned || assignment.isAutoMatched !== false)) {
        return false;
      }

      return true;
    });
  }, [pathAssignments, searchQuery, selectedBrandFilter, selectedParentFilter, selectedStatusFilter]);

  // Aggregate stats
  const totalPaths = pathAssignments.length;
  const assignedCount = pathAssignments.filter(
    (a) =>
      a.assignedVariantId !== null &&
      a.status !== 'unassigned' &&
      !a.assignedVariantName.toLowerCase().includes('unassigned')
  ).length;

  const totalSkusGoverned = useMemo(() => {
    return pathAssignments
      .filter(
        (a) =>
          a.assignedVariantId !== null &&
          a.status !== 'unassigned' &&
          !a.assignedVariantName.toLowerCase().includes('unassigned')
      )
      .reduce((acc, curr) => acc + curr.skuCount, 0);
  }, [pathAssignments]);

  // Helper to find matching products for an assignment
  const getMatchingProducts = (assignment: PathChartAssignment) => {
    return products.filter((p) => {
      const matchBrand = (p.brand || 'Unbranded / No Brand').toLowerCase() === assignment.brand.toLowerCase();
      const matchPath = (p.category || '').toLowerCase() === assignment.merchantPath.toLowerCase();
      const matchParent = p.parentCategory === assignment.parentCategory;
      return (matchBrand && matchPath) || (matchBrand && matchParent);
    });
  };

  // Helper to get variants for a specific assignment
  const getVariantsForAssignment = (assignment: PathChartAssignment): ResearchedChartVariant[] => {
    return getAvailableVariantsForBrandAndCategory(
      assignment.brand,
      assignment.parentCategory,
      brandCharts
    );
  };

  // Handle previewing chart table
  const handleOpenVariantPreview = (assignment: PathChartAssignment) => {
    const variants = getVariantsForAssignment(assignment);
    let selectedVariant =
      variants.find((v) => v.id === assignment.assignedVariantId) ||
      variants.find((v) => v.variantName.toLowerCase() === assignment.assignedVariantName.toLowerCase()) ||
      variants[0];

    if (!selectedVariant) {
      const baseTemplate =
        STANDARD_CATEGORY_SIZING_TEMPLATES[assignment.parentCategory]?.[sizingConfig?.defaultSystem || 'US'] ||
        STANDARD_CATEGORY_SIZING_TEMPLATES.Tops.US;
      selectedVariant = {
        id: `template-${assignment.brand}-${assignment.parentCategory}`,
        variantName: `${assignment.brand || 'Store'} ${assignment.parentCategory} Template`,
        parentCategory: assignment.parentCategory,
        headers: [...baseTemplate.headers],
        rows: JSON.parse(JSON.stringify(baseTemplate.rows)),
        confidence: 100,
        notes: `Standard sizing matrix for ${assignment.brand} · ${assignment.merchantPath}`,
      };
    }

    setPreviewingVariant({
      brand: assignment.brand,
      parentCategory: assignment.parentCategory,
      variant: selectedVariant,
    });
  };

  // Open Template Modal
  const handleOpenMakeTemplateModal = (assignment: PathChartAssignment) => {
    setTemplateModalAssignment(assignment);
    setCustomTemplateName(`${assignment.brand} ${assignment.parentCategory} Fit`);
    setCustomCategoryType(assignment.parentCategory);

    const baseTemplate =
      STANDARD_CATEGORY_SIZING_TEMPLATES[assignment.parentCategory]?.[sizingConfig?.defaultSystem || 'US'] ||
      STANDARD_CATEGORY_SIZING_TEMPLATES.Tops.US;

    setCustomHeaders([...baseTemplate.headers]);
    setCustomRows(JSON.parse(JSON.stringify(baseTemplate.rows)));
  };

  // Switch template base in modal
  const handleSelectTemplateCategory = (cat: StandardParentCategoryType, sys: SizingSystemOption) => {
    setCustomCategoryType(cat);
    setCustomSystem(sys);
    const baseTemplate =
      STANDARD_CATEGORY_SIZING_TEMPLATES[cat]?.[sys] ||
      STANDARD_CATEGORY_SIZING_TEMPLATES[cat]?.US ||
      STANDARD_CATEGORY_SIZING_TEMPLATES.Tops.US;
    setCustomHeaders([...baseTemplate.headers]);
    setCustomRows(JSON.parse(JSON.stringify(baseTemplate.rows)));
  };

  // Save Custom Template & Assign to Path
  const handleSaveAndAssignTemplate = () => {
    if (!templateModalAssignment || !customTemplateName.trim()) return;

    const newVariantId = `var-custom-${Date.now()}`;
    const newVariant: ResearchedChartVariant = {
      id: newVariantId,
      variantName: customTemplateName.trim(),
      parentCategory: customCategoryType,
      headers: customHeaders,
      rows: customRows,
      confidence: 99.0,
      notes: `Custom merchant sizing template for ${templateModalAssignment.merchantPath}`,
    };

    if (onAddResearchedVariant) {
      onAddResearchedVariant(
        templateModalAssignment.brand,
        templateModalAssignment.parentCategory,
        newVariant
      );
    }

    onUpdatePathAssignment(
      templateModalAssignment.id,
      newVariantId,
      newVariant.variantName
    );

    setTemplateModalAssignment(null);
  };

  // Auto-Match All with AI heuristic
  const handleAutoMatchAll = () => {
    pathAssignments.forEach((assignment) => {
      const variants = getVariantsForAssignment(assignment);
      if (variants.length > 0) {
        const pathLower = assignment.merchantPath.toLowerCase();
        let matched = variants[0];
        if (pathLower.includes('women') || pathLower.includes('woman') || pathLower.includes('female')) {
          matched = variants.find((v) => v.variantName.toLowerCase().includes('women')) || variants[0];
        } else if (pathLower.includes('men') && !pathLower.includes('women')) {
          matched = variants.find((v) => v.variantName.toLowerCase().includes('men')) || variants[0];
        } else if (pathLower.includes('unisex')) {
          matched = variants.find((v) => v.variantName.toLowerCase().includes('unisex')) || variants[0];
        }
        onUpdatePathAssignment(assignment.id, matched.id, matched.variantName);
      }
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header & Context */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 uppercase tracking-wider">
                Stage 5 of 6 · Mapping Rules
              </span>
              {unassignedAssignments.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  All Paths Governed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  {unassignedAssignments.length} Unassigned Path ({unassignedSkuCount} SKUs)
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Merchant Path → Size Chart Variant Assignment
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
              Map each <span className="font-semibold text-purple-900">Brand + Category Path</span> to its official sizing chart variant.
              All active SKUs under each path automatically inherit the assigned chart. If left unassigned or skipped, those SKUs will publish without a size chart widget.
            </p>
          </div>

          {/* Resolution Formula Key */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:min-w-[300px] shrink-0">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Path Resolution Architecture</span>
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-white p-2 rounded-lg border border-slate-200/90 shadow-2xs">
              <span className="text-purple-700">Brand</span>
              <span className="text-slate-400">+</span>
              <span className="text-blue-700">Category Path</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700">Assigned Variant</span>
            </div>
          </div>
        </div>

        {/* Aggregate Metric Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 block">Total Category Paths</span>
            <span className="text-lg font-black text-slate-900 mt-0.5 block">{totalPaths} Paths</span>
          </div>
          <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-100">
            <span className="text-[11px] font-semibold text-emerald-800 block">Chart Variants Assigned</span>
            <span className="text-lg font-black text-emerald-700 mt-0.5 block">{assignedCount} Assigned</span>
          </div>
          <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-200">
            <span className="text-[11px] font-semibold text-amber-800 block">Unassigned (No Chart)</span>
            <span className="text-lg font-black text-amber-700 mt-0.5 block">
              {unassignedAssignments.length} Paths ({unassignedSkuCount} SKUs)
            </span>
          </div>
          <div className="bg-blue-50/70 rounded-xl p-3 border border-blue-100">
            <span className="text-[11px] font-semibold text-blue-800 block">Active SKUs Inheriting</span>
            <span className="text-lg font-black text-blue-700 mt-0.5 block">{totalSkusGoverned} SKUs</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UNASSIGNED / SKIPPED NOTIFICATION HIGHLIGHT CALLOUT BANNER                 */}
      {/* ========================================================================= */}
      {unassignedAssignments.length > 0 && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4.5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-700 mt-0.5 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-amber-950">
                  Notification: {unassignedAssignments.length} Category Path ({unassignedSkuCount} SKUs) Has No Size Chart Assigned
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                SKUs under unassigned paths will <strong className="underline">NOT</strong> have a size chart widget published on your storefront.
                You can assign an official chart variant or create a custom sizing template for this path.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setSelectedStatusFilter('unassigned')}
              className="flex-1 md:flex-none px-3.5 py-2 rounded-xl text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-300 transition-colors cursor-pointer"
            >
              Filter Unassigned ({unassignedAssignments.length})
            </button>
            <button
              type="button"
              onClick={() => handleOpenMakeTemplateModal(unassignedAssignments[0])}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Make Template
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by brand, category path, or chart variant name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-slate-50/50 hover:bg-white"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleAutoMatchAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Auto-Match All with AI
            </button>
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          {/* Brand Filter */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span className="text-slate-400 text-[11px]">Brand:</span>
            <select
              value={selectedBrandFilter}
              onChange={(e) => setSelectedBrandFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 cursor-pointer"
            >
              <option value="all">All Brands ({uniqueBrands.length})</option>
              {uniqueBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Parent Family Filter */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span className="text-slate-400 text-[11px]">Parent Category:</span>
            <select
              value={selectedParentFilter}
              onChange={(e) => setSelectedParentFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 cursor-pointer"
            >
              <option value="all">All 5 Parent Families</option>
              {STANDARD_PARENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span className="text-slate-400 text-[11px]">Status:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 cursor-pointer"
            >
              <option value="all">All Statuses ({totalPaths})</option>
              <option value="assigned">Assigned ({assignedCount})</option>
              <option value="unassigned">⚠️ Unassigned / No Chart ({unassignedAssignments.length})</option>
              <option value="auto">AI Auto-Matched</option>
              <option value="custom">Merchant Overrides / Templates</option>
            </select>
          </div>

          {/* Active Filter Clear */}
          {(searchQuery || selectedBrandFilter !== 'all' || selectedParentFilter !== 'all' || selectedStatusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedBrandFilter('all');
                setSelectedParentFilter('all');
                setSelectedStatusFilter('all');
              }}
              className="text-xs text-purple-600 hover:text-purple-800 font-semibold px-2 py-1 ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Path Assignment Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
              <tr>
                <th className="px-5 py-3.5">Brand</th>
                <th className="px-5 py-3.5">Merchant Category Path</th>
                <th className="px-5 py-3.5">Parent Category</th>
                <th className="px-5 py-3.5">Assigned Chart Variant</th>
                <th className="px-5 py-3.5 text-center">SKUs Governed</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold">No category path assignments match your filters.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedBrandFilter('all');
                        setSelectedParentFilter('all');
                        setSelectedStatusFilter('all');
                      }}
                      className="mt-2 text-xs text-purple-600 hover:underline font-bold"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment) => {
                  const availableVariants = getVariantsForAssignment(assignment);
                  const isPrivateBrand =
                    assignment.brand.toLowerCase().includes('moustache') ||
                    assignment.brand.toLowerCase().includes('urban') ||
                    assignment.brand.toLowerCase().includes('denim') ||
                    assignment.brand.toLowerCase().includes('private');
                  const isNullBrand =
                    assignment.brand.toLowerCase().includes('null') ||
                    assignment.brand.toLowerCase().includes('no brand') ||
                    assignment.brand.toLowerCase().includes('unbranded') ||
                    assignment.brand.trim() === '';
                  const isPrivateOrNull = isPrivateBrand || isNullBrand;

                  const isUnassigned =
                    !isPrivateOrNull &&
                    (assignment.assignedVariantId === null ||
                      assignment.status === 'unassigned' ||
                      assignment.assignedVariantName.toLowerCase().includes('unassigned'));
                  const isCustom = assignment.isAutoMatched === false && !isUnassigned && !isPrivateOrNull;

                  return (
                    <tr
                      key={assignment.id}
                      className={`transition-colors group ${
                        isUnassigned
                          ? 'bg-amber-50/50 hover:bg-amber-50/80 border-l-4 border-l-amber-500'
                          : 'hover:bg-purple-50/30'
                      }`}
                    >
                      {/* Brand */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-xs tracking-tight">
                            {assignment.brand}
                          </span>
                          {isPrivateBrand ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              Private
                            </span>
                          ) : isNullBrand ? (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              No Brand
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                              Global
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Merchant Category Path */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200">
                            {assignment.merchantPath}
                          </span>
                        </div>
                      </td>

                      {/* Parent Sizing Family */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
                          {assignment.parentCategory}
                        </span>
                      </td>

                      {/* Assigned Chart Variant Dropdown + Status Highlight */}
                      <td className="px-5 py-4">
                        {isPrivateOrNull ? (
                          <span className="text-slate-400 font-mono text-xs font-normal">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              {/* Dropdown Selector */}
                              <div className="relative flex-1 max-w-xs">
                                <select
                                  value={
                                    isUnassigned
                                      ? '__null__'
                                      : assignment.assignedVariantId || availableVariants[0]?.id
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '__null__') {
                                      onUpdatePathAssignment(
                                        assignment.id,
                                        null,
                                        'Unassigned'
                                      );
                                    } else if (val === '__new_template__') {
                                      handleOpenMakeTemplateModal(assignment);
                                    } else {
                                      const selected = availableVariants.find((v) => v.id === val);
                                      if (selected) {
                                        onUpdatePathAssignment(
                                          assignment.id,
                                          selected.id,
                                          selected.variantName
                                        );
                                      }
                                    }
                                  }}
                                  className={`w-full appearance-none pl-3 pr-8 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 ${
                                    isUnassigned
                                      ? 'bg-amber-100/90 text-amber-950 border-2 border-amber-400 focus:ring-amber-500/30'
                                      : isCustom
                                      ? 'bg-purple-50 text-purple-900 border-2 border-purple-300 focus:ring-purple-500/20'
                                      : 'bg-white text-slate-800 border border-slate-300 focus:ring-purple-500/20'
                                  }`}
                                >
                                  {isUnassigned && (
                                    <option value="__null__">⚠️ Unassigned</option>
                                  )}

                                  <optgroup label="Discovered Researched Variants">
                                    {availableVariants.map((v) => (
                                      <option key={v.id} value={v.id}>
                                        {v.variantName} ({v.confidence || 99}%)
                                      </option>
                                    ))}
                                  </optgroup>

                                  <optgroup label="Custom Actions">
                                    <option value="__new_template__">✨ + Make / Create Template for this Path...</option>
                                    {!isUnassigned && (
                                      <option value="__null__">⚠️ Set to Unassigned</option>
                                    )}
                                  </optgroup>
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>

                              {/* Status Pills */}
                              {isUnassigned ? (
                                <span className="text-[10px] font-black text-amber-900 bg-amber-200 px-2 py-0.5 rounded-md border border-amber-300 shrink-0">
                                  Unassigned
                                </span>
                              ) : isCustom ? (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md shrink-0">
                                  Template
                                </span>
                              ) : (
                                <span
                                  className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0"
                                  title="AI Auto-Matched by category hierarchy"
                                >
                                  AI 99%
                                </span>
                              )}
                            </div>

                            {/* Inline Notification Highlight Callouts */}
                            {isUnassigned && (
                              <div className="flex items-center gap-2 pt-0.5">
                                <span className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 inline" />
                                  <strong>{assignment.skuCount} SKUs</strong> will NOT have a size chart
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenMakeTemplateModal(assignment)}
                                  className="text-[11px] font-bold text-purple-700 underline hover:text-purple-900 cursor-pointer"
                                >
                                  + Make Template
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* SKU Count & Inspector */}
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setInspectingAssignment(assignment)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono font-bold text-xs border transition-colors cursor-pointer ${
                            isUnassigned
                              ? 'bg-amber-100/90 text-amber-900 border-amber-300 hover:bg-amber-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                          }`}
                          title="Click to inspect matching SKUs that inherit this rule"
                        >
                          <Package className="w-3 h-3 text-slate-500" />
                          {assignment.skuCount} SKUs
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isUnassigned ? (
                            <button
                              type="button"
                              onClick={() => handleOpenMakeTemplateModal(assignment)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 transition-all cursor-pointer shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Make Template
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenVariantPreview(assignment)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              View Chart
                            </button>
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

      {/* Bottom Summary & Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            {assignedCount} of {pathAssignments.length} paths assigned
          </span>
          {unassignedAssignments.length > 0 && (
            <span className="font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
              ⚠️ {unassignedAssignments.length} Unassigned ({unassignedSkuCount} SKUs)
            </span>
          )}
          <span className="text-slate-300">·</span>
          <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
            {totalSkusGoverned} SKUs actively inheriting charts
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onPrev}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Research
          </button>

          <button
            type="button"
            onClick={onNext}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
          >
            <span>Proceed to Active Catalog</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: MAKE / CREATE SIZING TEMPLATE MODAL                                */}
      {/* ========================================================================= */}
      {templateModalAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">
                    Sizing Chart Builder
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                    Resolving {templateModalAssignment.skuCount} SKUs
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  Make Size Chart Template for {templateModalAssignment.brand} — {templateModalAssignment.merchantPath}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTemplateModalAssignment(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Template Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Variant Template Name
                  </label>
                  <input
                    type="text"
                    value={customTemplateName}
                    onChange={(e) => setCustomTemplateName(e.target.value)}
                    placeholder="e.g. Men Boxy Heavyweight Tee"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Base Parent Category
                  </label>
                  <select
                    value={customCategoryType}
                    onChange={(e) =>
                      handleSelectTemplateCategory(
                        e.target.value as StandardParentCategoryType,
                        customSystem
                      )
                    }
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    {STANDARD_PARENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sizing Standard System Selector */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Measurement System Template:</span>
                <div className="flex items-center gap-1">
                  {(['US', 'UK', 'EU', 'Alpha'] as SizingSystemOption[]).map((sys) => (
                    <button
                      key={sys}
                      type="button"
                      onClick={() => handleSelectTemplateCategory(customCategoryType, sys)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        customSystem === sys
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-purple-50'
                      }`}
                    >
                      {sys}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editable Matrix Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">Measurements Matrix</span>
                  <span className="text-[11px] text-slate-500">All measurements in centimeters (cm)</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/90 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        {customHeaders.map((h) => (
                          <th key={h} className="px-3 py-2.5">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                      {customRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-purple-50/20">
                          {customHeaders.map((h) => (
                            <td key={h} className="px-3 py-2">
                              <input
                                type="text"
                                value={row[h] || ''}
                                onChange={(e) => {
                                  const copy = [...customRows];
                                  copy[rIdx] = { ...copy[rIdx], [h]: e.target.value };
                                  setCustomRows(copy);
                                }}
                                className="w-full px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTemplateModalAssignment(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveAndAssignTemplate}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-500/20 active:scale-98 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Save & Assign to Path
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SKU INHERITANCE INSPECTOR                                         */}
      {/* ========================================================================= */}
      {inspectingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">
                    Rule Inheritance Inspector
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md">
                    {inspectingAssignment.skuCount} Matching SKUs
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {inspectingAssignment.brand} — {inspectingAssignment.merchantPath}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAssignment(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Rule Summary Banner */}
            <div className="p-4 bg-purple-50/60 border-b border-purple-100 flex items-center justify-between gap-4">
              <div className="text-xs text-purple-900">
                <span className="font-bold">Inherited Sizing Variant:</span>{' '}
                <span className="font-extrabold text-purple-950 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                  {inspectingAssignment.assignedVariantName}
                </span>{' '}
                <span className="text-purple-700 ml-1">({inspectingAssignment.parentCategory})</span>
              </div>
              {inspectingAssignment.assignedVariantId === null ? (
                <span className="text-xs text-amber-700 font-bold">
                  ⚠️ No size chart will publish for these SKUs
                </span>
              ) : (
                <span className="text-xs text-purple-700 font-medium">
                  Mapped once at the category level
                </span>
              )}
            </div>

            {/* Modal Product List */}
            <div className="flex-1 overflow-y-auto p-6 divide-y divide-slate-100">
              {getMatchingProducts(inspectingAssignment).length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Sample mock products are aggregated across catalog paths ({inspectingAssignment.skuCount} active inventory SKUs linked).
                </div>
              ) : (
                getMatchingProducts(inspectingAssignment).map((prod) => (
                  <div key={prod.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={prod.imageUrl}
                        alt={prod.title}
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800">{prod.sku}</span>
                          <span className="text-xs font-bold text-slate-900 truncate">{prod.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Available Sizes: <strong>{prod.sizes.join(', ')}</strong></span>
                          <span>·</span>
                          <span>Price: <strong>{prod.price}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {inspectingAssignment.assignedVariantId === null ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          No Chart Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          {inspectingAssignment.assignedVariantName}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingAssignment(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SIZE CHART VARIANT PREVIEW                                       */}
      {/* ========================================================================= */}
      {previewingVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">
                    Researched Variant Table
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Confidence: {previewingVariant.variant.confidence}%
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {previewingVariant.brand} — {previewingVariant.variant.variantName} ({previewingVariant.parentCategory})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingVariant(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sizing Table */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      {previewingVariant.variant.headers.map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-slate-800">
                    {previewingVariant.variant.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-purple-50/20">
                        {previewingVariant.variant.headers.map((h) => (
                          <td key={h} className="px-4 py-2.5">
                            {row[h] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewingVariant.variant.notes && (
                <p className="text-xs text-slate-500 mt-4 italic bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                  <strong>Notes:</strong> {previewingVariant.variant.notes}
                </p>
              )}

              {previewingVariant.variant.sourceUrl && (
                <p className="text-[11px] text-slate-400 mt-2 truncate">
                  Source: <a href={previewingVariant.variant.sourceUrl} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">{previewingVariant.variant.sourceUrl}</a>
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewingVariant(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close Table Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
