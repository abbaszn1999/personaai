import React, { useState, useMemo, useEffect, useRef, MouseEvent } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Ban,
  ChevronRight,
  ArrowRight,
  RotateCcw,
  Save,
  Check,
  Sparkles,
  Layers,
  FolderTree,
  Tag,
  Eye,
  Trash2,
  ExternalLink,
  ChevronDown,
  Info,
  CheckSquare,
  Square,
  MinusSquare,
  HelpCircle,
  Shirt,
  Scissors,
  Footprints,
  Shield,
  SlidersHorizontal,
  X,
  GripVertical,
  Move,
} from 'lucide-react';
import {
  PersonaDepartmentId,
  PersonaCategoryId,
  PersonaDepartmentDef,
  PersonaCategoryDef,
  PersonaDerivedValues,
  StoreCategoryItem,
  PERSONA_DEPARTMENTS,
  PERSONA_CATEGORIES,
  PERSONA_SUB_CATEGORIES,
  derivePersonaValues,
  formatPersonaPath,
  INITIAL_STORE_CATEGORIES,
} from '../data/personaTaxonomyData';
import { CategoryItemsPreviewModal } from './CategoryItemsPreviewModal';
import {
  CatalogScopeModal,
  TaxonomyScopeState,
  getDefaultScopeState,
} from './CatalogScopeModal';
import { StoreConnectionInfo } from '../types';

interface CategoryMappingViewProps {
  storeConnection: StoreConnectionInfo;
  onContinueToSetup?: () => void;
}

type FilterStatus = 'all' | 'unmapped' | 'mapped' | 'excluded';
type SortOption = 'unmapped_first' | 'products_desc' | 'name_asc';

export function CategoryMappingView({ storeConnection, onContinueToSetup }: CategoryMappingViewProps) {
  // Store Categories Master State
  const [categories, setCategories] = useState<StoreCategoryItem[]>(() => {
    // Check localStorage for persisted mapping state if any
    const saved = localStorage.getItem('persona_store_category_mappings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_STORE_CATEGORIES;
      }
    }
    return INITIAL_STORE_CATEGORIES;
  });

  // Track initial state to detect unsaved changes
  const [initialCategoriesJson, setInitialCategoriesJson] = useState<string>(() =>
    JSON.stringify(INITIAL_STORE_CATEGORIES)
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Left Panel Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('unmapped_first');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Left Panel Multi-selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Category Items Preview Modal Popup State
  const [previewCategory, setPreviewCategory] = useState<StoreCategoryItem | null>(null);

  // Right Panel Persona Taxonomy State
  const [taxonomySearch, setTaxonomySearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({
    women: true,
    men: false,
    unisex: false,
    'kids-boys': false,
    'kids-girls': false,
    'kids-unisex': false,
  });
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    'women:top': true,
    'women:full-body': true,
    'women:bottom': true,
    'women:outerwear': false,
    'women:footwear': false,
    'men:top': true,
    'men:full-body': false,
    'men:bottom': true,
    'men:outerwear': false,
    'men:footwear': false,
    'unisex:top': true,
    'unisex:bottom': true,
    'kids-boys:top': true,
    'kids-boys:bottom': true,
    'kids-girls:top': true,
    'kids-girls:full-body': true,
    'kids-girls:bottom': true,
    'kids-unisex:top': true,
    'kids-unisex:bottom': true,
  });

  // Right Panel Scope Setup State ("Select What You Sell")
  const [isScopeConfigured, setIsScopeConfigured] = useState<boolean>(() => {
    const saved = localStorage.getItem('persona_scope_configured');
    return saved === 'true';
  });
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [scopeState, setScopeState] = useState<TaxonomyScopeState>(() => {
    const saved = localStorage.getItem('persona_taxonomy_scope');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          enabledDeptIds: new Set(parsed.enabledDeptIds || []),
          enabledLeafKeys: new Set(parsed.enabledLeafKeys || []),
          customLeaves: parsed.customLeaves || [],
          customCategories: parsed.customCategories || [],
        };
      } catch (e) {
        console.error('Error loading taxonomy scope', e);
      }
    }
    return getDefaultScopeState();
  });

  const handleSaveScope = (newScope: TaxonomyScopeState) => {
    setScopeState(newScope);
    setIsScopeConfigured(true);
    localStorage.setItem('persona_scope_configured', 'true');
    localStorage.setItem(
      'persona_taxonomy_scope',
      JSON.stringify({
        enabledDeptIds: Array.from(newScope.enabledDeptIds),
        enabledLeafKeys: Array.from(newScope.enabledLeafKeys),
        customLeaves: newScope.customLeaves,
        customCategories: newScope.customCategories,
      })
    );
    showFeedback(
      `Catalog scope activated: ${newScope.enabledDeptIds.size} departments, ${newScope.enabledLeafKeys.size} categories active`,
      'success'
    );
  };

  // Toast / notification feedback
  const [actionFeedback, setActionFeedback] = useState<{
    message: string;
    type: 'success' | 'info' | 'warn';
  } | null>(null);

  // Active highlighted category for right-to-left tracing
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<string | null>(null);

  // Locate and scroll to category on the left side
  const locateAndHighlightCategory = (catId: string) => {
    const target = categories.find((c) => c.id === catId);
    if (!target) return;
    if (statusFilter === 'unmapped' && target.status === 'mapped') {
      setStatusFilter('all');
    } else if (statusFilter === 'excluded' && target.status !== 'excluded') {
      setStatusFilter('all');
    }
    setSelectedIds(new Set([catId]));
    setHighlightedCategoryId(catId);
    showFeedback(`Located "${target.name}" on store catalog list`, 'info');
    setTimeout(() => {
      const el = document.getElementById(`category-item-${catId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    setTimeout(() => {
      setHighlightedCategoryId((curr) => (curr === catId ? null : curr));
    }, 3500);
  };

  // Drag and Drop Mapping State
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dragOverTargetKey, setDragOverTargetKey] = useState<string | null>(null);

  const draggedCategory = useMemo(
    () => (draggedCategoryId ? categories.find((c) => c.id === draggedCategoryId) : null),
    [categories, draggedCategoryId]
  );

  // Helper to find all store categories currently mapped to a specific taxonomy node
  const getMappedCategoriesForNode = (
    deptId: string,
    catId: string,
    subCat?: string,
    customPath?: string
  ): StoreCategoryItem[] => {
    if (customPath) {
      return categories.filter(
        (c) => c.status === 'mapped' && c.assignedPersonaPath === customPath
      );
    }
    const standardPath = formatPersonaPath(
      deptId as PersonaDepartmentId,
      catId as PersonaCategoryId,
      subCat
    );
    return categories.filter(
      (c) =>
        c.status === 'mapped' &&
        (c.assignedPersonaPath === standardPath ||
          (c.departmentId === deptId &&
            c.categoryId === catId &&
            (subCat ? c.subCategory === subCat : !c.subCategory)))
    );
  };

  // Helper to find first store category currently mapped to a specific taxonomy node (backward compatibility)
  const getMappedCategoryForNode = (
    deptId: string,
    catId: string,
    subCat?: string,
    customPath?: string
  ): StoreCategoryItem | undefined => {
    return getMappedCategoriesForNode(deptId, catId, subCat, customPath)[0];
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // '/' to focus search if not in an input
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // 'Escape' to deselect all
      if (e.key === 'Escape') {
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]);

  // Monitor unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(JSON.stringify(categories) !== initialCategoriesJson);
  }, [categories, initialCategoriesJson]);

  // Derived counts for progress bar and stats
  const totalCount = categories.length;
  const excludedCount = categories.filter((c) => c.status === 'excluded').length;
  const fashionTotal = totalCount - excludedCount;
  const mappedCount = categories.filter((c) => c.status === 'mapped').length;
  const unmappedCount = categories.filter((c) => c.status === 'unmapped').length;
  const mappedPercentage = fashionTotal > 0 ? Math.round((mappedCount / fashionTotal) * 100) : 0;

  // Filtered and sorted category list
  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => {
        // Status filter
        if (statusFilter !== 'all' && cat.status !== statusFilter) {
          return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesName = cat.name.toLowerCase().includes(q);
          const matchesPath = cat.storePath.toLowerCase().includes(q);
          const matchesPersona = cat.assignedPersonaPath?.toLowerCase().includes(q);
          const matchesSub = cat.subCategory?.toLowerCase().includes(q);
          return matchesName || matchesPath || matchesPersona || matchesSub;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'unmapped_first') {
          // Unmapped first, then mapped, then excluded
          const order = { unmapped: 0, mapped: 1, excluded: 2 };
          if (order[a.status] !== order[b.status]) {
            return order[a.status] - order[b.status];
          }
          return b.productCount - a.productCount;
        }
        if (sortBy === 'products_desc') {
          return b.productCount - a.productCount;
        }
        if (sortBy === 'name_asc') {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [categories, statusFilter, searchQuery, sortBy]);

  // Selection handlers
  const handleToggleSelectOne = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.size === filteredCategories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCategories.map((c) => c.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Helper to show brief feedback toast
  const showFeedback = (message: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setActionFeedback({ message, type });
    setTimeout(() => {
      setActionFeedback((current) => (current?.message === message ? null : current));
    }, 3500);
  };

  // --------------------------------------------------------------------------
  // MULTI-STORE-PLP DRAG & DROP MAPPING
  // --------------------------------------------------------------------------

  // Core Mapping Logic: Users can map multiple Store PLPs to the same Persona Taxonomy Path.
  // Dropping an item adds it to the target PLP node without unmapping other items already there.
  const handleDropOnTaxonomy = (
    droppedCatId: string,
    deptId: PersonaDepartmentId | string,
    catId: PersonaCategoryId | string,
    subCat?: string,
    customPath?: string
  ) => {
    const droppedCat = categories.find((c) => c.id === droppedCatId);
    if (!droppedCat) return;

    const assignedPath =
      customPath ||
      formatPersonaPath(deptId as PersonaDepartmentId, catId as PersonaCategoryId, subCat);

    // If already mapped to this exact path, notify and return
    if (droppedCat.status === 'mapped' && droppedCat.assignedPersonaPath === assignedPath) {
      showFeedback(`"${droppedCat.name}" is already mapped to this PLP`, 'info');
      return;
    }

    let derived: PersonaDerivedValues;
    try {
      derived = derivePersonaValues(deptId as PersonaDepartmentId, catId as PersonaCategoryId);
    } catch {
      derived = {
        gender:
          deptId.includes('men') && !deptId.includes('women')
            ? 'male'
            : deptId.includes('women')
            ? 'female'
            : 'male+female',
        ageGroup: deptId.includes('kids') ? 'kids' : 'adult',
        sizingParent: 'Tops',
      };
    }

    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === droppedCatId) {
          return {
            ...c,
            status: 'mapped',
            assignedPersonaPath: assignedPath,
            departmentId: deptId as PersonaDepartmentId,
            categoryId: catId as PersonaCategoryId,
            subCategory: subCat || undefined,
            derived,
            excludeReason: undefined,
          };
        }
        return c;
      })
    );

    setHasUnsavedChanges(true);
    setSelectedIds(new Set([droppedCatId]));
    showFeedback(`Mapped "${droppedCat.name}" → ${assignedPath}`, 'success');
  };

  // Assign Persona path to selected categories via click
  const handleAssignTaxonomy = (
    deptId: string,
    catId: string,
    subCat?: string,
    customDisplayPath?: string
  ) => {
    let targetIds: string[] = Array.from(selectedIds);
    if (targetIds.length === 0) {
      const firstUnmapped = filteredCategories.find((c) => c.status === 'unmapped');
      if (firstUnmapped) {
        targetIds = [firstUnmapped.id];
        setSelectedIds(new Set([firstUnmapped.id]));
      } else {
        showFeedback(
          'Please select or drag a store category from the left panel to map.',
          'warn'
        );
        return;
      }
    }

    targetIds.forEach((id) => {
      handleDropOnTaxonomy(id, deptId, catId, subCat, customDisplayPath);
    });
  };

  // Quick Unmap a single store category
  const handleUnmapSingleCategory = (
    categoryId: string,
    categoryName: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              status: 'unmapped',
              assignedPersonaPath: undefined,
              departmentId: undefined,
              categoryId: undefined,
              subCategory: undefined,
              derived: undefined,
            }
          : c
      )
    );
    setHasUnsavedChanges(true);
    showFeedback(`Unmapped "${categoryName}"`, 'info');
  };

  // Quick Exclude / Include single item
  const handleToggleExclude = (item: StoreCategoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (item.status === 'excluded') {
      // Re-include as unmapped
      setCategories((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? {
                ...c,
                status: 'unmapped',
                excludeReason: undefined,
              }
            : c
        )
      );
      showFeedback(`Restored "${item.name}" to fashion catalog`, 'info');
    } else {
      // Exclude
      const defaultReason = item.name.toLowerCase().includes('toy')
        ? 'Non-fashion: Children Toys'
        : item.name.toLowerCase().includes('furniture') || item.name.toLowerCase().includes('crib')
        ? 'Non-fashion: Nursery Furniture'
        : item.name.toLowerCase().includes('feeding') || item.name.toLowerCase().includes('bottle')
        ? 'Non-fashion: Feeding Accessories'
        : item.name.toLowerCase().includes('card') || item.name.toLowerCase().includes('voucher')
        ? 'Non-fashion: Digital Cards'
        : 'Non-fashion / Excluded page';

      setCategories((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? {
                ...c,
                status: 'excluded',
                excludeReason: defaultReason,
                assignedPersonaPath: undefined,
                departmentId: undefined,
                categoryId: undefined,
                subCategory: undefined,
                derived: undefined,
              }
            : c
        )
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      showFeedback(`Excluded "${item.name}" (${defaultReason})`, 'info');
    }
  };

  // Bulk Exclude selected items
  const handleBulkExclude = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setCategories((prev) =>
      prev.map((c) =>
        ids.includes(c.id)
          ? {
              ...c,
              status: 'excluded',
              excludeReason: 'Excluded by merchant batch action',
              assignedPersonaPath: undefined,
              departmentId: undefined,
              categoryId: undefined,
              subCategory: undefined,
              derived: undefined,
            }
          : c
      )
    );
    setSelectedIds(new Set());
    showFeedback(`Excluded ${ids.length} selected categories`, 'info');
  };

  // Clear mapping for selected items or a single item
  const handleClearMapping = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: 'unmapped',
              assignedPersonaPath: undefined,
              departmentId: undefined,
              categoryId: undefined,
              subCategory: undefined,
              derived: undefined,
            }
          : c
      )
    );
    showFeedback('Mapping cleared', 'info');
  };

  // Bulk Clear Mappings
  const handleBulkClearMapping = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setCategories((prev) =>
      prev.map((c) =>
        ids.includes(c.id)
          ? {
              ...c,
              status: 'unmapped',
              assignedPersonaPath: undefined,
              departmentId: undefined,
              categoryId: undefined,
              subCategory: undefined,
              derived: undefined,
            }
          : c
      )
    );
    showFeedback(`Cleared mapping for ${ids.length} categories`, 'info');
  };

  // Auto-Match Intelligent Helper
  const handleAutoMatchUnmapped = () => {
    let matchedCount = 0;
    const nextCategories = categories.map((cat) => {
      if (cat.status !== 'unmapped') return cat;

      const lower = `${cat.name} ${cat.storePath}`.toLowerCase();

      // Detect Exclusions first
      if (
        lower.includes('furniture') ||
        lower.includes('crib') ||
        lower.includes('cot') ||
        lower.includes('mattress')
      ) {
        matchedCount++;
        return {
          ...cat,
          status: 'excluded' as const,
          excludeReason: 'Auto-detected: Nursery Furniture',
        };
      }
      if (lower.includes('toy') || lower.includes('puzzle') || lower.includes('game')) {
        matchedCount++;
        return {
          ...cat,
          status: 'excluded' as const,
          excludeReason: 'Auto-detected: Toys',
        };
      }
      if (lower.includes('bottle') || lower.includes('feeding') || lower.includes('highchair')) {
        matchedCount++;
        return {
          ...cat,
          status: 'excluded' as const,
          excludeReason: 'Auto-detected: Feeding gear',
        };
      }
      if (lower.includes('gift card') || lower.includes('voucher')) {
        matchedCount++;
        return {
          ...cat,
          status: 'excluded' as const,
          excludeReason: 'Auto-detected: Digital gift card',
        };
      }

      // Department heuristics
      let dept: PersonaDepartmentId = 'women';
      if (lower.includes('girl')) {
        dept = 'kids-girls';
      } else if (lower.includes('boy')) {
        dept = 'kids-boys';
      } else if (
        lower.includes('baby') ||
        lower.includes('infant') ||
        lower.includes('toddler') ||
        lower.includes('newborn')
      ) {
        dept = 'kids-unisex';
      } else if (lower.includes('unisex')) {
        dept = 'unisex';
      } else if (lower.includes('men') || lower.includes("men's")) {
        dept = 'men';
      } else if (lower.includes('women') || lower.includes("women's")) {
        dept = 'women';
      }

      // Category & Sub-category heuristics
      let catType: PersonaCategoryId = 'top';
      let sub: string | undefined = undefined;

      if (
        lower.includes('heel') ||
        lower.includes('sandal') ||
        lower.includes('shoe') ||
        lower.includes('boot') ||
        lower.includes('loafer') ||
        lower.includes('sneaker') ||
        lower.includes('slide') ||
        lower.includes('flat')
      ) {
        catType = 'footwear';
        if (lower.includes('sandal')) sub = 'sandal';
        else if (lower.includes('heel')) sub = 'heel';
        else if (lower.includes('sneaker')) sub = 'sneaker';
        else if (lower.includes('loafer')) sub = 'loafer';
        else if (lower.includes('slide')) sub = 'slide';
        else if (lower.includes('boot')) sub = 'boot';
        else if (lower.includes('flat')) sub = 'flat';
      } else if (
        lower.includes('coat') ||
        lower.includes('jacket') ||
        lower.includes('blazer') ||
        lower.includes('cardigan') ||
        lower.includes('snowsuit') ||
        lower.includes('outerwear')
      ) {
        catType = 'outerwear';
        if (lower.includes('blazer')) sub = 'blazer';
        else if (lower.includes('coat')) sub = 'coat';
        else if (lower.includes('jacket')) sub = 'jacket';
        else if (lower.includes('cardigan')) sub = 'cardigan';
        else if (lower.includes('snowsuit')) sub = 'snowsuit';
      } else if (
        lower.includes('jean') ||
        lower.includes('trouser') ||
        lower.includes('pant') ||
        lower.includes('short') ||
        lower.includes('skirt') ||
        lower.includes('legging') ||
        lower.includes('chino') ||
        lower.includes('jogger')
      ) {
        catType = 'bottom';
        if (lower.includes('short')) sub = 'short';
        else if (lower.includes('jean') || lower.includes('denim')) sub = 'jean';
        else if (lower.includes('skirt')) sub = 'skirt';
        else if (lower.includes('chino')) sub = 'chino';
        else if (lower.includes('jogger')) sub = 'jogger';
        else if (lower.includes('legging')) sub = 'legging';
        else if (lower.includes('trouser')) sub = 'trouser';
      } else if (
        lower.includes('dress') ||
        lower.includes('gown') ||
        lower.includes('romper') ||
        lower.includes('jumpsuit') ||
        lower.includes('sleepsuit')
      ) {
        catType = 'full-body';
        if (lower.includes('gown')) sub = 'gown';
        else if (lower.includes('dress')) sub = 'dress';
        else if (lower.includes('romper')) sub = 'romper';
        else if (lower.includes('jumpsuit')) sub = 'jumpsuit';
        else if (lower.includes('sleepsuit')) sub = 'sleepsuit';
      } else {
        catType = 'top';
        if (lower.includes('camisole') || lower.includes('slip')) sub = 'camisole';
        else if (lower.includes('polo')) sub = 'polo';
        else if (lower.includes('blouse')) sub = 'blouse';
        else if (lower.includes('sweater') || lower.includes('crewneck') || lower.includes('knit'))
          sub = 'sweater';
        else if (lower.includes('hoodie')) sub = 'hoodie';
        else if (lower.includes('bodysuit')) sub = 'bodysuit';
        else if (lower.includes('t-shirt') || lower.includes('tee')) sub = 't-shirt';
        else if (lower.includes('shirt')) sub = 'shirt';
      }

      // Check if sub exists for this dept & catType
      const validSubs = PERSONA_SUB_CATEGORIES[dept][catType];
      if (sub && !validSubs.includes(sub)) {
        sub = undefined; // fall back to category level
      }

      matchedCount++;
      const assignedPersonaPath = formatPersonaPath(dept, catType, sub);
      const derived = derivePersonaValues(dept, catType);

      return {
        ...cat,
        status: 'mapped' as const,
        assignedPersonaPath,
        departmentId: dept,
        categoryId: catType,
        subCategory: sub,
        derived,
        isAutoMatched: true,
      };
    });

    setCategories(nextCategories);
    showFeedback(`Intelligent Auto-Match calibrated ${matchedCount} categories!`, 'success');
  };

  // Save to merchant settings / store
  const handleSaveChanges = () => {
    localStorage.setItem('persona_store_category_mappings', JSON.stringify(categories));
    setInitialCategoriesJson(JSON.stringify(categories));
    setHasUnsavedChanges(false);
    setSaveSuccessMessage('All store category mappings saved successfully!');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4000);
    showFeedback('Taxonomy mappings saved to store configuration', 'success');
  };

  // Reset to default mock data
  const handleResetToDefaults = () => {
    if (confirm('Reset all category mappings to initial retail store dataset?')) {
      localStorage.removeItem('persona_store_category_mappings');
      setCategories(INITIAL_STORE_CATEGORIES);
      setInitialCategoriesJson(JSON.stringify(INITIAL_STORE_CATEGORIES));
      setSelectedIds(new Set());
      setHasUnsavedChanges(false);
      showFeedback('Reset to default retail mock taxonomy', 'info');
    }
  };

  // Toggle individual department expansion in right panel hierarchy
  const toggleDeptExpanded = (deptId: string) => {
    setExpandedDepts((prev) => ({
      ...prev,
      [deptId]: !prev[deptId],
    }));
  };

  // Toggle individual category expansion inside a department
  const toggleCatExpanded = (deptId: string, catId: string) => {
    const key = `${deptId}:${catId}`;
    setExpandedCats((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExpandAllDepts = () => {
    const allOpen: Record<string, boolean> = {};
    const allCatsOpen: Record<string, boolean> = {};
    PERSONA_DEPARTMENTS.forEach((d) => {
      allOpen[d.id] = true;
      PERSONA_CATEGORIES.forEach((c) => {
        allCatsOpen[`${d.id}:${c.id}`] = true;
      });
    });
    setExpandedDepts(allOpen);
    setExpandedCats(allCatsOpen);
  };

  const handleCollapseAllDepts = () => {
    const allClosed: Record<string, boolean> = {};
    const allCatsClosed: Record<string, boolean> = {};
    PERSONA_DEPARTMENTS.forEach((d) => {
      allClosed[d.id] = false;
      PERSONA_CATEGORIES.forEach((c) => {
        allCatsClosed[`${d.id}:${c.id}`] = false;
      });
    });
    setExpandedDepts(allClosed);
    setExpandedCats(allCatsClosed);
  };

  // Friendly category display names matching standard retailer thinking (Tops, Dresses, Bottoms, Outerwear, Footwear)
  const getCategoryDisplayName = (catId: PersonaCategoryId): string => {
    switch (catId) {
      case 'top':
        return 'Tops';
      case 'full-body':
        return 'Dresses';
      case 'bottom':
        return 'Bottoms';
      case 'outerwear':
        return 'Outerwear';
      case 'footwear':
        return 'Footwear';
    }
  };

  // Formatting slugs into clean display names (e.g. 't-shirt' -> 'T-Shirts', 'sweater' -> 'Sweaters & Cardigans')
  const formatLeafLabel = (slug: string): string => {
    const map: Record<string, string> = {
      't-shirt': 'T-Shirts',
      'shirt': 'Shirts',
      'blouse': 'Blouses',
      'sweater': 'Sweaters & Cardigans',
      'knit': 'Knits',
      'hoodie': 'Hoodies',
      'sweatshirt': 'Sweatshirts',
      'camisole': 'Camisoles',
      'tank-top': 'Tank Tops',
      'crop-top': 'Crop Tops',
      'bodysuit': 'Bodysuits',
      'tunic': 'Tunics',
      'dress': 'Casual',
      'gown': 'Formal',
      'jumpsuit': 'Jumpsuits',
      'romper': 'Rompers',
      'kaftan': 'Kaftans',
      'abaya': 'Abayas',
      'thobe': 'Thobes',
      'overall': 'Overalls',
      'jean': 'Jeans',
      'trouser': 'Trousers & Slacks',
      'chino': 'Chinos',
      'short': 'Shorts',
      'skirt': 'Skirts',
      'legging': 'Leggings',
      'jogger': 'Joggers',
      'blazer': 'Blazers',
      'jacket': 'Jackets',
      'coat': 'Coats',
      'trench': 'Trench Coats',
      'cardigan': 'Cardigans',
      'vest': 'Vests',
      'gilet': 'Gilets',
      'sneaker': 'Sneakers',
      'boot': 'Boots',
      'heel': 'Heels',
      'flat': 'Flats',
      'sandal': 'Sandals',
      'loafer': 'Loafers',
      'mule': 'Mules',
      'wedge': 'Wedges',
      'slide': 'Slides',
      'espadrille': 'Espadrilles',
      'dress-shoe': 'Dress Shoes',
      'shoe': 'Shoes',
      'bootie': 'Booties',
      'all-in-one': 'All-in-Ones',
      'sleepsuit': 'Sleepsuits',
      'snowsuit': 'Snowsuits',
      'pramsuit': 'Pramsuits',
      'culotte': 'Culottes',
      'polo': 'Polos',
      'kimono': 'Kimonos',
      'suit-jacket': 'Suit Jackets',
    };
    return map[slug] || slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  };

  // Realistic SKU counting matching catalog figures (e.g. 1,420, 860, 940, 610, 280, 210, 880, 540)
  const getLeafSkuCount = (deptId: string, catId: string, sub?: string): number => {
    const assigned = categories.filter((c) => {
      if (sub) {
        return (
          c.departmentId === deptId &&
          c.categoryId === catId &&
          c.subCategory === sub &&
          c.status === 'mapped'
        );
      }
      return (
        c.departmentId === deptId &&
        c.categoryId === catId &&
        !c.subCategory &&
        c.status === 'mapped'
      );
    });
    const mappedProducts = assigned.reduce((acc, cur) => acc + cur.productCount, 0);

    const key = `${deptId}:${catId}:${sub || 'root'}`;
    const mockTable: Record<string, number> = {
      'women:top:t-shirt': 1420,
      'women:top:blouse': 860,
      'women:top:sweater': 940,
      'women:top:shirt': 720,
      'women:top:camisole': 380,
      'women:top:tank-top': 410,
      'women:top:crop-top': 350,
      'women:top:bodysuit': 290,
      'women:top:knit': 480,
      'women:top:hoodie': 530,
      'women:top:sweatshirt': 470,
      'women:top:tunic': 260,
      'women:full-body:dress': 610,
      'women:full-body:gown': 280,
      'women:full-body:jumpsuit': 210,
      'women:full-body:romper': 190,
      'women:full-body:kaftan': 120,
      'women:full-body:abaya': 95,
      'women:bottom:jean': 880,
      'women:bottom:trouser': 540,
      'women:bottom:skirt': 490,
      'women:bottom:short': 410,
      'women:bottom:legging': 360,
      'women:bottom:culotte': 210,
      'women:outerwear:blazer': 320,
      'women:outerwear:jacket': 540,
      'women:outerwear:coat': 430,
      'women:outerwear:trench': 190,
      'women:outerwear:cardigan': 460,
      'women:outerwear:vest': 150,
      'women:outerwear:kimono': 80,
      'women:footwear:heel': 480,
      'women:footwear:flat': 390,
      'women:footwear:sneaker': 710,
      'women:footwear:boot': 560,
      'women:footwear:sandal': 420,
      'women:footwear:loafer': 290,
      'women:footwear:mule': 210,
      'women:footwear:wedge': 170,
    };

    if (mockTable[key]) {
      return mockTable[key] + mappedProducts;
    }

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) % 900;
    }
    return 140 + Math.abs(hash) + mappedProducts;
  };

  // 5 Categories ordered intuitively: Tops -> Dresses -> Bottoms -> Outerwear -> Footwear
  const orderedCategoriesList = useMemo(() => {
    const order: PersonaCategoryId[] = ['top', 'full-body', 'bottom', 'outerwear', 'footwear'];
    return order
      .map((id) => PERSONA_CATEGORIES.find((c) => c.id === id))
      .filter((c): c is PersonaCategoryDef => Boolean(c));
  }, []);

  // Flattened list of all taxonomy paths for global instant search
  interface FlatTaxonomyPath {
    deptId: PersonaDepartmentId;
    deptName: string;
    catId: PersonaCategoryId;
    catName: string;
    subCat?: string;
    fullPath: string;
    sizingParent: string;
    gender: string;
    ageGroup: string;
  }

  const allTaxonomyPaths = useMemo<FlatTaxonomyPath[]>(() => {
    const list: FlatTaxonomyPath[] = [];
    PERSONA_DEPARTMENTS.filter((dept) => scopeState.enabledDeptIds.has(dept.id)).forEach((dept) => {
      PERSONA_CATEGORIES.forEach((cat) => {
        const derived = derivePersonaValues(dept.id, cat.id);
        const subs = (PERSONA_SUB_CATEGORIES[dept.id][cat.id] || []).filter((sub) =>
          scopeState.enabledLeafKeys.has(`${dept.id}:${cat.id}:${sub}`)
        );

        if (subs.length > 0) {
          list.push({
            deptId: dept.id,
            deptName: dept.name,
            catId: cat.id,
            catName: cat.name,
            fullPath: formatPersonaPath(dept.id, cat.id),
            sizingParent: derived.sizingParent,
            gender: derived.gender,
            ageGroup: derived.ageGroup,
          });

          subs.forEach((sub) => {
            list.push({
              deptId: dept.id,
              deptName: dept.name,
              catId: cat.id,
              catName: cat.name,
              subCat: sub,
              fullPath: formatPersonaPath(dept.id, cat.id, sub),
              sizingParent: derived.sizingParent,
              gender: derived.gender,
              ageGroup: derived.ageGroup,
            });
          });
        }
      });

      // Custom leaves for this department
      scopeState.customLeaves
        .filter((cl) => cl.deptId === dept.id)
        .forEach((cl) => {
          list.push({
            deptId: dept.id,
            deptName: dept.name,
            catId: cl.catId as PersonaCategoryId,
            catName: cl.catId,
            subCat: cl.subCategory,
            fullPath: `${dept.name} > ${cl.catId} > ${cl.label}`,
            sizingParent: 'Tops',
            gender: 'female',
            ageGroup: 'adult',
          });
        });
    });
    return list;
  }, [scopeState]);

  // Global search matches
  const matchingGlobalPaths = useMemo(() => {
    if (!taxonomySearch.trim()) return [];
    const q = taxonomySearch.toLowerCase().trim();
    return allTaxonomyPaths.filter(
      (p) =>
        p.fullPath.toLowerCase().includes(q) ||
        (p.subCat && p.subCat.toLowerCase().includes(q)) ||
        p.catName.toLowerCase().includes(q) ||
        p.deptName.toLowerCase().includes(q)
    );
  }, [allTaxonomyPaths, taxonomySearch]);

  // Selected item names for display in the right panel target badge
  const selectedItemsPreview = useMemo(() => {
    const list = categories.filter((c) => selectedIds.has(c.id));
    return list;
  }, [categories, selectedIds]);

  // Auto-expand relevant department when a store category is selected
  useEffect(() => {
    if (selectedItemsPreview.length === 1) {
      const item = selectedItemsPreview[0];
      if (item.departmentId) {
        setExpandedDepts((prev) => ({ ...prev, [item.departmentId!]: true }));
      } else {
        const lower = (item.name + ' ' + item.storePath).toLowerCase();
        if (lower.includes('women')) {
          setExpandedDepts((prev) => ({ ...prev, women: true }));
        } else if (lower.includes('men') && !lower.includes('women')) {
          setExpandedDepts((prev) => ({ ...prev, men: true }));
        } else if (lower.includes('kid') || lower.includes('boy') || lower.includes('girl')) {
          setExpandedDepts((prev) => ({
            ...prev,
            'kids-boys': true,
            'kids-girls': true,
            'kids-unisex': true,
          }));
        }
      }
    }
  }, [selectedIds, categories, selectedItemsPreview]);

  return (
    <div className="w-full flex flex-col space-y-4 pb-12 font-sans">
      {/* ===================================================================== */}
      {/* 1. SLIM TOP TOOLBAR (Clean, unobtrusive, no bulky header)              */}
      {/* ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        {/* Title & Coverage status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Store Category Mapping
            </h1>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              {mappedCount} of {fashionTotal} mapped ({mappedPercentage}%)
            </span>
            {unmappedCount > 0 && (
              <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                {unmappedCount} unmapped
              </span>
            )}
            <span className="text-slate-400 hidden md:inline">•</span>
            <span className="text-slate-500 hidden md:inline font-mono text-[11px]">
              {storeConnection.storeName} ({storeConnection.platform.toUpperCase()})
            </span>
          </div>
        </div>

        {/* Toolbar actions */}
        <div className="flex items-center gap-2">
          {/* Auto Match Button */}
          <button
            type="button"
            onClick={handleAutoMatchUnmapped}
            title="Auto-match unmapped categories based on naming rules"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Auto-Match</span>
          </button>

          {/* Reset to defaults */}
          <button
            type="button"
            onClick={handleResetToDefaults}
            title="Reset mapping state"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSaveChanges}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
              hasUnsavedChanges
                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-600/20'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
            {hasUnsavedChanges && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
            )}
          </button>

          {/* Proceed to Setup */}
          {onContinueToSetup && (
            <button
              type="button"
              onClick={onContinueToSetup}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-sm shadow-purple-500/20 active:scale-98 transition-all cursor-pointer"
            >
              <span>Proceed to Setup</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Transient save confirmation banner */}
      {saveSuccessMessage && (
        <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Global Feedback Banner */}
      {actionFeedback && (
        <div
          className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 animate-fadeIn ${
            actionFeedback.type === 'success'
              ? 'bg-purple-50 text-purple-900 border border-purple-200'
              : actionFeedback.type === 'warn'
              ? 'bg-amber-50 text-amber-900 border border-amber-200'
              : 'bg-slate-100 text-slate-800 border border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' && <Check className="w-3.5 h-3.5 text-purple-700" />}
            {actionFeedback.type === 'warn' && <AlertCircle className="w-3.5 h-3.5 text-amber-700" />}
            {actionFeedback.type === 'info' && <Info className="w-3.5 h-3.5 text-slate-600" />}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-700 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drag & Drop Guidance & Real-time Drag Indicator */}
      <div className="px-4 py-2.5 rounded-xl bg-purple-50/70 border border-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-purple-950">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Move className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs">
            <span className="font-extrabold text-purple-950">Drag &amp; Drop 1-to-1 Mapping:</span>{' '}
            <span className="text-purple-800">
              Drag any store collection from the left panel and drop onto a Persona path on the right. Dropping a new category onto an already mapped path replaces the previous one automatically.
            </span>
          </div>
        </div>

        {draggedCategory ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-200/90 text-purple-950 font-bold text-xs shrink-0 animate-pulse border border-purple-300 shadow-2xs">
            <GripVertical className="w-3.5 h-3.5 text-purple-700" />
            <span className="truncate max-w-[200px]">Dragging: {draggedCategory.name}</span>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold text-purple-700/80 shrink-0">
            <Sparkles className="w-3 h-3 text-purple-500" />
            <span>1 PLP = 1 Persona Path</span>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. MAIN WORKSPACE: SPLIT SCREEN (LEFT: STORE, RIGHT: PERSONA TREE)    */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* =================================================================== */}
        {/* LEFT PANEL (COL 1-4): STORE CATEGORIES (MERCHANT PLP PAGES)         */}
        {/* =================================================================== */}
        <div className="lg:col-span-4 xl:col-span-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex flex-col overflow-hidden min-w-0">
          {/* Left Panel Top Toolbar */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>Store Categories</span>
                  <span className="text-[11px] font-mono text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    {filteredCategories.length} pages
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Actual store collection &amp; PLP routes from your catalog
                </p>
              </div>

              {/* Sorting selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="text-[11px] text-slate-400 font-medium">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="unmapped_first">Unmapped First</option>
                  <option value="products_desc">Most Products</option>
                  <option value="name_asc">Name A-Z</option>
                </select>
              </div>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search category name, path, or Persona match... (Press '/' to focus)"
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs / Chips */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-purple-100 text-purple-900 border border-purple-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-transparent'
                  }`}
                >
                  All ({totalCount})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('unmapped')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
                    statusFilter === 'unmapped'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-transparent'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Unmapped ({unmappedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('mapped')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
                    statusFilter === 'mapped'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-transparent'
                  }`}
                >
                  <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                  <span>Mapped ({mappedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('excluded')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
                    statusFilter === 'excluded'
                      ? 'bg-zinc-200 text-zinc-900 border border-zinc-300 shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-transparent'
                  }`}
                >
                  <Ban className="w-3 h-3 text-zinc-600" />
                  <span>Excluded ({excludedCount})</span>
                </button>
              </div>

              {/* Multi-select Header Checkbox */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {selectedIds.size > 0 && selectedIds.size === filteredCategories.length ? (
                    <CheckSquare className="w-4 h-4 text-purple-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {selectedIds.size === filteredCategories.length && filteredCategories.length > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </span>
                </button>
              </div>
            </div>

            {/* Bulk Action Bar (Visible when 1+ selected) */}
            {selectedIds.size > 0 && (
              <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200/90 flex items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                    {selectedIds.size}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-purple-950 truncate block">
                      {selectedIds.size} {selectedIds.size === 1 ? 'category' : 'categories'} selected
                    </span>
                    {selectedIds.size === 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const id = Array.from(selectedIds)[0];
                          if (typeof id === 'string') {
                            locateAndHighlightCategory(id);
                          }
                        }}
                        className="text-[10px] text-purple-700 hover:text-purple-900 underline font-semibold cursor-pointer"
                      >
                        Scroll to selected in list
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleBulkExclude}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-300 transition-colors cursor-pointer"
                  >
                    Exclude
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkClearMapping}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                  >
                    Unmap
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-purple-100/80 transition-colors cursor-pointer"
                    title="Clear selection (Esc)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Store Categories List */}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[640px]">
            {filteredCategories.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Filter className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">No store categories match your filters</p>
                <p className="text-[11px] text-slate-400">
                  Try clearing search keywords or switching filter chips.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="mt-2 text-xs font-bold text-purple-700 hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = selectedIds.has(cat.id);
                const isMapped = cat.status === 'mapped';
                const isExcluded = cat.status === 'excluded';
                const isDragging = draggedCategoryId === cat.id;
                const isHighlighted = highlightedCategoryId === cat.id;

                return (
                  <div
                    key={cat.id}
                    id={`category-item-${cat.id}`}
                    draggable={!isExcluded}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', cat.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedCategoryId(cat.id);
                    }}
                    onDragEnd={() => {
                      setDraggedCategoryId(null);
                      setDragOverTargetKey(null);
                    }}
                    onClick={() => handleToggleSelectOne(cat.id)}
                    className={`p-3 transition-all flex flex-col gap-2 border-b border-slate-100 last:border-b-0 select-none ${
                      isExcluded
                        ? 'bg-slate-50/60 opacity-60 hover:opacity-100 border-l-4 border-l-zinc-300 cursor-default'
                        : 'cursor-grab active:cursor-grabbing'
                    } ${
                      isDragging
                        ? 'opacity-40 bg-purple-100 border-2 border-dashed border-purple-500 scale-[0.99]'
                        : isHighlighted
                        ? 'bg-purple-100/90 border-l-4 border-l-purple-600 ring-2 ring-purple-400 shadow-md scale-[1.01]'
                        : isSelected
                        ? 'bg-purple-50/90 border-l-4 border-l-purple-600 ring-1 ring-purple-300'
                        : isMapped
                        ? 'bg-emerald-50/50 hover:bg-emerald-50/80 border-l-4 border-l-emerald-600'
                        : 'bg-white hover:bg-slate-50 border-l-4 border-l-amber-400/80'
                    }`}
                  >
                    {/* Top Row: Selection Checkbox + Full Category Name + Status Badges */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        {/* Drag Handle Indicator */}
                        {!isExcluded && (
                          <div
                            className="text-slate-300 hover:text-purple-600 p-0.5 rounded shrink-0 cursor-grab active:cursor-grabbing mt-0.5"
                            title="Drag and drop onto a right-side Persona path to map"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        )}

                        {/* Explicit Selection Checkbox (always stays a checkbox) */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectOne(cat.id, e)}
                          className="text-slate-400 hover:text-purple-600 focus:outline-none shrink-0 mt-0.5 cursor-pointer"
                          aria-label={isSelected ? 'Deselect category' : 'Select category'}
                          title={isSelected ? 'Deselect this category' : 'Select this category'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-purple-500" />
                          )}
                        </button>

                        {/* Full Name (with wrap) & Path */}
                        <div className="min-w-0 flex-1">
                          <span
                            className={`text-xs font-bold tracking-tight block leading-snug break-words ${
                              isExcluded ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                            title={cat.name}
                          >
                            {cat.name}
                          </span>
                          <div className="text-[11px] text-slate-500 font-mono truncate flex items-center gap-1 mt-0.5">
                            <span className="text-slate-400 select-none">Path:</span>
                            <span className="truncate text-slate-600" title={cat.storePath}>
                              {cat.storePath}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Badges & Action Controls */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80 whitespace-nowrap">
                            {cat.productCount} SKUs
                          </span>

                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                              Mapped
                            </span>
                          ) : isExcluded ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                              Excluded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Unmapped
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {isMapped && (
                            <button
                              type="button"
                              onClick={(e) => handleUnmapSingleCategory(cat.id, cat.name, e)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Unmap this category"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewCategory(cat);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 transition-colors shadow-2xs cursor-pointer"
                            title="Preview items in this collection"
                          >
                            <Eye className="w-3 h-3 text-purple-600" />
                            <span>Preview</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* If mapped, display assigned Persona path pill */}
                    {isMapped && cat.assignedPersonaPath && (
                      <div className="ml-6 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-emerald-100/70 border border-emerald-200 text-[11px] text-emerald-950 font-medium">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-emerald-800 shrink-0">Mapped to:</span>
                          <span className="font-mono text-emerald-950 font-semibold truncate">
                            {cat.assignedPersonaPath}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-white/80 px-1.5 py-0.5 rounded border border-emerald-200/60 shrink-0">
                          Active
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT PANEL (COL 5-12): PERSONA FIXED TAXONOMY READY PATHS TO FILL  */}
        {/* =================================================================== */}
        <div className="lg:col-span-8 xl:col-span-8 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex flex-col overflow-hidden sticky top-20">
          {!isScopeConfigured ? (
            /* ----------------------------------------------------------------- */
            /* EMPTY STATE: "START MAPPING" POPUP TRIGGER                        */
            /* ----------------------------------------------------------------- */
            <div className="flex flex-col h-full min-h-[620px]">
              {/* Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-2xs">
                    <FolderTree className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                      Persona Fixed Taxonomy Hierarchy
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Configure what your store sells to activate mapping hierarchy
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScopeModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 transition-colors shadow-2xs cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
                  <span>Configure What You Sell</span>
                </button>
              </div>

              {/* Empty state visual & Start Mapping CTA */}
              <div className="flex-1 p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 my-auto">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-600 shadow-sm">
                    <Layers className="w-10 h-10 stroke-[1.75]" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-md">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>

                <div className="max-w-md space-y-2">
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                    Define What You Sell to Start Mapping
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Select which departments and merchandise categories your retail catalog carries. Only your active categories will be shown in the taxonomy mapping workspace.
                  </p>
                </div>

                {/* Structured features */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg text-left">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-xs font-bold text-slate-900 block">Department Scope</span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Enable Women, Men, Unisex, and Kids apparel divisions
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-xs font-bold text-slate-900 block">Category Control</span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Select tops, dresses, bottoms, outerwear, and footwear
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                    <span className="text-xs font-bold text-slate-900 block">Custom Categories</span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Add custom garment types and custom categories on the fly
                    </p>
                  </div>
                </div>

                {/* Primary Button: Start Mapping */}
                <button
                  type="button"
                  onClick={() => setIsScopeModalOpen(true)}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Start Mapping</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          ) : (
            /* ----------------------------------------------------------------- */
            /* CONFIGURED TAXONOMY HIERARCHY (NO CHECKBOXES ON RIGHT SIDE)       */
            /* ----------------------------------------------------------------- */
            <>
              {/* Panel Header & Scope Management Trigger */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-2xs">
                      <FolderTree className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                        Persona Fixed Taxonomy Hierarchy
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {scopeState.enabledDeptIds.size} departments active •{' '}
                        {scopeState.enabledLeafKeys.size + scopeState.customLeaves.length} categories enabled
                      </p>
                    </div>
                  </div>

                  {/* Persistent button to re-open "What you sell" popup at any time */}
                  <button
                    type="button"
                    onClick={() => setIsScopeModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 transition-colors shadow-2xs cursor-pointer"
                    title="Change active departments, categories or add custom items"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
                    <span>Configure What You Sell</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </button>
                </div>

                {/* Target Category Callout */}
                <div
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    selectedItemsPreview.length > 0
                      ? 'bg-purple-50/90 border-purple-200/90 text-purple-950'
                      : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700">
                          Ready to fill for:
                        </span>
                        {selectedItemsPreview.length === 1 && selectedItemsPreview[0].assignedPersonaPath && (
                          <span className="text-[10px] font-mono font-medium text-purple-800 bg-purple-200/60 px-1.5 py-0.2 rounded truncate max-w-[280px]">
                            Current: {selectedItemsPreview[0].assignedPersonaPath}
                          </span>
                        )}
                      </div>

                      <div className="font-bold truncate text-slate-900 mt-0.5">
                        {selectedItemsPreview.length === 0 ? (
                          <span className="text-slate-500 font-normal italic">
                            Select any store category on the left to map its taxonomy path
                          </span>
                        ) : selectedItemsPreview.length === 1 ? (
                          <span>
                            "{selectedItemsPreview[0].name}"{' '}
                            <span className="text-slate-400 font-normal text-[11px]">
                              ({selectedItemsPreview[0].productCount} products • Store route:{' '}
                              <code className="text-slate-600">{selectedItemsPreview[0].storePath}</code>)
                            </span>
                          </span>
                        ) : (
                          <span>
                            {selectedItemsPreview.length} store categories selected (
                            {selectedItemsPreview
                              .map((c) => c.name)
                              .slice(0, 2)
                              .join(', ')}
                            {selectedItemsPreview.length > 2 ? '...' : ''})
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedItemsPreview.length > 0 && (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-200/80 px-2.5 py-1 rounded-full shrink-0 shadow-2xs">
                        Target Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Instant Path Filter / Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={taxonomySearch}
                    onChange={(e) => setTaxonomySearch(e.target.value)}
                    placeholder="Filter ready paths across your enabled departments..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all placeholder:text-slate-400"
                  />
                  {taxonomySearch && (
                    <button
                      type="button"
                      onClick={() => setTaxonomySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Department Quick Filter Tabs (Only enabled departments) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setDeptFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        deptFilter === 'all'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      All ({scopeState.enabledDeptIds.size} Depts)
                    </button>
                    {PERSONA_DEPARTMENTS.filter((d) => scopeState.enabledDeptIds.has(d.id)).map((d) => {
                      const isSelected = deptFilter === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDeptFilter(d.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          {d.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={handleExpandAllDepts}
                      className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded hover:bg-purple-50 cursor-pointer"
                    >
                      Expand All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleCollapseAllDepts}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Taxonomy Tree Content (NO CHECKBOXES) */}
              <div className="p-4 space-y-4 max-h-[750px] overflow-y-auto bg-slate-50/40">
                {/* Global Search Results Alert if active */}
                {taxonomySearch.trim() && (
                  <div className="flex items-center justify-between text-xs text-slate-600 bg-purple-50/80 border border-purple-200/80 px-3 py-2 rounded-xl">
                    <span>
                      Filtering active paths containing{' '}
                      <strong className="text-purple-900 font-bold">"{taxonomySearch}"</strong>:
                    </span>
                    <span className="font-mono text-xs font-extrabold text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                      {matchingGlobalPaths.length} ready paths
                    </span>
                  </div>
                )}

                {/* Tree Container (NO CHECKBOXES) */}
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs divide-y divide-slate-100 overflow-hidden">
                  {PERSONA_DEPARTMENTS.filter(
                    (dept) =>
                      scopeState.enabledDeptIds.has(dept.id) &&
                      (deptFilter === 'all' || dept.id === deptFilter)
                  ).map((dept) => {
                    const isSearching = Boolean(taxonomySearch.trim());
                    const query = taxonomySearch.toLowerCase().trim();

                    // Check matches in this department
                    const deptMatchingCount = isSearching
                      ? matchingGlobalPaths.filter((p) => p.deptId === dept.id).length
                      : 0;

                    if (isSearching && deptMatchingCount === 0) {
                      return null;
                    }

                    const isDeptExpanded = isSearching ? true : (expandedDepts[dept.id] ?? true);

                    // Active leaves in this department
                    const activeDeptStandardLeaves = orderedCategoriesList.flatMap((cat) => {
                      const allSubs = PERSONA_SUB_CATEGORIES[dept.id]?.[cat.id] || [];
                      return allSubs
                        .filter((sub) => scopeState.enabledLeafKeys.has(`${dept.id}:${cat.id}:${sub}`))
                        .map((sub) => ({ catId: cat.id, sub }));
                    });
                    const activeDeptCustomLeaves = scopeState.customLeaves.filter(
                      (cl) => cl.deptId === dept.id
                    );
                    const totalDeptActiveLeaves =
                      activeDeptStandardLeaves.length + activeDeptCustomLeaves.length;

                    // Calculate total SKUs in this department
                    const deptTotalSkus = activeDeptStandardLeaves.reduce(
                      (acc, leaf) => acc + getLeafSkuCount(dept.id, leaf.catId, leaf.sub),
                      0
                    );

                    return (
                      <div key={dept.id} className="transition-colors">
                        {/* Top-Level Department Row (NO CHECKBOX) */}
                        <div className="px-4 py-3 bg-slate-50/70 flex items-center justify-between select-none">
                          <button
                            type="button"
                            onClick={() => toggleDeptExpanded(dept.id)}
                            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer text-left group"
                          >
                            <span className="p-1 rounded text-slate-500 group-hover:text-slate-800 transition-colors">
                              {isDeptExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </span>

                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-sm font-bold text-slate-900 group-hover:text-purple-950">
                                {dept.name}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/60 font-normal">
                                Path: {dept.name}
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                              {totalDeptActiveLeaves} categories
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                              {deptTotalSkus.toLocaleString()} SKUs
                            </span>
                          </div>
                        </div>

                        {/* Categories under Department (NO CHECKBOXES) */}
                        {isDeptExpanded && (
                          <div className="pl-6 pr-4 py-2 space-y-3 bg-white">
                            {/* Standard 5 Categories */}
                            {orderedCategoriesList.map((cat) => {
                              const catKey = `${dept.id}:${cat.id}`;
                              const allSubs = PERSONA_SUB_CATEGORIES[dept.id]?.[cat.id] || [];
                              const catDisplayName = getCategoryDisplayName(cat.id);
                              const catPath = formatPersonaPath(dept.id, cat.id);

                              // Only include leaves that are enabled in scopeState
                              const enabledSubs = allSubs.filter((sub) =>
                                scopeState.enabledLeafKeys.has(`${dept.id}:${cat.id}:${sub}`)
                              );

                              // Custom leaves under this cat
                              const customLeavesUnderCat = scopeState.customLeaves.filter(
                                (cl) => cl.deptId === dept.id && cl.catId === cat.id
                              );

                              // Filter if user is typing a search query
                              const filteredSubs = isSearching
                                ? enabledSubs.filter((sub) => {
                                    const label = formatLeafLabel(sub).toLowerCase();
                                    const full = formatPersonaPath(dept.id, cat.id, sub).toLowerCase();
                                    return (
                                      sub.toLowerCase().includes(query) ||
                                      label.includes(query) ||
                                      catDisplayName.toLowerCase().includes(query) ||
                                      dept.name.toLowerCase().includes(query) ||
                                      full.includes(query)
                                    );
                                  })
                                : enabledSubs;

                              const filteredCustom = isSearching
                                ? customLeavesUnderCat.filter((cl) => {
                                    const q = query;
                                    return (
                                      cl.label.toLowerCase().includes(q) ||
                                      cl.subCategory.toLowerCase().includes(q) ||
                                      catDisplayName.toLowerCase().includes(q)
                                    );
                                  })
                                : customLeavesUnderCat;

                              // If no active subcategories in this category, don't show it (keeps right side clean!)
                              if (filteredSubs.length === 0 && filteredCustom.length === 0) {
                                return null;
                              }

                              const isCatExpanded = isSearching ? true : (expandedCats[catKey] ?? true);

                              return (
                                <div
                                  key={cat.id}
                                  className="border-l-2 border-slate-200 pl-3 py-1 space-y-2"
                                >
                                  {/* Category Header Row (NO CHECKBOX) */}
                                  <div className="flex items-center justify-between select-none">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => toggleCatExpanded(dept.id, cat.id)}
                                        className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                                        title={isCatExpanded ? 'Collapse' : 'Expand'}
                                      >
                                        {isCatExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5" />
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleAssignTaxonomy(dept.id, cat.id)}
                                        className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-purple-700 cursor-pointer text-left min-w-0"
                                        title="Click to map category-level path to selected category"
                                      >
                                        <Tag className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                        <span>{catDisplayName}</span>
                                        <span className="text-[10px] font-mono font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60 truncate">
                                          Path: {dept.name} &gt; {catDisplayName}
                                        </span>
                                      </button>
                                    </div>

                                    <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                                      {filteredSubs.length + filteredCustom.length} active
                                    </span>
                                  </div>

                                  {/* Leaf Cards (NO CHECKBOXES) */}
                                  {isCatExpanded && (
                                    <div className="pl-6 space-y-1.5 pt-1">
                                      {/* Standard Subcategories */}
                                      {filteredSubs.map((sub) => {
                                        const fullPath = formatPersonaPath(dept.id, cat.id, sub);
                                        const leafLabel = formatLeafLabel(sub);
                                        const skuCount = getLeafSkuCount(dept.id, cat.id, sub);
                                        const targetKey = `${dept.id}:${cat.id}:${sub}`;
                                        const isDragOver = dragOverTargetKey === targetKey;
                                        const mappedCategories = getMappedCategoriesForNode(dept.id, cat.id, sub);
                                        const hasMapped = mappedCategories.length > 0;
                                        const isSelectedCatMappedHere =
                                          selectedItemsPreview.length === 1 &&
                                          selectedItemsPreview[0].assignedPersonaPath === fullPath;

                                        return (
                                          <div
                                            key={sub}
                                            onDragOver={(e) => {
                                              e.preventDefault();
                                              e.dataTransfer.dropEffect = 'move';
                                              if (dragOverTargetKey !== targetKey) {
                                                setDragOverTargetKey(targetKey);
                                              }
                                            }}
                                            onDragLeave={(e) => {
                                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                if (dragOverTargetKey === targetKey) {
                                                  setDragOverTargetKey(null);
                                                }
                                              }
                                            }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              setDragOverTargetKey(null);
                                              const droppedId = e.dataTransfer.getData('text/plain') || draggedCategoryId;
                                              if (droppedId) {
                                                handleDropOnTaxonomy(droppedId, dept.id, cat.id, sub);
                                              }
                                              setDraggedCategoryId(null);
                                            }}
                                            onClick={() => handleAssignTaxonomy(dept.id, cat.id, sub)}
                                            className={`group flex flex-col gap-1.5 p-2.5 rounded-xl text-xs transition-all cursor-pointer border select-none ${
                                              isDragOver
                                                ? 'bg-purple-100 border-purple-500 ring-2 ring-purple-400 shadow-md scale-[1.01]'
                                                : hasMapped
                                                ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300/80 shadow-2xs'
                                                : isSelectedCatMappedHere
                                                ? 'bg-purple-50/90 border-purple-300 text-purple-950 font-semibold ring-1 ring-purple-400 shadow-2xs'
                                                : draggedCategoryId !== null
                                                ? 'bg-purple-50/20 border-dashed border-purple-300 hover:border-purple-400 hover:bg-purple-50/50'
                                                : 'bg-white hover:bg-purple-50/50 border-slate-200 hover:border-purple-300 text-slate-800 hover:shadow-2xs'
                                            }`}
                                          >
                                            {/* Top Header: Label, Mapped Badge, SKU Count */}
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <span
                                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                                    hasMapped ? 'bg-emerald-500' : 'bg-purple-500'
                                                  }`}
                                                />
                                                <div className="min-w-0 flex items-center gap-2">
                                                  <span className="truncate font-bold text-slate-900 group-hover:text-purple-950">
                                                    {leafLabel}
                                                  </span>
                                                  {hasMapped && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                      {mappedCategories.length === 1
                                                        ? 'Mapped'
                                                        : `${mappedCategories.length} Mapped`}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                                {skuCount.toLocaleString()} SKUs
                                              </span>
                                            </div>

                                            {/* Path Line */}
                                            <div className="text-[10px] text-slate-400 truncate font-mono pl-4.5">
                                              Path: {dept.name} &gt; {catDisplayName} &gt; {leafLabel}
                                            </div>

                                            {/* Drag Over Active Feedback */}
                                            {isDragOver ? (
                                              <div className="ml-4.5 p-1.5 rounded-lg bg-purple-200/90 border border-purple-400 text-purple-950 flex items-center justify-between text-[11px] font-bold animate-pulse">
                                                <span className="flex items-center gap-1.5 truncate">
                                                  <ArrowRight className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                                  <span className="truncate">
                                                    Drop to map "{draggedCategory?.name}"
                                                    {hasMapped ? ` (${mappedCategories.length} already mapped)` : ''}
                                                  </span>
                                                </span>
                                                <span className="text-[9px] uppercase tracking-wider bg-purple-300 px-1.5 py-0.5 rounded text-purple-950 shrink-0">
                                                  Drop to Map
                                                </span>
                                              </div>
                                            ) : hasMapped ? (
                                              /* Mapped Category Highlight Boxes with Direct Unmap Action for Each */
                                              <div className="ml-4.5 space-y-1.5">
                                                {mappedCategories.map((mc) => (
                                                  <div
  key={mc.id}
  onClick={(e) => {
    e.stopPropagation();
    locateAndHighlightCategory(mc.id);
  }}
  className="p-1.5 rounded-lg bg-white/95 border border-emerald-300 hover:border-purple-400 hover:ring-2 hover:ring-purple-300/60 text-emerald-950 flex items-center justify-between gap-2 shadow-2xs cursor-pointer transition-all group/plp"
  title={`Click to locate & highlight "${mc.name}" on the left catalog list`}
>
  <div className="flex items-center gap-1.5 min-w-0">
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 group-hover/plp:text-purple-600 transition-colors" />
    <span className="text-[10px] uppercase font-extrabold text-emerald-800 tracking-wider shrink-0">
      Store PLP:
    </span>
    <span
      className="font-bold text-xs text-slate-900 truncate group-hover/plp:text-purple-950 transition-colors"
      title={mc.name}
    >
      "${mc.name}"
    </span>
    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
      {mc.productCount} SKUs
    </span>
    <span className="text-[9px] font-semibold text-purple-700 bg-purple-50 group-hover/plp:bg-purple-100 px-1.5 py-0.5 rounded opacity-0 group-hover/plp:opacity-100 transition-opacity shrink-0">
      Locate in list
    </span>
  </div>

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleUnmapSingleCategory(mc.id, mc.name, e);
    }}
    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
    title="Unmap this store category"
  >
    <X className="w-3.5 h-3.5" />
  </button>
</div>
                                                ))}
                                              </div>
                                            ) : draggedCategoryId !== null ? (
                                              /* Prompt to drop when dragging is in progress */
                                              <div className="ml-4.5 text-[11px] text-purple-600 font-medium flex items-center gap-1">
                                                <Move className="w-3 h-3 text-purple-500" />
                                                <span>Drop "{draggedCategory?.name}" here</span>
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}

                                      {/* Custom Subcategories under this category */}
                                      {filteredCustom.map((custom) => {
                                        const customPath = `${dept.name} > ${catDisplayName} > ${custom.label}`;
                                        const customTargetKey = `custom-leaf:${custom.id}`;
                                        const isDragOver = dragOverTargetKey === customTargetKey;
                                        const mappedCategories = getMappedCategoriesForNode(
                                          dept.id,
                                          cat.id,
                                          custom.subCategory,
                                          customPath
                                        );
                                        const hasMapped = mappedCategories.length > 0;
                                        const isLeafMappedToTarget =
                                          selectedItemsPreview.length === 1 &&
                                          selectedItemsPreview[0].assignedPersonaPath === customPath;

                                        return (
                                          <div
                                            key={custom.id}
                                            onDragOver={(e) => {
                                              e.preventDefault();
                                              e.dataTransfer.dropEffect = 'move';
                                              if (dragOverTargetKey !== customTargetKey) {
                                                setDragOverTargetKey(customTargetKey);
                                              }
                                            }}
                                            onDragLeave={(e) => {
                                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                if (dragOverTargetKey === customTargetKey) {
                                                  setDragOverTargetKey(null);
                                                }
                                              }
                                            }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              setDragOverTargetKey(null);
                                              const droppedId = e.dataTransfer.getData('text/plain') || draggedCategoryId;
                                              if (droppedId) {
                                                handleDropOnTaxonomy(droppedId, dept.id, cat.id, custom.subCategory, customPath);
                                              }
                                              setDraggedCategoryId(null);
                                            }}
                                            onClick={() =>
                                              handleAssignTaxonomy(
                                                dept.id,
                                                cat.id,
                                                custom.subCategory,
                                                customPath
                                              )
                                            }
                                            className={`group flex flex-col gap-1.5 p-2.5 rounded-xl text-xs transition-all cursor-pointer border select-none ${
                                              isDragOver
                                                ? 'bg-purple-100 border-purple-500 ring-2 ring-purple-400 shadow-md scale-[1.01]'
                                                : hasMapped
                                                ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300/80 shadow-2xs'
                                                : isLeafMappedToTarget
                                                ? 'bg-purple-50/90 border-purple-300 text-purple-950 font-semibold ring-1 ring-purple-400 shadow-2xs'
                                                : draggedCategoryId !== null
                                                ? 'bg-purple-50/20 border-dashed border-purple-300 hover:border-purple-400 hover:bg-purple-50/50'
                                                : 'bg-white hover:bg-amber-50/40 border-slate-200 hover:border-amber-300 text-slate-800'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span
                                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                                    hasMapped ? 'bg-emerald-500' : 'bg-amber-500'
                                                  }`}
                                                />
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className="truncate font-bold text-slate-900">
                                                    {custom.label}
                                                  </span>
                                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                                                    Custom
                                                  </span>
                                                  {hasMapped && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                      {mappedCategories.length === 1
                                                        ? 'Mapped'
                                                        : `${mappedCategories.length} Mapped`}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              <span className="text-[11px] font-mono text-slate-400 italic shrink-0">
                                                Custom Item
                                              </span>
                                            </div>

                                            <div className="text-[10px] text-slate-400 truncate font-mono pl-4">
                                              Path: {customPath}
                                            </div>

                                            {isDragOver ? (
                                              <div className="ml-4 p-1.5 rounded-lg bg-purple-200/90 border border-purple-400 text-purple-950 flex items-center justify-between text-[11px] font-bold animate-pulse">
                                                <span className="flex items-center gap-1.5 truncate">
                                                  <ArrowRight className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                                  <span className="truncate">
                                                    Drop to map "{draggedCategory?.name}"
                                                    {hasMapped ? ` (${mappedCategories.length} already mapped)` : ''}
                                                  </span>
                                                </span>
                                                <span className="text-[9px] uppercase tracking-wider bg-purple-300 px-1.5 py-0.5 rounded text-purple-950 shrink-0">
                                                  Drop
                                                </span>
                                              </div>
                                            ) : hasMapped ? (
                                              <div className="ml-4 space-y-1.5">
                                                {mappedCategories.map((mc) => (
                                                  <div
  key={mc.id}
  onClick={(e) => {
    e.stopPropagation();
    locateAndHighlightCategory(mc.id);
  }}
  className="p-1.5 rounded-lg bg-white/95 border border-emerald-300 hover:border-purple-400 hover:ring-2 hover:ring-purple-300/60 text-emerald-950 flex items-center justify-between gap-2 shadow-2xs cursor-pointer transition-all group/plp"
  title={`Click to locate & highlight "${mc.name}" on the left catalog list`}
>
  <div className="flex items-center gap-1.5 min-w-0">
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 group-hover/plp:text-purple-600 transition-colors" />
    <span className="text-[10px] uppercase font-extrabold text-emerald-800 tracking-wider shrink-0">
      Store PLP:
    </span>
    <span
      className="font-bold text-xs text-slate-900 truncate group-hover/plp:text-purple-950 transition-colors"
      title={mc.name}
    >
      "${mc.name}"
    </span>
    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
      {mc.productCount} SKUs
    </span>
    <span className="text-[9px] font-semibold text-purple-700 bg-purple-50 group-hover/plp:bg-purple-100 px-1.5 py-0.5 rounded opacity-0 group-hover/plp:opacity-100 transition-opacity shrink-0">
      Locate in list
    </span>
  </div>

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleUnmapSingleCategory(mc.id, mc.name, e);
    }}
    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
    title="Unmap this store category"
  >
    <X className="w-3.5 h-3.5" />
  </button>
</div>
                                                ))}
                                              </div>
                                            ) : draggedCategoryId !== null ? (
                                              <div className="ml-4 text-[11px] text-purple-600 font-medium flex items-center gap-1">
                                                <Move className="w-3 h-3 text-purple-500" />
                                                <span>Drop "{draggedCategory?.name}" here</span>
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Any Custom Categories under this department */}
                            {scopeState.customCategories
                              .filter((cc) => cc.deptId === dept.id)
                              .map((customCat) => {
                                const customCatLeaves = scopeState.customLeaves.filter(
                                  (cl) => cl.deptId === dept.id && cl.catId === customCat.id
                                );

                                return (
                                  <div
                                    key={customCat.id}
                                    className="border-l-2 border-amber-300 pl-3 py-1 space-y-2"
                                  >
                                    <div className="flex items-center justify-between select-none">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                        <Tag className="w-3.5 h-3.5 text-amber-600" />
                                        <span>{customCat.name}</span>
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                          Custom Category
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-slate-400 font-medium">
                                        {customCatLeaves.length} items
                                      </span>
                                    </div>

                                    <div className="pl-6 space-y-1.5 pt-1">
                                      {customCatLeaves.map((cl) => {
                                        const customFullPath = `${dept.name} > ${customCat.name} > ${cl.label}`;
                                        const customLeafKey = `custom-cat-leaf:${cl.id}`;
                                        const isDragOver = dragOverTargetKey === customLeafKey;
                                        const mappedCategories = getMappedCategoriesForNode(
                                          dept.id,
                                          customCat.id,
                                          cl.subCategory,
                                          customFullPath
                                        );
                                        const hasMapped = mappedCategories.length > 0;
                                        const isMapped =
                                          selectedItemsPreview.length === 1 &&
                                          selectedItemsPreview[0].assignedPersonaPath === customFullPath;

                                        return (
                                          <div
                                            key={cl.id}
                                            onDragOver={(e) => {
                                              e.preventDefault();
                                              e.dataTransfer.dropEffect = 'move';
                                              if (dragOverTargetKey !== customLeafKey) {
                                                setDragOverTargetKey(customLeafKey);
                                              }
                                            }}
                                            onDragLeave={(e) => {
                                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                if (dragOverTargetKey === customLeafKey) {
                                                  setDragOverTargetKey(null);
                                                }
                                              }
                                            }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              setDragOverTargetKey(null);
                                              const droppedId = e.dataTransfer.getData('text/plain') || draggedCategoryId;
                                              if (droppedId) {
                                                handleDropOnTaxonomy(
                                                  droppedId,
                                                  dept.id,
                                                  customCat.id,
                                                  cl.subCategory,
                                                  customFullPath
                                                );
                                              }
                                              setDraggedCategoryId(null);
                                            }}
                                            onClick={() =>
                                              handleAssignTaxonomy(
                                                dept.id,
                                                customCat.id,
                                                cl.subCategory,
                                                customFullPath
                                              )
                                            }
                                            className={`group flex flex-col gap-1.5 p-2.5 rounded-xl text-xs transition-all cursor-pointer border select-none ${
                                              isDragOver
                                                ? 'bg-purple-100 border-purple-500 ring-2 ring-purple-400 shadow-md scale-[1.01]'
                                                : hasMapped
                                                ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300/80 shadow-2xs'
                                                : isMapped
                                                ? 'bg-purple-50/90 border-purple-300 text-purple-950 font-semibold ring-1 ring-purple-400 shadow-2xs'
                                                : draggedCategoryId !== null
                                                ? 'bg-purple-50/20 border-dashed border-purple-300 hover:border-purple-400 hover:bg-purple-50/50'
                                                : 'bg-white hover:bg-amber-50/40 border-slate-200 hover:border-amber-300 text-slate-800'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span
                                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                                    hasMapped ? 'bg-emerald-500' : 'bg-amber-500'
                                                  }`}
                                                />
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className="font-semibold text-slate-900 truncate">
                                                    {cl.label}
                                                  </span>
                                                  {hasMapped && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                      {mappedCategories.length === 1 ? 'Mapped' : `${mappedCategories.length} Mapped`}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            <div className="text-[10px] text-slate-400 font-mono truncate pl-4">
                                              Path: {customFullPath}
                                            </div>

                                            {isDragOver ? (
                                              <div className="ml-4 p-1.5 rounded-lg bg-purple-200/90 border border-purple-400 text-purple-950 flex items-center justify-between text-[11px] font-bold animate-pulse">
                                                <span className="flex items-center gap-1.5 truncate">
                                                  <ArrowRight className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                                  <span className="truncate">
                                                    Drop to map "{draggedCategory?.name}"
                                                    {hasMapped ? ` (${mappedCategories.length} already mapped)` : ''}
                                                  </span>
                                                </span>
                                                <span className="text-[9px] uppercase tracking-wider bg-purple-300 px-1.5 py-0.5 rounded text-purple-950 shrink-0">
                                                  Drop
                                                </span>
                                              </div>
                                            ) : hasMapped ? (
                                              <div className="ml-4 space-y-1.5">
                                                {mappedCategories.map((mc) => (
                                                  <div
  key={mc.id}
  onClick={(e) => {
    e.stopPropagation();
    locateAndHighlightCategory(mc.id);
  }}
  className="p-1.5 rounded-lg bg-white/95 border border-emerald-300 hover:border-purple-400 hover:ring-2 hover:ring-purple-300/60 text-emerald-950 flex items-center justify-between gap-2 shadow-2xs cursor-pointer transition-all group/plp"
  title={`Click to locate & highlight "${mc.name}" on the left catalog list`}
>
  <div className="flex items-center gap-1.5 min-w-0">
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 group-hover/plp:text-purple-600 transition-colors" />
    <span className="text-[10px] uppercase font-extrabold text-emerald-800 tracking-wider shrink-0">
      Store PLP:
    </span>
    <span
      className="font-bold text-xs text-slate-900 truncate group-hover/plp:text-purple-950 transition-colors"
      title={mc.name}
    >
      "${mc.name}"
    </span>
    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
      {mc.productCount} SKUs
    </span>
    <span className="text-[9px] font-semibold text-purple-700 bg-purple-50 group-hover/plp:bg-purple-100 px-1.5 py-0.5 rounded opacity-0 group-hover/plp:opacity-100 transition-opacity shrink-0">
      Locate in list
    </span>
  </div>

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleUnmapSingleCategory(mc.id, mc.name, e);
    }}
    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
    title="Unmap this store category"
  >
    <X className="w-3.5 h-3.5" />
  </button>
</div>
                                                ))}
                                              </div>
                                            ) : draggedCategoryId !== null ? (
                                              <div className="ml-4 text-[11px] text-purple-600 font-medium flex items-center gap-1">
                                                <Move className="w-3 h-3 text-purple-500" />
                                                <span>Drop "{draggedCategory?.name}" here</span>
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Empty State when Search has no results */}
                {taxonomySearch.trim() && matchingGlobalPaths.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      No taxonomy paths found matching "{taxonomySearch}"
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Try searching for keywords like "hoodie", "dress", "jean", "sneaker", "blouse", or "coat"
                    </p>
                    <button
                      type="button"
                      onClick={() => setTaxonomySearch('')}
                      className="mt-2 text-xs font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer"
                    >
                      Clear search query
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Catalog Scope Selection Modal Popup ("What you sell") */}
      <CatalogScopeModal
        isOpen={isScopeModalOpen}
        onClose={() => setIsScopeModalOpen(false)}
        scopeState={scopeState}
        onSaveScope={handleSaveScope}
      />

      {/* Category Items Preview Modal Popup */}
      <CategoryItemsPreviewModal
        category={previewCategory}
        onClose={() => setPreviewCategory(null)}
        onSelectForMapping={(cat) => {
          setSelectedIds(new Set([cat.id]));
          showFeedback(`Targeted "${cat.name}" for taxonomy mapping`, 'info');
        }}
      />
    </div>
  );
}
