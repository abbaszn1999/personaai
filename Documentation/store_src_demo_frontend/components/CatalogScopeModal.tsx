import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  Plus,
  Trash2,
  Layers,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Tag,
  ArrowRight,
  FolderPlus,
  Info,
} from 'lucide-react';
import {
  PERSONA_DEPARTMENTS,
  PERSONA_CATEGORIES,
  PERSONA_SUB_CATEGORIES,
  PersonaDepartmentId,
  PersonaCategoryId,
  PersonaDepartmentDef,
  formatLeafLabel,
  getCategoryDisplayName,
} from '../data/personaTaxonomyData';

export interface CustomTaxonomyItem {
  id: string;
  deptId: string;
  catId: string;
  subCategory: string;
  label: string;
  isCustom: true;
}

export interface CustomCategoryDef {
  id: string;
  deptId: string;
  name: string;
  isCustom: true;
}

export interface TaxonomyScopeState {
  enabledDeptIds: Set<string>;
  // Set of keys: `${deptId}:${catId}:${sub}`
  enabledLeafKeys: Set<string>;
  customLeaves: CustomTaxonomyItem[];
  customCategories: CustomCategoryDef[];
}

interface CatalogScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scopeState: TaxonomyScopeState;
  onSaveScope: (newScope: TaxonomyScopeState) => void;
}

// Generate default all-enabled leaf keys
export function getDefaultLeafKeys(): Set<string> {
  const keys = new Set<string>();
  PERSONA_DEPARTMENTS.forEach((dept) => {
    PERSONA_CATEGORIES.forEach((cat) => {
      const subs = PERSONA_SUB_CATEGORIES[dept.id]?.[cat.id] || [];
      subs.forEach((sub) => {
        keys.add(`${dept.id}:${cat.id}:${sub}`);
      });
    });
  });
  return keys;
}

export function getDefaultScopeState(): TaxonomyScopeState {
  return {
    enabledDeptIds: new Set(PERSONA_DEPARTMENTS.map((d) => d.id)),
    enabledLeafKeys: getDefaultLeafKeys(),
    customLeaves: [],
    customCategories: [],
  };
}

export function CatalogScopeModal({
  isOpen,
  onClose,
  scopeState,
  onSaveScope,
}: CatalogScopeModalProps) {
  // Local working state so user can cancel without mutating parent state
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(() => new Set(scopeState.enabledDeptIds));
  const [selectedLeafKeys, setSelectedLeafKeys] = useState<Set<string>>(() => new Set(scopeState.enabledLeafKeys));
  const [customLeaves, setCustomLeaves] = useState<CustomTaxonomyItem[]>(() => [...scopeState.customLeaves]);
  const [customCategories, setCustomCategories] = useState<CustomCategoryDef[]>(() => [...scopeState.customCategories]);

  // Active department being viewed in the configuration pane
  const [activeDeptId, setActiveDeptId] = useState<string>('women');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Inline custom item inputs
  const [newSubcatInput, setNewSubcatInput] = useState<{ [key: string]: string }>({});
  const [addingSubcatFor, setAddingSubcatFor] = useState<string | null>(null);

  // New Category input state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // When modal re-opens, sync from parent props
  React.useEffect(() => {
    if (isOpen) {
      setSelectedDepts(new Set(scopeState.enabledDeptIds));
      setSelectedLeafKeys(new Set(scopeState.enabledLeafKeys));
      setCustomLeaves([...scopeState.customLeaves]);
      setCustomCategories([...scopeState.customCategories]);
      setSearchQuery('');
      setAddingSubcatFor(null);
      setIsAddingCategory(false);
    }
  }, [isOpen, scopeState]);

  if (!isOpen) return null;

  // Toggle Department On/Off
  const handleToggleDept = (deptId: string) => {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
        // Clear all active leaves in this department when disabled
        setSelectedLeafKeys((prevKeys) => {
          const nextKeys = new Set(prevKeys);
          Array.from(nextKeys).forEach((k: string) => {
            if (k.startsWith(`${deptId}:`)) {
              nextKeys.delete(k);
            }
          });
          return nextKeys;
        });
      } else {
        next.add(deptId);
        // When enabling, re-enable all default and custom leaves for this department
        setSelectedLeafKeys((prevKeys) => {
          const nextKeys = new Set(prevKeys);
          PERSONA_CATEGORIES.forEach((cat) => {
            const subs = PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || [];
            subs.forEach((sub) => nextKeys.add(`${deptId}:${cat.id}:${sub}`));
          });
          customLeaves
            .filter((cl) => cl.deptId === deptId)
            .forEach((cl) => nextKeys.add(`${cl.deptId}:${cl.catId}:${cl.subCategory}`));
          return nextKeys;
        });
      }
      return next;
    });
  };

  // Toggle Subcategory Leaf On/Off
  const handleToggleLeaf = (key: string, deptId: string) => {
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Ensure parent dept is enabled
        setSelectedDepts((prevDepts) => new Set(prevDepts).add(deptId));
      }
      return next;
    });
  };

  // Toggle all leaves in a category
  const handleToggleAllInCategory = (deptId: string, catId: string, allKeys: string[]) => {
    const allEnabled = allKeys.every((k) => selectedLeafKeys.has(k));
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      if (allEnabled) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        allKeys.forEach((k) => next.add(k));
        setSelectedDepts((prevDepts) => new Set(prevDepts).add(deptId));
      }
      return next;
    });
  };

  // Toggle all leaves in active department
  const handleToggleAllInDept = (deptId: string) => {
    const deptKeys: string[] = [];
    PERSONA_CATEGORIES.forEach((cat) => {
      const subs = PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || [];
      subs.forEach((sub) => deptKeys.push(`${deptId}:${cat.id}:${sub}`));
    });
    // Include custom leaves for this dept
    customLeaves.filter((cl) => cl.deptId === deptId).forEach((cl) => {
      deptKeys.push(`${cl.deptId}:${cl.catId}:${cl.subCategory}`);
    });

    const allEnabled = deptKeys.length > 0 && deptKeys.every((k) => selectedLeafKeys.has(k));
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      if (allEnabled) {
        deptKeys.forEach((k) => next.delete(k));
      } else {
        deptKeys.forEach((k) => next.add(k));
        setSelectedDepts((prevDepts) => new Set(prevDepts).add(deptId));
      }
      return next;
    });
  };

  // Add Custom Subcategory
  const handleAddCustomSubcategory = (deptId: string, catId: string) => {
    const key = `${deptId}:${catId}`;
    const value = (newSubcatInput[key] || '').trim();
    if (!value) return;

    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const leafKey = `${deptId}:${catId}:${slug}`;

    const newCustomItem: CustomTaxonomyItem = {
      id: `custom-${Date.now()}-${slug}`,
      deptId,
      catId,
      subCategory: slug,
      label: value,
      isCustom: true,
    };

    setCustomLeaves((prev) => [...prev, newCustomItem]);
    setSelectedLeafKeys((prev) => new Set(prev).add(leafKey));
    setSelectedDepts((prev) => new Set(prev).add(deptId));

    // Reset input
    setNewSubcatInput((prev) => ({ ...prev, [key]: '' }));
    setAddingSubcatFor(null);
  };

  // Remove Custom Subcategory
  const handleRemoveCustomSubcategory = (item: CustomTaxonomyItem) => {
    const leafKey = `${item.deptId}:${item.catId}:${item.subCategory}`;
    setCustomLeaves((prev) => prev.filter((cl) => cl.id !== item.id));
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      next.delete(leafKey);
      return next;
    });
  };

  // Add Custom Category under active department
  const handleAddCustomCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const newCat: CustomCategoryDef = {
      id: `custom-cat-${id}`,
      deptId: activeDeptId,
      name,
      isCustom: true,
    };

    setCustomCategories((prev) => [...prev, newCat]);
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  // Presets
  const applyPreset = (preset: 'all' | 'adult' | 'women_only' | 'men_only' | 'kids_only' | 'clear') => {
    if (preset === 'all') {
      setSelectedDepts(new Set(PERSONA_DEPARTMENTS.map((d) => d.id)));
      setSelectedLeafKeys(getDefaultLeafKeys());
    } else if (preset === 'adult') {
      setSelectedDepts(new Set(['women', 'men', 'unisex']));
      const keys = new Set<string>();
      ['women', 'men', 'unisex'].forEach((deptId) => {
        PERSONA_CATEGORIES.forEach((cat) => {
          (PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || []).forEach((sub) => {
            keys.add(`${deptId}:${cat.id}:${sub}`);
          });
        });
      });
      setSelectedLeafKeys(keys);
    } else if (preset === 'women_only') {
      setSelectedDepts(new Set(['women']));
      const keys = new Set<string>();
      PERSONA_CATEGORIES.forEach((cat) => {
        (PERSONA_SUB_CATEGORIES['women']?.[cat.id] || []).forEach((sub) => {
          keys.add(`women:${cat.id}:${sub}`);
        });
      });
      setSelectedLeafKeys(keys);
      setActiveDeptId('women');
    } else if (preset === 'men_only') {
      setSelectedDepts(new Set(['men']));
      const keys = new Set<string>();
      PERSONA_CATEGORIES.forEach((cat) => {
        (PERSONA_SUB_CATEGORIES['men']?.[cat.id] || []).forEach((sub) => {
          keys.add(`men:${cat.id}:${sub}`);
        });
      });
      setSelectedLeafKeys(keys);
      setActiveDeptId('men');
    } else if (preset === 'kids_only') {
      setSelectedDepts(new Set(['kids-boys', 'kids-girls', 'kids-unisex']));
      const keys = new Set<string>();
      ['kids-boys', 'kids-girls', 'kids-unisex'].forEach((deptId) => {
        PERSONA_CATEGORIES.forEach((cat) => {
          (PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || []).forEach((sub) => {
            keys.add(`${deptId}:${cat.id}:${sub}`);
          });
        });
      });
      setSelectedLeafKeys(keys);
      setActiveDeptId('kids-boys');
    } else if (preset === 'clear') {
      setSelectedDepts(new Set());
      setSelectedLeafKeys(new Set());
    }
  };

  // Calculate stats
  const activeLeavesCount = selectedLeafKeys.size;
  const activeDeptsCount = selectedDepts.size;

  // Active department object
  const currentDept = PERSONA_DEPARTMENTS.find((d) => d.id === activeDeptId) || PERSONA_DEPARTMENTS[0];

  // Save changes
  const handleSave = () => {
    onSaveScope({
      enabledDeptIds: selectedDepts,
      enabledLeafKeys: selectedLeafKeys,
      customLeaves,
      customCategories,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Select What You Sell
                </h2>
                <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                  Merchandise Scope Setup
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Enable only the departments and apparel categories your store carries. You can also add custom categories.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets & Search */}
        <div className="p-3 sm:px-5 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-white">
          {/* Presets Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 select-none">
              Presets:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors cursor-pointer"
            >
              All Retail Catalog
            </button>
            <button
              type="button"
              onClick={() => applyPreset('adult')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Adult Only (Women/Men/Unisex)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('women_only')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Womenswear Only
            </button>
            <button
              type="button"
              onClick={() => applyPreset('men_only')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Menswear Only
            </button>
            <button
              type="button"
              onClick={() => applyPreset('kids_only')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Kids Only
            </button>
            <button
              type="button"
              onClick={() => applyPreset('clear')}
              className="px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            >
              Clear All
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category or item..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Modal Main Body (2 Columns: Departments Sidebar + Detailed Categories Matrix) */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Department List with switches */}
          <div className="w-full md:w-64 border-r border-slate-200/80 bg-slate-50/50 p-3 overflow-y-auto space-y-1.5 shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
              Store Departments ({activeDeptsCount} Enabled)
            </div>

            {PERSONA_DEPARTMENTS.map((dept) => {
              const isDeptActive = selectedDepts.has(dept.id);
              const isCurrentlySelected = activeDeptId === dept.id;

              // Count active subcategories in this department
              const allDeptSubs = PERSONA_CATEGORIES.flatMap((c) =>
                (PERSONA_SUB_CATEGORIES[dept.id]?.[c.id] || []).map((sub) => `${dept.id}:${c.id}:${sub}`)
              );
              const customSubsInDept = customLeaves
                .filter((cl) => cl.deptId === dept.id)
                .map((cl) => `${cl.deptId}:${cl.catId}:${cl.subCategory}`);
              const totalDeptLeaves = allDeptSubs.length + customSubsInDept.length;
              const activeDeptLeavesCount = [...allDeptSubs, ...customSubsInDept].filter((k) =>
                selectedLeafKeys.has(k)
              ).length;

              return (
                <div
                  key={dept.id}
                  onClick={() => setActiveDeptId(dept.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                    isCurrentlySelected
                      ? 'bg-purple-50/90 border-purple-300 text-purple-950 shadow-2xs'
                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Toggle Checkbox / Switch for department */}
                    <input
                      type="checkbox"
                      checked={isDeptActive}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleDept(dept.id);
                        if (!isDeptActive) {
                          setActiveDeptId(dept.id);
                        }
                      }}
                      className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer accent-purple-600"
                    />
                    <div className="truncate">
                      <span className={`block truncate ${!isDeptActive ? 'line-through text-slate-400' : ''}`}>
                        {dept.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {activeDeptLeavesCount}/{totalDeptLeaves} items
                      </span>
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isCurrentlySelected ? 'text-purple-600 translate-x-0.5' : 'text-slate-300'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Right Column: Categories & Subcategories Matrix for active department */}
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto bg-white space-y-5 min-w-0">
            {/* Active Dept Header & Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className={`text-base font-extrabold tracking-tight ${selectedDepts.has(currentDept.id) ? 'text-slate-900' : 'text-slate-400'}`}>
                  {currentDept.name} Department
                </h3>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md border font-semibold ${
                  selectedDepts.has(currentDept.id)
                    ? 'text-purple-700 bg-purple-50 border-purple-200'
                    : 'text-slate-400 bg-slate-100 border-slate-200'
                }`}>
                  Path: {currentDept.name}
                </span>
                {!selectedDepts.has(currentDept.id) && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    Department is currently disabled
                  </span>
                )}
              </div>

              {selectedDepts.has(currentDept.id) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleAllInDept(currentDept.id)}
                    className="px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50 rounded-lg border border-purple-200 transition-colors cursor-pointer"
                  >
                    Select / Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-600" />
                    <span>Custom Category</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleDept(currentDept.id)}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Enable Department</span>
                </button>
              )}
            </div>

            {!selectedDepts.has(currentDept.id) ? (
              /* When department is disabled the right side is empty */
              <div className="h-full flex flex-col items-center justify-center py-20 px-4 text-center my-auto min-h-[360px]">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3.5 shadow-2xs">
                  <Layers className="w-8 h-8 stroke-[1.5] text-slate-400" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-700 mb-1">
                  {currentDept.name} Department is Disabled
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mb-5 leading-relaxed">
                  This department is currently disabled. No categories or items are active for {currentDept.name}.
                  Check the box in the left sidebar or click below to enable it.
                </p>
                <button
                  type="button"
                  onClick={() => handleToggleDept(currentDept.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Enable {currentDept.name} Department</span>
                </button>
              </div>
            ) : (
              <>
                {/* Inline Add Category form if triggered */}
                {isAddingCategory && (
                  <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 animate-in fade-in">
                    <FolderPlus className="w-4 h-4 text-purple-600 shrink-0 hidden sm:block" />
                    <span className="text-xs font-bold text-purple-900 whitespace-nowrap">
                      New Category in {currentDept.name}:
                    </span>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Activewear, Swimwear, Accessories..."
                      className="flex-1 px-3 py-1 text-xs bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddCustomCategory();
                        if (e.key === 'Escape') setIsAddingCategory(false);
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleAddCustomCategory}
                        className="px-3 py-1 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName('');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* List of Categories and subcategory chips */}
                {PERSONA_CATEGORIES.map((cat) => {
                  const displayName = getCategoryDisplayName(cat.id);
                  const defaultSubs = PERSONA_SUB_CATEGORIES[currentDept.id as PersonaDepartmentId]?.[cat.id] || [];
                  const customSubs = customLeaves.filter(
                    (cl) => cl.deptId === currentDept.id && cl.catId === cat.id
                  );

                  // All subcategory items in this category
                  const allItems = [
                    ...defaultSubs.map((sub) => ({
                      key: `${currentDept.id}:${cat.id}:${sub}`,
                      sub,
                      label: formatLeafLabel(sub),
                      isCustom: false,
                    })),
                    ...customSubs.map((cl) => ({
                      key: `${cl.deptId}:${cl.catId}:${cl.subCategory}`,
                      sub: cl.subCategory,
                      label: cl.label,
                      isCustom: true,
                      customObj: cl,
                    })),
                  ];

                  // Filter with search query
                  const filteredItems = searchQuery.trim()
                    ? allItems.filter(
                        (item) =>
                          item.label.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                          displayName.toLowerCase().includes(searchQuery.toLowerCase().trim())
                      )
                    : allItems;

                  if (searchQuery.trim() && filteredItems.length === 0) {
                    return null;
                  }

                  const allKeys = allItems.map((i) => i.key);
                  const enabledCount = allKeys.filter((k) => selectedLeafKeys.has(k)).length;
                  const isAllEnabled = enabledCount === allKeys.length && allKeys.length > 0;
                  const isPartiallyEnabled = enabledCount > 0 && !isAllEnabled;
                  const inputKey = `${currentDept.id}:${cat.id}`;
                  const isAddingSub = addingSubcatFor === inputKey;
                  const catCheckboxId = `cat-cb-${currentDept.id}-${cat.id}`;

                  return (
                    <div
                      key={cat.id}
                      className={`rounded-2xl border transition-all p-3.5 sm:p-4 space-y-3 ${
                        enabledCount > 0
                          ? 'border-slate-200/90 bg-slate-50/40 shadow-2xs'
                          : 'border-slate-200/60 bg-slate-50/20 opacity-75'
                      }`}
                    >
                      {/* Category Header with Checkbox */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          {/* Checkbox near category */}
                          <input
                            type="checkbox"
                            id={catCheckboxId}
                            checked={isAllEnabled}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate = isPartiallyEnabled;
                              }
                            }}
                            onChange={() => handleToggleAllInCategory(currentDept.id, cat.id, allKeys)}
                            className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer accent-purple-600"
                            title={
                              isAllEnabled
                                ? `Deselect all items in ${displayName}`
                                : `Select all items in ${displayName}`
                            }
                          />
                          <label
                            htmlFor={catCheckboxId}
                            className="text-sm font-extrabold text-slate-900 tracking-tight cursor-pointer select-none"
                          >
                            {displayName}
                          </label>
                          <span className="text-[11px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                            {enabledCount} of {allItems.length} active
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAllInCategory(currentDept.id, cat.id, allKeys)}
                            className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 transition-colors cursor-pointer"
                          >
                            {isAllEnabled ? 'Deselect All' : 'Select All'}
                          </button>

                          <span className="text-slate-300">|</span>

                          <button
                            type="button"
                            onClick={() => setAddingSubcatFor(isAddingSub ? null : inputKey)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-purple-700 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3 text-purple-600" />
                            <span>Add Custom</span>
                          </button>
                        </div>
                      </div>

                      {/* Inline Add Subcategory input */}
                      {isAddingSub && (
                        <div className="p-2.5 bg-white rounded-xl border border-purple-200 flex items-center gap-2 shadow-2xs">
                          <Tag className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <input
                            type="text"
                            value={newSubcatInput[inputKey] || ''}
                            onChange={(e) =>
                              setNewSubcatInput((prev) => ({ ...prev, [inputKey]: e.target.value }))
                            }
                            placeholder={`New item under ${displayName} (e.g. Cardigans, Silk Tops, Chinos)...`}
                            className="flex-1 text-xs px-2.5 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-medium"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddCustomSubcategory(currentDept.id, cat.id);
                              if (e.key === 'Escape') setAddingSubcatFor(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddCustomSubcategory(currentDept.id, cat.id)}
                            className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors cursor-pointer"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingSubcatFor(null)}
                            className="px-2 py-1 text-xs font-semibold text-slate-400 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Subcategories Chips Grid */}
                      <div className="flex flex-wrap gap-2">
                        {filteredItems.map((item) => {
                          const isEnabled = selectedLeafKeys.has(item.key);

                          return (
                            <div
                              key={item.key}
                              onClick={() => handleToggleLeaf(item.key, currentDept.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none border ${
                                isEnabled
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded-md flex items-center justify-center shrink-0 ${
                                  isEnabled ? 'bg-white/20 text-white' : 'border border-slate-300'
                                }`}
                              >
                                {isEnabled && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>

                              <span>{item.label}</span>

                              {/* Custom Badge & Delete button */}
                              {item.isCustom && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.customObj) handleRemoveCustomSubcategory(item.customObj);
                                  }}
                                  className={`ml-1 px-1 py-0.2 rounded text-[9px] font-bold inline-flex items-center gap-0.5 ${
                                    isEnabled
                                      ? 'bg-purple-800 text-purple-100 hover:bg-purple-900'
                                      : 'bg-amber-100 text-amber-900 hover:bg-rose-100 hover:text-rose-900'
                                  }`}
                                  title="Delete custom category"
                                >
                                  <span>Custom</span>
                                  <X className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Custom Added Categories in this Department */}
                {customCategories
                  .filter((cc) => cc.deptId === currentDept.id)
                  .map((cc) => {
                    const customSubs = customLeaves.filter(
                      (cl) => cl.deptId === currentDept.id && cl.catId === cc.id
                    );
                    const customKeys = customSubs.map((cl) => `${cl.deptId}:${cl.catId}:${cl.subCategory}`);
                    const customEnabledCount = customKeys.filter((k) => selectedLeafKeys.has(k)).length;
                    const isCustomAllEnabled = customKeys.length > 0 && customEnabledCount === customKeys.length;
                    const isCustomPartiallyEnabled = customEnabledCount > 0 && !isCustomAllEnabled;
                    const inputKey = `${currentDept.id}:${cc.id}`;
                    const isAddingSub = addingSubcatFor === inputKey;
                    const customCatCheckboxId = `custom-cat-cb-${currentDept.id}-${cc.id}`;

                    return (
                      <div
                        key={cc.id}
                        className="rounded-2xl border border-purple-200 p-3.5 sm:p-4 bg-purple-50/20 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2.5">
                            {customKeys.length > 0 && (
                              <input
                                type="checkbox"
                                id={customCatCheckboxId}
                                checked={isCustomAllEnabled}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate = isCustomPartiallyEnabled;
                                  }
                                }}
                                onChange={() => handleToggleAllInCategory(currentDept.id, cc.id, customKeys)}
                                className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer accent-purple-600"
                                title={
                                  isCustomAllEnabled
                                    ? `Deselect all items in ${cc.name}`
                                    : `Select all items in ${cc.name}`
                                }
                              />
                            )}
                            <label
                              htmlFor={customCatCheckboxId}
                              className="text-sm font-extrabold text-purple-950 tracking-tight cursor-pointer select-none"
                            >
                              {cc.name}
                            </label>
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200">
                              Custom Category
                            </span>
                            {customKeys.length > 0 && (
                              <span className="text-[11px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-purple-200 font-medium">
                                {customEnabledCount} of {customKeys.length} active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setAddingSubcatFor(isAddingSub ? null : inputKey)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Subcategory</span>
                            </button>
                          </div>
                        </div>

                        {/* Subcategories */}
                        <div className="flex flex-wrap gap-2">
                          {customSubs.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">
                              No subcategories added yet. Click "+ Add Subcategory" to add items under {cc.name}.
                            </p>
                          ) : (
                            customSubs.map((cl) => {
                              const leafKey = `${cl.deptId}:${cl.catId}:${cl.subCategory}`;
                              const isEnabled = selectedLeafKeys.has(leafKey);

                              return (
                                <div
                                  key={cl.id}
                                  onClick={() => handleToggleLeaf(leafKey, currentDept.id)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                                    isEnabled
                                      ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <div
                                    className={`w-3.5 h-3.5 rounded-md flex items-center justify-center shrink-0 ${
                                      isEnabled ? 'bg-white/20 text-white' : 'border border-slate-300'
                                    }`}
                                  >
                                    {isEnabled && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                  </div>
                                  <span>{cl.label}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveCustomSubcategory(cl);
                                    }}
                                    className="ml-1 p-0.5 hover:text-rose-300"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-600 font-medium">
            <span className="font-bold text-slate-900">
              {activeDeptsCount} Departments
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-bold text-purple-700">
              {activeLeavesCount} Active Categories & Items
            </span>
            {customLeaves.length > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="font-bold text-amber-700">
                  {customLeaves.length} Custom Items
                </span>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Save & Apply Scope</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
