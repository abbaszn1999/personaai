"use client";

/**
 * "Select What You Sell" — a straight port of the demo's `components/CatalogScopeModal.tsx`, restyled
 * onto our design tokens. Scopes which departments/categories from the fixed Persona taxonomy show up
 * in the Mapping tree, and lets the merchant add custom categories/sub-categories on top of it.
 */

import * as React from "react";
import {
  X,
  Search,
  Check,
  Plus,
  Layers,
  ChevronRight,
  Tag,
  ArrowRight,
  FolderPlus,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import {
  PERSONA_DEPARTMENTS,
  PERSONA_CATEGORIES,
  PERSONA_SUB_CATEGORIES,
  formatLeafLabel,
  getCategoryDisplayName,
  type PersonaDepartmentId,
  type CustomTaxonomyItem,
  type CustomCategoryDef,
} from "./persona-taxonomy";

export type { CustomTaxonomyItem, CustomCategoryDef } from "./persona-taxonomy";

export interface TaxonomyScopeState {
  enabledDeptIds: Set<string>;
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

export function getDefaultLeafKeys(): Set<string> {
  const keys = new Set<string>();
  PERSONA_DEPARTMENTS.forEach((dept) => {
    PERSONA_CATEGORIES.forEach((cat) => {
      const subs = PERSONA_SUB_CATEGORIES[dept.id]?.[cat.id] || [];
      subs.forEach((sub) => keys.add(`${dept.id}:${cat.id}:${sub}`));
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

export function CatalogScopeModal({ isOpen, onClose, scopeState, onSaveScope }: CatalogScopeModalProps) {
  const [selectedDepts, setSelectedDepts] = React.useState<Set<string>>(() => new Set(scopeState.enabledDeptIds));
  const [selectedLeafKeys, setSelectedLeafKeys] = React.useState<Set<string>>(() => new Set(scopeState.enabledLeafKeys));
  const [customLeaves, setCustomLeaves] = React.useState<CustomTaxonomyItem[]>(() => [...scopeState.customLeaves]);
  const [customCategories, setCustomCategories] = React.useState<CustomCategoryDef[]>(() => [...scopeState.customCategories]);
  const [activeDeptId, setActiveDeptId] = React.useState<string>("women");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [newSubcatInput, setNewSubcatInput] = React.useState<Record<string, string>>({});
  const [addingSubcatFor, setAddingSubcatFor] = React.useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [newCategorySizingGroup, setNewCategorySizingGroup] = React.useState<"tops" | "bottoms" | "dresses" | "outerwear" | "footwear">("tops");
  const nextCustomId = React.useRef(0);

  function handleToggleDept(deptId: string) {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
        setSelectedLeafKeys((prevKeys) => {
          const nextKeys = new Set(prevKeys);
          Array.from(nextKeys).forEach((k) => {
            if (k.startsWith(`${deptId}:`)) nextKeys.delete(k);
          });
          return nextKeys;
        });
      } else {
        next.add(deptId);
        setSelectedLeafKeys((prevKeys) => {
          const nextKeys = new Set(prevKeys);
          PERSONA_CATEGORIES.forEach((cat) => {
            const subs = PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || [];
            subs.forEach((sub) => nextKeys.add(`${deptId}:${cat.id}:${sub}`));
          });
          customLeaves.filter((cl) => cl.deptId === deptId).forEach((cl) => nextKeys.add(`${cl.deptId}:${cl.catId}:${cl.subCategory}`));
          return nextKeys;
        });
      }
      return next;
    });
  }

  function handleToggleLeaf(key: string, deptId: string) {
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        setSelectedDepts((prevDepts) => new Set(prevDepts).add(deptId));
      }
      return next;
    });
  }

  function handleToggleAllInCategory(deptId: string, catId: string, allKeys: string[]) {
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
  }

  function handleToggleAllInDept(deptId: string) {
    const deptKeys: string[] = [];
    PERSONA_CATEGORIES.forEach((cat) => {
      const subs = PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || [];
      subs.forEach((sub) => deptKeys.push(`${deptId}:${cat.id}:${sub}`));
    });
    customLeaves.filter((cl) => cl.deptId === deptId).forEach((cl) => deptKeys.push(`${cl.deptId}:${cl.catId}:${cl.subCategory}`));

    const allEnabled = deptKeys.length > 0 && deptKeys.every((k) => selectedLeafKeys.has(k));
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      if (allEnabled) deptKeys.forEach((k) => next.delete(k));
      else {
        deptKeys.forEach((k) => next.add(k));
        setSelectedDepts((prevDepts) => new Set(prevDepts).add(deptId));
      }
      return next;
    });
  }

  function handleAddCustomSubcategory(deptId: string, catId: string) {
    const key = `${deptId}:${catId}`;
    const value = (newSubcatInput[key] || "").trim();
    if (!value) return;

    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const leafKey = `${deptId}:${catId}:${slug}`;

    nextCustomId.current += 1;
    const newCustomItem: CustomTaxonomyItem = { id: `custom-${slug}-${nextCustomId.current}`, deptId, catId, subCategory: slug, label: value, isCustom: true };

    setCustomLeaves((prev) => [...prev, newCustomItem]);
    setSelectedLeafKeys((prev) => new Set(prev).add(leafKey));
    setSelectedDepts((prev) => new Set(prev).add(deptId));
    setNewSubcatInput((prev) => ({ ...prev, [key]: "" }));
    setAddingSubcatFor(null);
  }

  function handleRemoveCustomSubcategory(item: CustomTaxonomyItem) {
    const leafKey = `${item.deptId}:${item.catId}:${item.subCategory}`;
    setCustomLeaves((prev) => prev.filter((cl) => cl.id !== item.id));
    setSelectedLeafKeys((prev) => {
      const next = new Set(prev);
      next.delete(leafKey);
      return next;
    });
  }

  function handleAddCustomCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    setCustomCategories((prev) => [...prev, {
      id: `custom-cat-${id}`,
      deptId: activeDeptId,
      name,
      sizingGroup: newCategorySizingGroup,
      isCustom: true,
    }]);
    setNewCategoryName("");
    setIsAddingCategory(false);
  }

  function applyPreset(preset: "all" | "adult" | "women_only" | "men_only" | "kids_only" | "clear") {
    if (preset === "all") {
      setSelectedDepts(new Set(PERSONA_DEPARTMENTS.map((d) => d.id)));
      setSelectedLeafKeys(getDefaultLeafKeys());
      return;
    }
    if (preset === "clear") {
      setSelectedDepts(new Set());
      setSelectedLeafKeys(new Set());
      return;
    }
    const deptIds =
      preset === "adult" ? ["women", "men", "unisex"]
      : preset === "women_only" ? ["women"]
      : preset === "men_only" ? ["men"]
      : ["kids-boys", "kids-girls", "kids-unisex"];
    setSelectedDepts(new Set(deptIds));
    const keys = new Set<string>();
    deptIds.forEach((deptId) => {
      PERSONA_CATEGORIES.forEach((cat) => {
        (PERSONA_SUB_CATEGORIES[deptId as PersonaDepartmentId]?.[cat.id] || []).forEach((sub) => keys.add(`${deptId}:${cat.id}:${sub}`));
      });
    });
    setSelectedLeafKeys(keys);
    setActiveDeptId(deptIds[0]);
  }

  const activeLeavesCount = selectedLeafKeys.size;
  const activeDeptsCount = selectedDepts.size;
  const currentDept = PERSONA_DEPARTMENTS.find((d) => d.id === activeDeptId) || PERSONA_DEPARTMENTS[0];

  function handleSave() {
    onSaveScope({ enabledDeptIds: selectedDepts, enabledLeafKeys: selectedLeafKeys, customLeaves, customCategories });
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      className="catalog-scope-demo mapping-panel max-w-5xl max-h-[92vh] rounded-2xl"
      icon={<Layers className="h-5 w-5" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-extrabold tracking-tight sm:text-lg">Select What You Sell</span>
          <span className="rounded-full border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-brand-strong)]">
            Merchandise Scope Setup
          </span>
        </span>
      }
      description="Enable only the departments and apparel categories your store carries. You can also add custom categories."
      footer={
        <div className="flex w-full flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 text-xs font-medium text-[var(--color-text-secondary)]">
            <span className="font-bold text-[var(--color-text-primary)]">{activeDeptsCount} Departments</span>
            <span className="text-[var(--color-border-strong)]">•</span>
            <span className="font-bold text-[var(--color-brand-strong)]">{activeLeavesCount} Active Categories & Items</span>
            {customLeaves.length > 0 && (
              <>
                <span className="text-[var(--color-border-strong)]">•</span>
                <span className="font-bold text-[var(--color-warning)]">{customLeaves.length} Custom Items</span>
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-4 py-2 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)]">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-[var(--radius-xl)] px-5 py-2 text-xs font-bold text-white gradient-brand shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-glow)]"
            >
              <span>Save & Apply Scope</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      }
    >
      {/* Presets & search — bled to the dialog's edges, pinned above the scrolling department/category
       *  body below (the same "toolbar row above a `flex-1 min-h-0` scroll pane" shape as the
       *  category-items-preview dialog). */}
      <div className="-mx-5 -mt-5 flex shrink-0 flex-col items-stretch justify-between gap-2.5 border-b border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel)] p-3 sm:flex-row sm:items-center sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 select-none text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Presets:</span>
            {[
              { id: "all" as const, label: "All Retail Catalog" },
              { id: "adult" as const, label: "Adult Only (Women/Men/Unisex)" },
              { id: "women_only" as const, label: "Womenswear Only" },
              { id: "men_only" as const, label: "Menswear Only" },
              { id: "kids_only" as const, label: "Kids Only" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="mapping-interactive rounded-[var(--radius-lg)] border border-[var(--color-mapping-border)] bg-[var(--color-mapping-control)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-strong)]"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyPreset("clear")}
              className="rounded-[var(--radius-md)] px-2 py-1 text-xs font-semibold text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-light)]"
            >
              Clear All
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category or item..."
              className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-8 pr-7 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Departments sidebar */}
          <div className="shrink-0 space-y-1.5 overflow-y-auto border-b border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel-alt)] p-3 md:w-64 md:border-b-0 md:border-r">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Store Departments ({activeDeptsCount} Enabled)
            </div>
            {PERSONA_DEPARTMENTS.map((dept) => {
              const isDeptActive = selectedDepts.has(dept.id);
              const isCurrent = activeDeptId === dept.id;
              const allDeptSubs = PERSONA_CATEGORIES.flatMap((c) => (PERSONA_SUB_CATEGORIES[dept.id]?.[c.id] || []).map((sub) => `${dept.id}:${c.id}:${sub}`));
              const customSubsInDept = customLeaves.filter((cl) => cl.deptId === dept.id).map((cl) => `${cl.deptId}:${cl.catId}:${cl.subCategory}`);
              const totalDeptLeaves = allDeptSubs.length + customSubsInDept.length;
              const activeDeptLeavesCount = [...allDeptSubs, ...customSubsInDept].filter((k) => selectedLeafKeys.has(k)).length;

              return (
                <div
                  key={dept.id}
                  onClick={() => setActiveDeptId(dept.id)}
                  className={cn(
                    "mapping-interactive flex cursor-pointer items-center justify-between rounded-[var(--radius-xl)] border p-2.5 text-xs font-semibold",
                    isCurrent
                      ? "mapping-status-brand border text-[var(--color-brand-strong)] shadow-[0_10px_24px_-18px_#ff5b3d]"
                      : "border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel)] text-[var(--color-text-secondary)]"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isDeptActive}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleDept(dept.id);
                        if (!isDeptActive) setActiveDeptId(dept.id);
                      }}
                      className="h-4 w-4 cursor-pointer accent-[var(--color-brand)]"
                    />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dept.accentColor }} />
                    <div className="truncate">
                      <span className={cn("block truncate", !isDeptActive && "text-[var(--color-text-muted)] line-through")}>{dept.name}</span>
                      <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                        {activeDeptLeavesCount}/{totalDeptLeaves} items
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isCurrent ? "translate-x-0.5 text-[var(--color-brand)]" : "text-[var(--color-text-muted)]")} />
                </div>
              );
            })}
          </div>

          {/* Categories matrix */}
          <div className="min-w-0 flex-1 space-y-5 overflow-y-auto bg-[var(--color-mapping-panel)] p-4 sm:p-5">
            <div className="flex flex-col items-start justify-between gap-2.5 border-b border-[var(--color-border)] pb-3 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className={cn("text-base font-extrabold tracking-tight", selectedDepts.has(currentDept.id) ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]")}>
                  {currentDept.name} Department
                </h3>
                <span
                  className={cn(
                    "rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-semibold",
                    selectedDepts.has(currentDept.id)
                      ? "border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
                  )}
                >
                  Path: {currentDept.name}
                </span>
                {!selectedDepts.has(currentDept.id) && (
                  <span className="rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning)]">
                    Department is currently disabled
                  </span>
                )}
              </div>

              {selectedDepts.has(currentDept.id) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleAllInDept(currentDept.id)}
                    className="rounded-[var(--radius-md)] border border-[var(--color-brand)]/25 px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-strong)] transition-colors hover:bg-[var(--color-brand-light)]"
                  >
                    Select / Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(true)}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--color-brand)]" />
                    <span>Custom Category</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleDept(currentDept.id)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-3 py-1 text-xs font-bold text-[var(--color-brand-strong)] transition-colors hover:bg-[var(--color-brand)]/15"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Enable Department</span>
                </button>
              )}
            </div>

            {!selectedDepts.has(currentDept.id) ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center px-4 py-20 text-center">
                <div className="mb-3.5 flex h-16 w-16 items-center justify-center rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]">
                  <Layers className="h-8 w-8" />
                </div>
                <h4 className="mb-1 text-sm font-extrabold text-[var(--color-text-secondary)]">{currentDept.name} Department is Disabled</h4>
                <p className="mb-5 max-w-sm text-xs leading-relaxed text-[var(--color-text-muted)]">
                  This department is currently disabled. No categories or items are active for {currentDept.name}. Check the box in the sidebar or click below to enable it.
                </p>
                <button
                  type="button"
                  onClick={() => handleToggleDept(currentDept.id)}
                  className="mapping-accent-button inline-flex items-center gap-2 rounded-[var(--radius-xl)] px-4 py-2 text-xs font-bold text-white transition-all"
                >
                  <Check className="h-4 w-4" />
                  <span>Enable {currentDept.name} Department</span>
                </button>
              </div>
            ) : (
              <>
                {isAddingCategory && (
                  <div className="flex flex-col items-stretch gap-2 rounded-[var(--radius-xl)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] p-3 sm:flex-row sm:items-center">
                    <FolderPlus className="hidden h-4 w-4 shrink-0 text-[var(--color-brand)] sm:block" />
                    <span className="whitespace-nowrap text-xs font-bold text-[var(--color-brand-strong)]">New Category in {currentDept.name}:</span>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Activewear, Swimwear, Accessories..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCustomCategory();
                        if (e.key === "Escape") setIsAddingCategory(false);
                      }}
                      className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-brand)]/30 bg-[var(--color-surface-sticky)] px-3 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/25"
                    />
                    <select
                      value={newCategorySizingGroup}
                      onChange={(event) => setNewCategorySizingGroup(event.target.value as typeof newCategorySizingGroup)}
                      className="rounded-[var(--radius-md)] border border-[var(--color-brand)]/30 bg-[var(--color-surface-sticky)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
                      aria-label="Custom category sizing family"
                    >
                      <option value="tops">Tops</option>
                      <option value="bottoms">Bottoms</option>
                      <option value="dresses">Dresses / full body</option>
                      <option value="outerwear">Outerwear</option>
                      <option value="footwear">Footwear</option>
                    </select>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={handleAddCustomCategory} className="rounded-[var(--radius-md)] px-3 py-1 text-xs font-bold text-white gradient-brand">
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAddingCategory(false); setNewCategoryName(""); }}
                        className="px-2.5 py-1 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {PERSONA_CATEGORIES.map((cat) => {
                  const displayName = getCategoryDisplayName(cat.id);
                  const defaultSubs = PERSONA_SUB_CATEGORIES[currentDept.id as PersonaDepartmentId]?.[cat.id] || [];
                  const customSubs = customLeaves.filter((cl) => cl.deptId === currentDept.id && cl.catId === cat.id);

                  const allItems = [
                    ...defaultSubs.map((sub) => ({ key: `${currentDept.id}:${cat.id}:${sub}`, label: formatLeafLabel(sub), isCustom: false as const, customObj: undefined as CustomTaxonomyItem | undefined })),
                    ...customSubs.map((cl) => ({ key: `${cl.deptId}:${cl.catId}:${cl.subCategory}`, label: cl.label, isCustom: true as const, customObj: cl })),
                  ];

                  const q = searchQuery.trim().toLowerCase();
                  const filteredItems = q ? allItems.filter((item) => item.label.toLowerCase().includes(q) || displayName.toLowerCase().includes(q)) : allItems;
                  if (q && filteredItems.length === 0) return null;

                  const allKeys = allItems.map((i) => i.key);
                  const enabledCount = allKeys.filter((k) => selectedLeafKeys.has(k)).length;
                  const isAllEnabled = enabledCount === allKeys.length && allKeys.length > 0;
                  const inputKey = `${currentDept.id}:${cat.id}`;
                  const isAddingSub = addingSubcatFor === inputKey;

                  return (
                    <div
                      key={cat.id}
                      className={cn(
                        "space-y-3 rounded-[var(--radius-2xl)] border p-3.5 sm:p-4",
                        enabledCount > 0 ? "border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel-alt)]" : "border-[var(--color-mapping-border)] bg-[var(--color-mapping-canvas)]"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isAllEnabled}
                            onChange={() => handleToggleAllInCategory(currentDept.id, cat.id, allKeys)}
                            className="h-4 w-4 cursor-pointer accent-[var(--color-brand)]"
                          />
                          <span className="text-sm font-extrabold tracking-tight text-[var(--color-text-primary)]">{displayName}</span>
                          <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                            {enabledCount} of {allItems.length} active
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => handleToggleAllInCategory(currentDept.id, cat.id, allKeys)} className="text-[11px] font-semibold text-[var(--color-brand-strong)] hover:underline">
                            {isAllEnabled ? "Deselect All" : "Select All"}
                          </button>
                          <span className="text-[var(--color-border-strong)]">|</span>
                          <button
                            type="button"
                            onClick={() => setAddingSubcatFor(isAddingSub ? null : inputKey)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-strong)]"
                          >
                            <Plus className="h-3 w-3 text-[var(--color-brand)]" />
                            <span>Add Custom</span>
                          </button>
                        </div>
                      </div>

                      {isAddingSub && (
                        <div className="flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-brand)]/25 bg-[var(--color-surface-sticky)] p-2.5">
                          <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />
                          <input
                            type="text"
                            value={newSubcatInput[inputKey] || ""}
                            onChange={(e) => setNewSubcatInput((prev) => ({ ...prev, [inputKey]: e.target.value }))}
                            placeholder={`New item under ${displayName} (e.g. Cardigans, Silk Tops, Chinos)...`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddCustomSubcategory(currentDept.id, cat.id);
                              if (e.key === "Escape") setAddingSubcatFor(null);
                            }}
                            className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/25"
                          />
                          <button type="button" onClick={() => handleAddCustomSubcategory(currentDept.id, cat.id)} className="rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold text-white gradient-brand">
                            Add
                          </button>
                          <button type="button" onClick={() => setAddingSubcatFor(null)} className="px-2 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                            Cancel
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {filteredItems.map((item) => {
                          const isEnabled = selectedLeafKeys.has(item.key);
                          return (
                            <div
                              key={item.key}
                              onClick={() => handleToggleLeaf(item.key, currentDept.id)}
                              className={cn(
                                "inline-flex select-none items-center gap-1.5 rounded-[var(--radius-xl)] border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                                isEnabled
                                  ? "mapping-accent-button border-[#f45135] text-white"
                                  : "mapping-interactive border-[var(--color-mapping-border)] bg-[var(--color-mapping-control)] text-[var(--color-text-secondary)]"
                              )}
                            >
                              <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[var(--radius-sm)]", isEnabled ? "bg-[#852e34] text-white" : "border border-[var(--color-border-strong)]")}>
                                {isEnabled && <Check className="h-2.5 w-2.5" />}
                              </span>
                              <span>{item.label}</span>
                              {item.isCustom && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.customObj) handleRemoveCustomSubcategory(item.customObj);
                                  }}
                                  className={cn(
                                    "ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-bold",
                                    isEnabled ? "bg-[#852e34] text-white" : "bg-[var(--color-mapping-warning-soft)] text-[var(--color-warning)]"
                                  )}
                                  title="Delete custom category"
                                >
                                  <span>Custom</span>
                                  <X className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {customCategories.filter((cc) => cc.deptId === currentDept.id).map((cc) => {
                  const customSubs = customLeaves.filter((cl) => cl.deptId === currentDept.id && cl.catId === cc.id);
                  const inputKey = `${currentDept.id}:${cc.id}`;
                  const isAddingSub = addingSubcatFor === inputKey;
                  const customKeys = customSubs.map((cl) => `${cl.deptId}:${cl.catId}:${cl.subCategory}`);
                  const customEnabledCount = customKeys.filter((k) => selectedLeafKeys.has(k)).length;

                  return (
                    <div key={cc.id} className="mapping-status-brand space-y-3 rounded-[var(--radius-2xl)] border p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm font-extrabold tracking-tight text-[var(--color-brand-strong)]">{cc.name}</span>
                          <span className="rounded border border-[var(--color-brand)]/25 bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-brand-strong)]">
                            Custom Category
                          </span>
                          {customKeys.length > 0 && (
                            <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                              {customEnabledCount} of {customKeys.length} active
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setAddingSubcatFor(isAddingSub ? null : inputKey)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-strong)] hover:underline"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Subcategory</span>
                        </button>
                      </div>

                      {isAddingSub && (
                        <div className="flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-brand)]/25 bg-[var(--color-surface-sticky)] p-2.5">
                          <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />
                          <input
                            type="text"
                            value={newSubcatInput[inputKey] || ""}
                            onChange={(e) => setNewSubcatInput((prev) => ({ ...prev, [inputKey]: e.target.value }))}
                            placeholder={`New item under ${cc.name}...`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddCustomSubcategory(currentDept.id, cc.id);
                              if (e.key === "Escape") setAddingSubcatFor(null);
                            }}
                            className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/25"
                          />
                          <button type="button" onClick={() => handleAddCustomSubcategory(currentDept.id, cc.id)} className="rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold text-white gradient-brand">
                            Add
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {customSubs.length === 0 ? (
                          <p className="text-xs italic text-[var(--color-text-muted)]">No subcategories added yet. Click &ldquo;+ Add Subcategory&rdquo; to add items under {cc.name}.</p>
                        ) : (
                          customSubs.map((cl) => {
                            const leafKey = `${cl.deptId}:${cl.catId}:${cl.subCategory}`;
                            const isEnabled = selectedLeafKeys.has(leafKey);
                            return (
                              <div
                                key={cl.id}
                                onClick={() => handleToggleLeaf(leafKey, currentDept.id)}
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-xl)] border px-3 py-1.5 text-xs font-semibold transition-all",
                                  isEnabled ? "mapping-accent-button border-[#f45135] text-white" : "mapping-interactive border-[var(--color-mapping-border)] bg-[var(--color-mapping-control)] text-[var(--color-text-secondary)]"
                                )}
                              >
                                <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-sm)]", isEnabled ? "bg-[#852e34] text-white" : "border border-[var(--color-border-strong)]")}>
                                  {isEnabled && <Check className="h-2.5 w-2.5" />}
                                </span>
                                <span>{cl.label}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveCustomSubcategory(cl); }}
                                  className="ml-1 p-0.5 hover:text-[var(--color-error)]"
                                >
                                  <X className="h-2.5 w-2.5" />
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
    </Modal>
  );
}
