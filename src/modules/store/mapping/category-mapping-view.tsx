"use client";

/**
 * Store Category Mapping — a straight UI/behavioral port of the demo's `components/CategoryMappingView.tsx`
 * (see `Documentation/store_src_demo_frontend/components/CategoryMappingView.tsx`), restyled onto our
 * design tokens and dropped in as its own "Mapping" tab, right after Connection.
 *
 * The presentation follows the demo, while the catalog and mapping state are real and persisted
 * against the connected store.
 */

import * as React from "react";
import {
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Ban,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  RotateCcw,
  Save,
  Check,
  Sparkles,
  Layers,
  FolderTree,
  Tag,
  Eye,
  X,
  CheckSquare,
  Square,
  Info,
  SlidersHorizontal,
  GripVertical,
  Move,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useStoreConnectionStore } from "@/modules/store/store";
import type { StoreConnection } from "../types";
import {
  PERSONA_DEPARTMENTS,
  PERSONA_CATEGORIES,
  PERSONA_SUB_CATEGORIES,
  derivePersonaValues,
  formatPersonaPath,
  formatLeafLabel,
  getCategoryDisplayName,
  type PersonaCategoryMap,
  type SerializedTaxonomyScope,
  type PersonaDepartmentId,
  type PersonaCategoryId,
  type PersonaCategoryDef,
  type PersonaDerivedValues,
  type StoreCategoryItem,
} from "./persona-taxonomy";
import { CategoryItemsPreviewModal } from "./category-items-preview-modal";
import { CatalogScopeModal, getDefaultScopeState, type TaxonomyScopeState } from "./catalog-scope-modal";

interface CategoryMappingViewProps {
  connection: StoreConnection;
  /** Advances to Setup's Stage 1 (Field Mapping) — the step that follows Mapping in the
   *  Connection → Mapping → Setup → Size Filter → Style Guide order. Omitted entirely when the
   *  host page has nowhere to send it (there is none today, but keeps this component testable
   *  standalone). */
  onContinueToSetup?: () => void;
}

type FilterStatus = "all" | "unmapped" | "mapped" | "excluded";
type SortOption = "unmapped_first" | "products_desc" | "name_asc";

export function CategoryMappingView({ connection, onContinueToSetup }: CategoryMappingViewProps) {
  const refreshConnection = useStoreConnectionStore((state) => state.load);
  const [categories, setCategories] = React.useState<StoreCategoryItem[]>([]);
  const [initialCategoriesJson, setInitialCategoriesJson] = React.useState("[]");
  const [saveSuccessMessage, setSaveSuccessMessage] = React.useState<string | null>(null);
  const [isLoadingMapping, setIsLoadingMapping] = React.useState(true);
  const [isSavingMapping, setIsSavingMapping] = React.useState(false);
  const [isAutoMatching, setIsAutoMatching] = React.useState(false);
  /** Non-null once Auto-Match has successfully run and saved for this mapping configuration.
   *  Auto-Match is a one-shot action — clearing the mapping is the only way to reset this. */
  const [autoMatchCompletedAt, setAutoMatchCompletedAt] = React.useState<string | null>(null);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<FilterStatus>("all");
  const [sortBy, setSortBy] = React.useState<SortOption>("unmapped_first");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [previewCategory, setPreviewCategory] = React.useState<StoreCategoryItem | null>(null);

  const [taxonomySearch, setTaxonomySearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState<string>("all");
  const [expandedDepts, setExpandedDepts] = React.useState<Record<string, boolean>>({
    women: true, men: false, unisex: false, "kids-boys": false, "kids-girls": false, "kids-unisex": false,
  });
  const [expandedCats, setExpandedCats] = React.useState<Record<string, boolean>>({
    "women:top": true, "women:full-body": true, "women:bottom": true, "women:outerwear": false, "women:footwear": false,
    "men:top": true, "men:full-body": false, "men:bottom": true, "men:outerwear": false, "men:footwear": false,
    "unisex:top": true, "unisex:bottom": true,
    "kids-boys:top": true, "kids-boys:bottom": true,
    "kids-girls:top": true, "kids-girls:full-body": true, "kids-girls:bottom": true,
    "kids-unisex:top": true, "kids-unisex:bottom": true,
  });

  const [isScopeConfigured, setIsScopeConfigured] = React.useState(false);
  const [isScopeModalOpen, setIsScopeModalOpen] = React.useState(false);
  const [scopeState, setScopeState] = React.useState<TaxonomyScopeState>(getDefaultScopeState);

  const [actionFeedback, setActionFeedback] = React.useState<{ message: string; type: "success" | "info" | "warn" } | null>(null);
  const [highlightedCategoryId, setHighlightedCategoryId] = React.useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = React.useState<string | null>(null);
  const [dragOverTargetKey, setDragOverTargetKey] = React.useState<string | null>(null);

  const draggedCategory = React.useMemo(
    () => (draggedCategoryId ? categories.find((c) => c.id === draggedCategoryId) : null),
    [categories, draggedCategoryId]
  );

  function showFeedback(message: string, type: "success" | "info" | "warn" = "success") {
    setActionFeedback({ message, type });
    setTimeout(() => setActionFeedback((current) => (current?.message === message ? null : current)), 3500);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function loadMapping() {
      setIsLoadingMapping(true);
      try {
        const response = await fetch("/api/store-connection/persona-mapping", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load category mappings");
        if (cancelled) return;

        const loadedCategories = (data.categories ?? []) as StoreCategoryItem[];
        const savedScope = data.scope as SerializedTaxonomyScope | undefined;
        setCategories(loadedCategories);
        setInitialCategoriesJson(JSON.stringify(loadedCategories));
        setAutoMatchCompletedAt((data.autoMatchCompletedAt as string | null) ?? null);
        if (savedScope?.configured) {
          setScopeState({
            enabledDeptIds: new Set(savedScope.enabledDeptIds ?? []),
            enabledLeafKeys: new Set(savedScope.enabledLeafKeys ?? []),
            customLeaves: savedScope.customLeaves ?? [],
            customCategories: savedScope.customCategories ?? [],
          });
          setIsScopeConfigured(true);
        } else {
          setScopeState(getDefaultScopeState());
          setIsScopeConfigured(false);
        }
      } catch (error) {
        if (!cancelled) showFeedback(error instanceof Error ? error.message : "Could not load category mappings", "warn");
      } finally {
        if (!cancelled) setIsLoadingMapping(false);
      }
    }
    void loadMapping();
    return () => { cancelled = true; };
  }, [connection.id]);

  async function handleSaveScope(newScope: TaxonomyScopeState) {
    setScopeState(newScope);
    setIsScopeConfigured(true);
    setIsSavingMapping(true);
    try {
      if (await persistMappings(categories, newScope)) {
        showFeedback(`Catalog scope activated: ${newScope.enabledDeptIds.size} departments, ${newScope.enabledLeafKeys.size} categories active`, "success");
      }
    } finally {
      setIsSavingMapping(false);
    }
  }

  function locateAndHighlightCategory(catId: string) {
    const target = categories.find((c) => c.id === catId);
    if (!target) return;
    if (statusFilter === "unmapped" && target.status === "mapped") setStatusFilter("all");
    else if (statusFilter === "excluded" && target.status !== "excluded") setStatusFilter("all");
    setSelectedIds(new Set([catId]));
    setHighlightedCategoryId(catId);
    showFeedback(`Located "${target.name}" on store catalog list`, "info");
    setTimeout(() => {
      document.getElementById(`category-item-${catId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    setTimeout(() => setHighlightedCategoryId((curr) => (curr === catId ? null : curr)), 3500);
  }

  /**
   * Auto-Match, when no scope was configured yet, must offer the AI the FULL taxonomy as
   * candidate targets (see `getDefaultScopeState`) so it can pick the correct department/leaf
   * for anything — but saving that full "everything enabled" scope afterwards is what fills the
   * Persona Fixed Taxonomy Hierarchy tree with dozens of always-empty department/category/leaf
   * rows, since the tree renders every *enabled* scope entry regardless of whether anything was
   * ever mapped to it. This narrows the scope that actually gets SAVED down to just the
   * departments and leaves Auto-Match's own results used, so the tree only shows paths with real
   * data. "Configure What You Sell" is untouched — the merchant can still re-enable any hidden
   * department/category/leaf there at any time to manually map more into it later.
   */
  function narrowScopeToUsedPaths(scope: TaxonomyScopeState, mappedCategories: StoreCategoryItem[]): TaxonomyScopeState {
    const usedDeptIds = new Set<string>();
    const usedLeafKeys = new Set<string>();
    for (const category of mappedCategories) {
      if (category.status !== "mapped" || !category.departmentId || !category.categoryId) continue;
      usedDeptIds.add(category.departmentId);
      if (category.subCategory) {
        usedLeafKeys.add(`${category.departmentId}:${category.categoryId}:${category.subCategory}`);
      }
    }
    // Custom categories/leaves are always explicit merchant creations from the scope modal —
    // never part of the "enable everything" default — so their departments stay enabled
    // regardless of whether this particular Auto-Match run happened to use them.
    for (const custom of scope.customCategories) usedDeptIds.add(custom.deptId);
    for (const leaf of scope.customLeaves) usedDeptIds.add(leaf.deptId);

    return {
      enabledDeptIds: usedDeptIds,
      enabledLeafKeys: usedLeafKeys,
      customLeaves: scope.customLeaves,
      customCategories: scope.customCategories,
    };
  }

  function getMappedCategoriesForNode(deptId: string, catId: string, subCat?: string, customPath?: string): StoreCategoryItem[] {
    if (customPath) return categories.filter((c) => c.status === "mapped" && c.assignedPersonaPath === customPath);
    const standardPath = formatPersonaPath(deptId, catId, subCat);
    return categories.filter(
      (c) =>
        c.status === "mapped" &&
        (c.assignedPersonaPath === standardPath ||
          (c.departmentId === deptId && c.categoryId === catId && (subCat ? c.subCategory === subCat : !c.subCategory)))
    );
  }

  // '/' focuses search, Escape clears selection.
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && selectedIds.size > 0) setSelectedIds(new Set());
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds]);

  const hasUnsavedChanges = JSON.stringify(categories) !== initialCategoriesJson;
  const totalCount = categories.length;
  const excludedCount = categories.filter((c) => c.status === "excluded").length;
  const fashionTotal = totalCount - excludedCount;
  const mappedCount = categories.filter((c) => c.status === "mapped").length;
  const unmappedCount = categories.filter((c) => c.status === "unmapped").length;
  const mappedPercentage = fashionTotal > 0 ? Math.round((mappedCount / fashionTotal) * 100) : 0;

  const filteredCategories = React.useMemo(() => {
    return categories
      .filter((cat) => {
        if (statusFilter !== "all" && cat.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return (
            cat.name.toLowerCase().includes(q) ||
            cat.storePath.toLowerCase().includes(q) ||
            Boolean(cat.assignedPersonaPath?.toLowerCase().includes(q)) ||
            Boolean(cat.subCategory?.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "unmapped_first") {
          const order = { unmapped: 0, mapped: 1, excluded: 2 };
          if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
          return b.productCount - a.productCount;
        }
        if (sortBy === "products_desc") return b.productCount - a.productCount;
        return a.name.localeCompare(b.name);
      });
  }, [categories, statusFilter, searchQuery, sortBy]);

  function handleToggleSelectOne(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllVisible() {
    if (selectedIds.size === filteredCategories.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredCategories.map((c) => c.id)));
  }

  function handleDropOnTaxonomy(droppedCatId: string, deptId: string, catId: string, subCat?: string, customPath?: string) {
    const droppedCat = categories.find((c) => c.id === droppedCatId);
    if (!droppedCat) return;

    const assignedPath = customPath || formatPersonaPath(deptId, catId, subCat);
    if (droppedCat.status === "mapped" && droppedCat.assignedPersonaPath === assignedPath) {
      showFeedback(`"${droppedCat.name}" is already mapped to this PLP`, "info");
      return;
    }

    let derived = derivePersonaValues(deptId as PersonaDepartmentId, catId as PersonaCategoryId);
    const customCategory = scopeState.customCategories.find((item) => item.id === catId && item.deptId === deptId);
    if (customCategory?.sizingGroup) {
      const labels: Record<NonNullable<typeof customCategory.sizingGroup>, PersonaDerivedValues["sizingParent"]> = {
        tops: "Tops",
        bottoms: "Bottoms",
        dresses: "Dresses/Full-body",
        outerwear: "Outerwear/Jackets",
        footwear: "Footwear",
      };
      derived = { ...derived, sizingParent: labels[customCategory.sizingGroup] };
    }

    setCategories((prev) =>
      prev.map((c) =>
        c.id === droppedCatId
          ? {
              ...c,
              status: "mapped",
              assignedPersonaPath: assignedPath,
              departmentId: deptId as PersonaDepartmentId,
              categoryId: catId as PersonaCategoryId,
              subCategory: subCat || undefined,
              derived,
              excludeReason: undefined,
            }
          : c
      )
    );
    setSelectedIds(new Set([droppedCatId]));
    showFeedback(`Mapped "${droppedCat.name}" → ${assignedPath}`, "success");
  }

  function handleAssignTaxonomy(deptId: string, catId: string, subCat?: string, customDisplayPath?: string) {
    let targetIds = Array.from(selectedIds);
    if (targetIds.length === 0) {
      const firstUnmapped = filteredCategories.find((c) => c.status === "unmapped");
      if (!firstUnmapped) {
        showFeedback("Please select or drag a store category from the left panel to map.", "warn");
        return;
      }
      targetIds = [firstUnmapped.id];
      setSelectedIds(new Set([firstUnmapped.id]));
    }
    targetIds.forEach((id) => handleDropOnTaxonomy(id, deptId, catId, subCat, customDisplayPath));
  }

  function handleUnmapSingleCategory(categoryId: string, categoryName: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, status: "unmapped", assignedPersonaPath: undefined, departmentId: undefined, categoryId: undefined, subCategory: undefined, derived: undefined }
          : c
      )
    );
    showFeedback(`Unmapped "${categoryName}"`, "info");
  }

  function handleBulkExclude() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setCategories((prev) =>
      prev.map((c) =>
        ids.includes(c.id)
          ? { ...c, status: "excluded", excludeReason: "Excluded by merchant batch action", assignedPersonaPath: undefined, departmentId: undefined, categoryId: undefined, subCategory: undefined, derived: undefined }
          : c
      )
    );
    setSelectedIds(new Set());
    showFeedback(`Excluded ${ids.length} selected categories`, "info");
  }

  function handleBulkClearMapping() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setCategories((prev) =>
      prev.map((c) =>
        ids.includes(c.id) ? { ...c, status: "unmapped", assignedPersonaPath: undefined, departmentId: undefined, categoryId: undefined, subCategory: undefined, derived: undefined } : c
      )
    );
    showFeedback(`Cleared mapping for ${ids.length} categories`, "info");
  }

  async function handleAutoMatchUnmapped() {
    if (isAutoMatching || isSavingMapping) return;
    if (autoMatchCompletedAt) {
      showFeedback("Auto-Match already ran once for this store. Clear the mapping to run it again.", "info");
      return;
    }
    const wasUsingDefaultScope = !isScopeConfigured;
    const effectiveScope = wasUsingDefaultScope ? getDefaultScopeState() : scopeState;

    const selectedUnmapped = categories.filter((category) =>
      category.status === "unmapped" && (selectedIds.size === 0 || selectedIds.has(category.id))
    );
    if (selectedUnmapped.length === 0) {
      showFeedback("There are no unmapped categories in this selection.", "info");
      return;
    }

    setIsAutoMatching(true);
    try {
      // Exactly one Gemini call for the whole selection — no client-side batching.
      const response = await fetch("/api/store-connection/persona-mapping/auto-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryIds: selectedUnmapped.map((category) => category.id),
          scope: {
            configured: true,
            enabledDeptIds: Array.from(effectiveScope.enabledDeptIds),
            enabledLeafKeys: Array.from(effectiveScope.enabledLeafKeys),
            customLeaves: effectiveScope.customLeaves,
            customCategories: effectiveScope.customCategories,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI Auto-Match failed");
      const verdicts: Array<{ id: string; mapping: PersonaCategoryMap[string] | null }> = data.verdicts ?? [];

      const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict.mapping]));
      const next = categories.map((category) => {
        const mapping = byId.get(category.id);
        if (mapping === undefined || mapping === null) return category;
        if (mapping.status === "excluded") {
          return {
            ...category,
            status: "excluded" as const,
            excludeReason: mapping.excludeReason,
            assignedPersonaPath: undefined,
            departmentId: undefined,
            categoryId: undefined,
            subCategory: undefined,
            derived: undefined,
            isAutoMatched: true,
          };
        }
        if (!mapping.departmentId || !mapping.categoryId) return category;
        return {
          ...category,
          status: "mapped" as const,
          assignedPersonaPath: formatPersonaPath(mapping.departmentId, mapping.categoryId, mapping.subCategory),
          departmentId: mapping.departmentId,
          categoryId: mapping.categoryId as PersonaCategoryId,
          subCategory: mapping.subCategory,
          derived: derivePersonaValues(mapping.departmentId, mapping.categoryId as PersonaCategoryId),
          excludeReason: undefined,
          isAutoMatched: true,
        };
      });

      const matched = next.filter((category, index) => category.status !== categories[index].status).length;
      if (matched === 0) {
        showFeedback("AI could not safely match these categories. They remain unmapped.", "warn");
        return;
      }
      // Only narrow when this run supplied the full default scope itself — a scope the merchant
      // already configured via "Configure What You Sell" is their explicit choice and must not
      // be silently shrunk just because this particular run didn't touch every enabled path.
      const scopeToSave = wasUsingDefaultScope ? narrowScopeToUsedPaths(effectiveScope, next) : effectiveScope;
      if (await persistMappings(next, scopeToSave, { markAutoMatchCompleted: true })) {
        setScopeState(scopeToSave);
        setIsScopeConfigured(true);
        setSelectedIds(new Set());
        showFeedback(`AI matched and saved ${matched} categories. Auto-Match will not run again unless the mapping is cleared.`, "success");
      }
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "AI Auto-Match failed", "warn");
    } finally {
      setIsAutoMatching(false);
    }
  }

  async function persistMappings(
    nextCategories: StoreCategoryItem[],
    nextScope: TaxonomyScopeState,
    options?: { markAutoMatchCompleted?: boolean },
  ): Promise<boolean> {
    const mappings: PersonaCategoryMap = {};
    for (const category of nextCategories) {
      if (category.status === "excluded") {
        mappings[category.id] = {
          status: "excluded",
          excludeReason: category.excludeReason,
          isAutoMatched: category.isAutoMatched,
        };
      } else if (category.status === "mapped" && category.departmentId && category.categoryId) {
        mappings[category.id] = {
          status: "mapped",
          departmentId: category.departmentId,
          categoryId: category.categoryId,
          subCategory: category.subCategory,
          personaPath: formatPersonaPath(category.departmentId, category.categoryId, category.subCategory),
          isAutoMatched: category.isAutoMatched,
        };
      }
    }

    const response = await fetch("/api/store-connection/persona-mapping", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: {
          configured: true,
          enabledDeptIds: Array.from(nextScope.enabledDeptIds),
          enabledLeafKeys: Array.from(nextScope.enabledLeafKeys),
          customLeaves: nextScope.customLeaves,
          customCategories: nextScope.customCategories,
        },
        mappings,
        markAutoMatchCompleted: options?.markAutoMatchCompleted === true,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      showFeedback(data.error ?? "Could not save category mappings", "warn");
      return false;
    }
    const saved = (data.categories ?? nextCategories) as StoreCategoryItem[];
    setCategories(saved);
    setInitialCategoriesJson(JSON.stringify(saved));
    setAutoMatchCompletedAt((data.autoMatchCompletedAt as string | null) ?? null);
    await refreshConnection();
    return true;
  }

  async function handleSaveChanges() {
    if (isSavingMapping) return;
    setIsSavingMapping(true);
    try {
      if (!(await persistMappings(categories, scopeState))) return;
      setSaveSuccessMessage("All store category mappings saved successfully!");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
      showFeedback("Taxonomy mappings saved to store configuration", "success");
    } finally {
      setIsSavingMapping(false);
    }
  }

  async function handleContinueToSetup() {
    if (!onContinueToSetup || isSavingMapping) return;
    // Unsaved edits would otherwise vanish silently the moment Setup mounts and reloads the
    // connection from the server — save them first rather than losing work on navigation.
    if (hasUnsavedChanges) {
      setIsSavingMapping(true);
      try {
        if (!(await persistMappings(categories, scopeState))) return;
      } finally {
        setIsSavingMapping(false);
      }
    }
    onContinueToSetup();
  }

  async function handleResetToDefaults() {
    if (isSavingMapping || !window.confirm("Clear all mappings and reset the Persona taxonomy hierarchy to its unconfigured state?")) return;

    setIsSavingMapping(true);
    try {
      const response = await fetch("/api/store-connection/persona-mapping", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        showFeedback(data.error ?? "Could not clear category mappings", "warn");
        return;
      }

      const reset = (data.categories ?? categories.map((category) => ({
        id: category.id,
        name: category.name,
        storePath: category.storePath,
        productCount: category.productCount,
        status: "unmapped" as const,
      }))) as StoreCategoryItem[];
      const emptyScope: TaxonomyScopeState = {
        enabledDeptIds: new Set(),
        enabledLeafKeys: new Set(),
        customLeaves: [],
        customCategories: [],
      };

      setCategories(reset);
      setInitialCategoriesJson(JSON.stringify(reset));
      setScopeState(emptyScope);
      setIsScopeConfigured(false);
      setIsScopeModalOpen(false);
      setSelectedIds(new Set());
      setDeptFilter("all");
      setTaxonomySearch("");
      setAutoMatchCompletedAt((data.autoMatchCompletedAt as string | null) ?? null);
      await refreshConnection();
      showFeedback("All mappings and taxonomy scope were cleared. Auto-Match can run again.", "success");
    } finally {
      setIsSavingMapping(false);
    }
  }

  function toggleDeptExpanded(deptId: string) {
    setExpandedDepts((prev) => ({ ...prev, [deptId]: !prev[deptId] }));
  }

  function toggleCatExpanded(deptId: string, catId: string) {
    const key = `${deptId}:${catId}`;
    setExpandedCats((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleExpandAllDepts() {
    const allOpen: Record<string, boolean> = {};
    const allCatsOpen: Record<string, boolean> = {};
    PERSONA_DEPARTMENTS.forEach((d) => {
      allOpen[d.id] = true;
      PERSONA_CATEGORIES.forEach((c) => { allCatsOpen[`${d.id}:${c.id}`] = true; });
    });
    setExpandedDepts(allOpen);
    setExpandedCats(allCatsOpen);
  }

  function handleCollapseAllDepts() {
    const allClosed: Record<string, boolean> = {};
    const allCatsClosed: Record<string, boolean> = {};
    PERSONA_DEPARTMENTS.forEach((d) => {
      allClosed[d.id] = false;
      PERSONA_CATEGORIES.forEach((c) => { allCatsClosed[`${d.id}:${c.id}`] = false; });
    });
    setExpandedDepts(allClosed);
    setExpandedCats(allCatsClosed);
  }

  function getLeafSkuCount(deptId: string, catId: string, sub?: string): number {
    const assigned = categories.filter((c) => {
      if (sub) return c.departmentId === deptId && c.categoryId === catId && c.subCategory === sub && c.status === "mapped";
      return c.departmentId === deptId && c.categoryId === catId && !c.subCategory && c.status === "mapped";
    });
    return assigned.reduce((total, category) => total + category.productCount, 0);
  }

  const orderedCategoriesList = React.useMemo<PersonaCategoryDef[]>(() => {
    const order: PersonaCategoryId[] = ["top", "full-body", "bottom", "outerwear", "footwear"];
    return order.map((id) => PERSONA_CATEGORIES.find((c) => c.id === id)).filter((c): c is PersonaCategoryDef => Boolean(c));
  }, []);

  interface FlatTaxonomyPath {
    deptId: PersonaDepartmentId;
    deptName: string;
    catId: PersonaCategoryId;
    catName: string;
    subCat?: string;
    fullPath: string;
  }

  const allTaxonomyPaths = React.useMemo<FlatTaxonomyPath[]>(() => {
    const list: FlatTaxonomyPath[] = [];
    PERSONA_DEPARTMENTS.filter((dept) => scopeState.enabledDeptIds.has(dept.id)).forEach((dept) => {
      PERSONA_CATEGORIES.forEach((cat) => {
        const subs = (PERSONA_SUB_CATEGORIES[dept.id][cat.id] || []).filter((sub) => scopeState.enabledLeafKeys.has(`${dept.id}:${cat.id}:${sub}`));
        if (subs.length === 0) return;
        list.push({ deptId: dept.id, deptName: dept.name, catId: cat.id, catName: cat.name, fullPath: formatPersonaPath(dept.id, cat.id) });
        subs.forEach((sub) => {
          list.push({ deptId: dept.id, deptName: dept.name, catId: cat.id, catName: cat.name, subCat: sub, fullPath: formatPersonaPath(dept.id, cat.id, sub) });
        });
      });
      scopeState.customLeaves.filter((cl) => cl.deptId === dept.id).forEach((cl) => {
        list.push({ deptId: dept.id, deptName: dept.name, catId: cl.catId as PersonaCategoryId, catName: cl.catId, subCat: cl.subCategory, fullPath: `${dept.name} > ${cl.catId} > ${cl.label}` });
      });
    });
    return list;
  }, [scopeState]);

  const matchingGlobalPaths = React.useMemo(() => {
    if (!taxonomySearch.trim()) return [];
    const q = taxonomySearch.toLowerCase().trim();
    return allTaxonomyPaths.filter(
      (p) => p.fullPath.toLowerCase().includes(q) || Boolean(p.subCat?.toLowerCase().includes(q)) || p.catName.toLowerCase().includes(q) || p.deptName.toLowerCase().includes(q)
    );
  }, [allTaxonomyPaths, taxonomySearch]);

  const selectedItemsPreview = React.useMemo(() => categories.filter((c) => selectedIds.has(c.id)), [categories, selectedIds]);

  if (isLoadingMapping) {
    return (
      <div className="mapping-panel flex min-h-[420px] items-center justify-center rounded-[var(--radius-2xl)] border">
        <div className="text-center">
          <span className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-mapping-border)] border-t-[var(--color-brand)]" />
          <p className="text-sm font-semibold text-[var(--color-text-secondary)]">Loading your store categories…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-8">
      {/* Page toolbar */}
      <div className="flex flex-col gap-4 border-b border-[var(--color-mapping-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="mapping-accent-button flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] text-white">
              <FolderTree className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-xl">Store Category Mapping</h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Connect every store collection to one precise Persona taxonomy path.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="rounded-full border border-[var(--color-mapping-border)] bg-[var(--color-mapping-control)] px-2.5 py-1 font-semibold text-[var(--color-text-secondary)]">
              {mappedCount} of {fashionTotal} mapped ({mappedPercentage}%)
            </span>
            {unmappedCount > 0 && (
              <span className="mapping-status-warning rounded-full border px-2.5 py-1 font-bold text-[var(--color-warning)]">
                {unmappedCount} unmapped
              </span>
            )}
            <span className="hidden text-[var(--color-text-muted)] md:inline">•</span>
            <span className="hidden font-mono text-[11px] text-[var(--color-text-muted)] md:inline">
              {connection.storeName} ({connection.platform.toUpperCase()})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoMatchUnmapped}
            disabled={isAutoMatching || isSavingMapping || Boolean(autoMatchCompletedAt)}
            title={
              autoMatchCompletedAt
                ? "Auto-Match already ran once for this store. Clear the mapping to run it again."
                : "Use AI and live product samples to match unmapped categories — a one-time run per mapping"
            }
            className={cn(
              "mapping-interactive inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] border px-3 py-1.5 text-xs font-bold",
              autoMatchCompletedAt
                ? "cursor-not-allowed border-[var(--color-mapping-border)] bg-[var(--color-mapping-control)] text-[var(--color-text-muted)]"
                : "mapping-status-brand text-[var(--color-brand-strong)]"
            )}
          >
            {isAutoMatching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : autoMatchCompletedAt ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{isAutoMatching ? "AI Matching…" : autoMatchCompletedAt ? "Auto-Matched" : "Auto-Match"}</span>
          </button>
          <button
            type="button"
            onClick={handleResetToDefaults}
            disabled={isSavingMapping}
            title="Clear all mappings and taxonomy scope"
            className="mapping-interactive rounded-[var(--radius-lg)] border border-[var(--color-mapping-border)] bg-[var(--color-mapping-control)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={isSavingMapping}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-lg)] px-4 py-2 text-xs font-bold transition-all",
              hasUnsavedChanges ? "mapping-accent-button" : "bg-[var(--color-mapping-control)] text-[var(--color-text-secondary)]"
            )}
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSavingMapping ? "Saving…" : "Save"}</span>
            {hasUnsavedChanges && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-warning)]" />}
          </button>
          {onContinueToSetup && (
            <button
              type="button"
              onClick={() => void handleContinueToSetup()}
              disabled={isSavingMapping || mappedCount === 0}
              title={mappedCount === 0 ? "Map at least one category before continuing to Setup" : "Continue to Setup"}
              className="mapping-accent-button inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-lg)] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Continue to Setup</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-success-border)] bg-[var(--color-success-light)] px-3 py-2 text-xs font-semibold text-[var(--color-success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {actionFeedback && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-xs font-semibold",
            actionFeedback.type === "success" && "border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]",
            actionFeedback.type === "warn" && "border-[var(--color-warning-border)] bg-[var(--color-warning-light)] text-[var(--color-warning)]",
            actionFeedback.type === "info" && "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
          )}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === "success" && <Check className="h-3.5 w-3.5" />}
            {actionFeedback.type === "warn" && <AlertCircle className="h-3.5 w-3.5" />}
            {actionFeedback.type === "info" && <Info className="h-3.5 w-3.5" />}
            <span>{actionFeedback.message}</span>
          </div>
          <button type="button" onClick={() => setActionFeedback(null)} className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Drag & drop guidance */}
      <div className="mapping-status-brand flex flex-col gap-3 rounded-[var(--radius-xl)] border px-4 py-3 shadow-[0_12px_30px_-24px_#ff5b3d] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="mapping-accent-button flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-white">
            <Move className="h-4 w-4" />
          </span>
          <div className="text-[13px] leading-relaxed">
            <span className="font-extrabold text-[var(--color-brand-strong)]">Drag &amp; Drop Mapping:</span>{" "}
            <span className="text-[var(--color-text-secondary)]">
              Drag any store collection from the left panel and drop onto a Persona path on the right. Dropping a new category onto an already mapped path adds to it — multiple store PLPs can share one Persona path.
            </span>
          </div>
        </div>
        {draggedCategory ? (
          <div className="mapping-status-brand inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1 text-xs font-bold text-[var(--color-brand-strong)]">
            <GripVertical className="h-3.5 w-3.5" />
            <span className="max-w-[200px] truncate">Dragging: {draggedCategory.name}</span>
          </div>
        ) : (
          <div className="hidden shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--color-brand-strong)]/80 md:flex">
            <Sparkles className="h-3 w-3" />
            <span>Many-to-1 mapping supported</span>
          </div>
        )}
      </div>

      {/* Main split workspace */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT: store categories */}
        <div className="mapping-panel flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-2xl)] border lg:col-span-4">
          <div className="mapping-panel-alt space-y-3 border-b border-[var(--color-mapping-border)] p-4">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--color-text-primary)]">
                  <span>Store Categories</span>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--color-text-muted)]">
                    {filteredCategories.length} pages
                  </span>
                </h3>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Actual store collection &amp; PLP routes from your catalog</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <span className="text-[11px]">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] focus:outline-none"
                >
                  <option value="unmapped_first">Unmapped First</option>
                  <option value="products_desc">Most Products</option>
                  <option value="name_asc">Name A-Z</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search category name, path, or Persona match... (Press '/' to focus)"
                className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-2 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold transition-colors",
                    statusFilter === "all" ? "border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]" : "border border-transparent bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
                  )}
                >
                  All ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("unmapped")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold transition-colors",
                    statusFilter === "unmapped" ? "border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] text-[var(--color-warning)]" : "border border-transparent bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                  <span>Unmapped ({unmappedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("mapped")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold transition-colors",
                    statusFilter === "mapped" ? "border border-[var(--color-success-border)] bg-[var(--color-success-light)] text-[var(--color-success)]" : "border border-transparent bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
                  )}
                >
                  <Check className="h-3 w-3" />
                  <span>Mapped ({mappedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("excluded")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold transition-colors",
                    statusFilter === "excluded" ? "border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]" : "border border-transparent bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
                  )}
                >
                  <Ban className="h-3 w-3" />
                  <span>Excluded ({excludedCount})</span>
                </button>
              </div>

              <button type="button" onClick={handleSelectAllVisible} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                {selectedIds.size > 0 && selectedIds.size === filteredCategories.length ? <CheckSquare className="h-4 w-4 text-[var(--color-brand)]" /> : <Square className="h-4 w-4 text-[var(--color-text-muted)]" />}
                <span>{selectedIds.size === filteredCategories.length && filteredCategories.length > 0 ? "Deselect All" : "Select All"}</span>
              </button>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius-xl)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white gradient-brand">{selectedIds.size}</span>
                  <div className="min-w-0">
                    <span className="block truncate text-xs font-bold text-[var(--color-brand-strong)]">
                      {selectedIds.size} {selectedIds.size === 1 ? "category" : "categories"} selected
                    </span>
                    {selectedIds.size === 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const id = Array.from(selectedIds)[0];
                          if (typeof id === "string") locateAndHighlightCategory(id);
                        }}
                        className="text-[10px] font-semibold text-[var(--color-brand-strong)] underline"
                      >
                        Scroll to selected in list
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={handleBulkExclude} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]">
                    Exclude
                  </button>
                  <button type="button" onClick={handleBulkClearMapping} className="rounded-[var(--radius-md)] border border-[var(--color-error-border)] bg-[var(--color-surface-sticky)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-error)] hover:bg-[var(--color-error-light)]">
                    Unmap
                  </button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} title="Clear selection (Esc)" className="rounded-[var(--radius-md)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-brand)]/15 hover:text-[var(--color-brand-strong)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="max-h-[680px] divide-y divide-[var(--color-mapping-border)] overflow-y-auto">
            {filteredCategories.length === 0 ? (
              <div className="space-y-2 p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-base)] text-[var(--color-text-muted)]">
                  <Filter className="h-5 w-5" />
                </div>
                <p className="text-xs font-bold text-[var(--color-text-secondary)]">No store categories match your filters</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Try clearing search keywords or switching filter chips.</p>
                <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }} className="mt-2 text-xs font-bold text-[var(--color-brand-strong)] hover:underline">
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = selectedIds.has(cat.id);
                const isMapped = cat.status === "mapped";
                const isExcluded = cat.status === "excluded";
                const isDragging = draggedCategoryId === cat.id;
                const isHighlighted = highlightedCategoryId === cat.id;

                return (
                  <div
                    key={cat.id}
                    id={`category-item-${cat.id}`}
                    draggable={!isExcluded}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", cat.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedCategoryId(cat.id);
                    }}
                    onDragEnd={() => { setDraggedCategoryId(null); setDragOverTargetKey(null); }}
                    onClick={() => handleToggleSelectOne(cat.id)}
                    className={cn(
                      "flex select-none flex-col gap-2 border-l-4 p-3 transition-all",
                      isExcluded ? "cursor-default border-l-[var(--color-border-strong)] bg-[#17121e] text-[var(--color-text-muted)]" : "cursor-grab active:cursor-grabbing",
                      isDragging && "scale-[0.99] border-2 border-dashed border-[var(--color-brand)] bg-[var(--color-brand-light)] opacity-40",
                      !isDragging && isHighlighted && "scale-[1.01] border-l-[var(--color-brand)] bg-[var(--color-brand-light)] ring-2 ring-[var(--color-brand)]/50",
                      !isDragging && !isHighlighted && isSelected && "mapping-status-brand border-l-[var(--color-brand)] ring-1 ring-[var(--color-brand)]/30",
                      !isDragging && !isHighlighted && !isSelected && isMapped && "mapping-status-success border-l-[var(--color-success)] hover:bg-[#204139]",
                      !isDragging && !isHighlighted && !isSelected && !isMapped && !isExcluded && "mapping-interactive border-l-[var(--color-warning)] bg-[var(--color-mapping-panel)]"
                    )}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {!isExcluded && (
                          <div className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--color-text-muted)]" title="Drag and drop onto a right-side Persona path to map">
                            <GripVertical className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectOne(cat.id, e)}
                          className="mt-0.5 shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-brand)]"
                          aria-label={isSelected ? "Deselect category" : "Select category"}
                        >
                          {isSelected ? <CheckSquare className="h-4 w-4 text-[var(--color-brand)]" /> : <Square className="h-4 w-4 text-[var(--color-border-strong)]" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span className={cn("block break-words text-xs font-bold leading-snug", isExcluded ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text-primary)]")} title={cat.name}>
                            {cat.name}
                          </span>
                          <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                            <span>Path:</span>
                            <span className="truncate text-[var(--color-text-secondary)]" title={cat.storePath}>{cat.storePath}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="whitespace-nowrap rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-text-secondary)]">
                            {cat.productCount} SKUs
                          </span>
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              <Check className="h-2.5 w-2.5" /> Mapped
                            </span>
                          ) : isExcluded ? (
                            <span className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                              Excluded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                              Unmapped
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isMapped && (
                            <button type="button" onClick={(e) => handleUnmapSingleCategory(cat.id, cat.name, e)} title="Unmap this category" className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewCategory(cat); }}
                            title="Preview items in this collection"
                            className="inline-flex items-center gap-1 rounded border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand-strong)] hover:bg-[var(--color-brand)]/15"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Preview</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {isMapped && cat.assignedPersonaPath && (
                      <div className="ml-6 flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-success-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-success)]">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 font-bold">Mapped to:</span>
                          <span className="truncate font-mono font-semibold">{cat.assignedPersonaPath}</span>
                        </div>
                        <span className="shrink-0 rounded border border-[var(--color-success-border)] bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
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

        {/* RIGHT: persona taxonomy */}
        <div className="mapping-panel sticky top-20 flex flex-col overflow-hidden rounded-[var(--radius-2xl)] border lg:col-span-8">
          {!isScopeConfigured ? (
            <div className="flex min-h-[560px] flex-col">
              <div className="mapping-panel-alt flex items-center justify-between border-b border-[var(--color-mapping-border)] p-4">
                <div className="flex items-center gap-2">
                  <span className="mapping-accent-button flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] text-white">
                    <FolderTree className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-extrabold tracking-tight text-[var(--color-text-primary)]">Persona Fixed Taxonomy Hierarchy</h3>
                    <p className="text-xs text-[var(--color-text-muted)]">Configure what your store sells to activate the mapping hierarchy.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScopeModalOpen(true)}
                  className="mapping-interactive mapping-status-brand inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] border px-3.5 py-2 text-xs font-bold text-[var(--color-brand-strong)]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Configure What You Sell</span>
                </button>
              </div>

              <div className="my-auto flex flex-1 flex-col items-center justify-center space-y-6 p-8 text-center sm:p-12">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-2xl)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]">
                    <Layers className="h-10 w-10" />
                  </div>
                  <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[var(--shadow-card)] gradient-brand">
                    <Sparkles className="h-4 w-4" />
                  </div>
                </div>
                <div className="max-w-md space-y-2">
                  <h4 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-xl">Define What You Sell to Start Mapping</h4>
                  <p className="text-xs leading-relaxed text-[var(--color-text-muted)] sm:text-sm">
                    Select which departments and merchandise categories your retail catalog carries. Only your active categories will show up in the mapping workspace.
                  </p>
                </div>
                <div className="grid w-full max-w-xl grid-cols-1 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel-alt)] text-left sm:grid-cols-3 sm:divide-x sm:divide-[var(--color-mapping-border)]">
                  {[
                    { icon: Layers, title: "Department Scope", body: "Enable Women, Men, Unisex, and Kids divisions" },
                    { icon: SlidersHorizontal, title: "Category Control", body: "Choose tops, dresses, bottoms, outerwear, and footwear" },
                    { icon: Tag, title: "Custom Categories", body: "Add custom garment types directly in the taxonomy" },
                  ].map((f) => (
                    <div key={f.title} className="flex gap-2.5 border-b border-[var(--color-mapping-border)] p-4 last:border-b-0 sm:block sm:border-b-0">
                      <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-strong)] sm:mb-2" />
                      <div>
                        <span className="block text-xs font-extrabold text-[var(--color-text-primary)]">{f.title}</span>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{f.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsScopeModalOpen(true)}
                  className="mapping-accent-button inline-flex items-center gap-2.5 rounded-[var(--radius-xl)] px-7 py-3.5 text-sm font-bold text-white transition-all"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Start Mapping</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mapping-panel-alt space-y-3 border-b border-[var(--color-mapping-border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-white gradient-brand">
                      <FolderTree className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold tracking-tight text-[var(--color-text-primary)]">Persona Fixed Taxonomy Hierarchy</h3>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        {scopeState.enabledDeptIds.size} departments active • {scopeState.enabledLeafKeys.size + scopeState.customLeaves.length} taxonomy paths enabled
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScopeModalOpen(true)}
                    title="Change active departments, categories or add custom items"
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-3 py-1.5 text-xs font-bold text-[var(--color-brand-strong)] hover:bg-[var(--color-brand)]/15"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Configure What You Sell</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                  </button>
                </div>

                <div className={cn("rounded-[var(--radius-xl)] border p-3 text-xs transition-all", selectedItemsPreview.length > 0 ? "border-[var(--color-brand)]/25 bg-[var(--color-brand-light)]" : "border-[var(--color-border)] bg-[var(--color-surface-sticky)]")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-strong)]">Ready to fill for:</span>
                        {selectedItemsPreview.length === 1 && selectedItemsPreview[0].assignedPersonaPath && (
                          <span className="max-w-[280px] truncate rounded bg-[var(--color-brand)]/15 px-1.5 py-0.2 font-mono text-[10px] font-medium text-[var(--color-brand-strong)]">
                            Current: {selectedItemsPreview[0].assignedPersonaPath}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate font-bold text-[var(--color-text-primary)]">
                        {selectedItemsPreview.length === 0 ? (
                          <span className="font-normal italic text-[var(--color-text-muted)]">Select any store category on the left to map its taxonomy path</span>
                        ) : selectedItemsPreview.length === 1 ? (
                          <span>
                            &ldquo;{selectedItemsPreview[0].name}&rdquo;{" "}
                            <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
                              ({selectedItemsPreview[0].productCount} products • Store route: <code className="text-[var(--color-text-secondary)]">{selectedItemsPreview[0].storePath}</code>)
                            </span>
                          </span>
                        ) : (
                          <span>
                            {selectedItemsPreview.length} store categories selected ({selectedItemsPreview.map((c) => c.name).slice(0, 2).join(", ")}
                            {selectedItemsPreview.length > 2 ? "…" : ""})
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedItemsPreview.length > 0 && (
                      <span className="shrink-0 rounded-full bg-[var(--color-brand)]/20 px-2.5 py-1 text-[10px] font-bold text-[var(--color-brand-strong)]">Target Active</span>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={taxonomySearch}
                    onChange={(e) => setTaxonomySearch(e.target.value)}
                    placeholder="Filter ready paths across your enabled departments..."
                    className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] py-2 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
                  />
                  {taxonomySearch && (
                    <button type="button" onClick={() => setTaxonomySearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDeptFilter("all")}
                      className={cn(
                        "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-semibold transition-colors",
                        deptFilter === "all" ? "bg-[var(--color-text-primary)] text-white" : "border border-[var(--color-border)] bg-[var(--color-surface-sticky)] text-[var(--color-text-secondary)]"
                      )}
                    >
                      All ({scopeState.enabledDeptIds.size} Depts)
                    </button>
                    {PERSONA_DEPARTMENTS.filter((d) => scopeState.enabledDeptIds.has(d.id)).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDeptFilter(d.id)}
                        className={cn(
                          "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-semibold transition-colors",
                          deptFilter === d.id ? "text-white gradient-brand" : "border border-[var(--color-border)] bg-[var(--color-surface-sticky)] text-[var(--color-text-secondary)]"
                        )}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={handleExpandAllDepts} className="rounded px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-strong)] hover:bg-[var(--color-brand-light)]">
                      Expand All
                    </button>
                    <span className="text-[var(--color-border-strong)]">|</span>
                    <button type="button" onClick={handleCollapseAllDepts} className="rounded px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]">
                      Collapse All
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[750px] space-y-4 overflow-y-auto bg-[var(--color-surface-base)] p-4">
                {taxonomySearch.trim() && (
                  <div className="flex items-center justify-between rounded-[var(--radius-xl)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    <span>
                      Filtering active paths containing <strong className="font-bold text-[var(--color-brand-strong)]">&ldquo;{taxonomySearch}&rdquo;</strong>:
                    </span>
                    <span className="rounded-md border border-[var(--color-brand)]/25 bg-[var(--color-surface-sticky)] px-2 py-0.5 font-mono text-xs font-extrabold text-[var(--color-brand-strong)]">
                      {matchingGlobalPaths.length} ready paths
                    </span>
                  </div>
                )}

                <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)]">
                  {PERSONA_DEPARTMENTS.filter((dept) => scopeState.enabledDeptIds.has(dept.id) && (deptFilter === "all" || dept.id === deptFilter)).map((dept) => {
                    const isSearching = Boolean(taxonomySearch.trim());
                    const deptMatchingCount = isSearching ? matchingGlobalPaths.filter((p) => p.deptId === dept.id).length : 0;
                    if (isSearching && deptMatchingCount === 0) return null;

                    const isDeptExpanded = isSearching ? true : expandedDepts[dept.id] ?? true;
                    const activeDeptStandardLeaves = orderedCategoriesList.flatMap((cat) => {
                      const allSubs = PERSONA_SUB_CATEGORIES[dept.id]?.[cat.id] || [];
                      return allSubs.filter((sub) => scopeState.enabledLeafKeys.has(`${dept.id}:${cat.id}:${sub}`)).map((sub) => ({ catId: cat.id, sub }));
                    });
                    const activeDeptCustomLeaves = scopeState.customLeaves.filter((cl) => cl.deptId === dept.id);
                    const totalDeptActiveLeaves = activeDeptStandardLeaves.length + activeDeptCustomLeaves.length;
                    // Read off the mapped store categories themselves rather than summed over the enabled
                    // sub-leaves. Summing leaves silently dropped every mapping bound to a category node
                    // instead of one of its leaves — `Women > Footwear` rather than `Footwear > Sandals` —
                    // so a department reported a fraction of the stock the scan then actually walked.
                    const deptTotalSkus = categories.reduce(
                      (acc, c) => (c.status === "mapped" && c.departmentId === dept.id ? acc + c.productCount : acc),
                      0
                    );

                    return (
                      <div key={dept.id}>
                        <div className="flex items-center justify-between bg-[var(--color-surface-base)] px-4 py-3">
                          <button type="button" onClick={() => toggleDeptExpanded(dept.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                            <span className="p-1 text-[var(--color-text-muted)]">{isDeptExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dept.accentColor }} />
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-[var(--color-text-primary)]">{dept.name}</span>
                              <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-text-muted)]">
                                Path: {dept.name}
                              </span>
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <span className="rounded-md border border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-strong)]">
                              {totalDeptActiveLeaves} paths
                            </span>
                            <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-2 py-0.5 font-mono text-xs font-medium text-[var(--color-text-muted)]">
                              {deptTotalSkus.toLocaleString()} mapped SKUs
                            </span>
                          </div>
                        </div>

                        {isDeptExpanded && (
                          <div className="space-y-3 bg-[var(--color-surface-sticky)] py-2 pl-6 pr-4">
                            {orderedCategoriesList.map((cat) => {
                              const catKey = `${dept.id}:${cat.id}`;
                              const allSubs = PERSONA_SUB_CATEGORIES[dept.id]?.[cat.id] || [];
                              const catDisplayName = getCategoryDisplayName(cat.id);
                              const enabledSubs = allSubs.filter((sub) => scopeState.enabledLeafKeys.has(`${dept.id}:${cat.id}:${sub}`));
                              const customLeavesUnderCat = scopeState.customLeaves.filter((cl) => cl.deptId === dept.id && cl.catId === cat.id);

                              const q = taxonomySearch.toLowerCase().trim();
                              const isSearchingCat = Boolean(q);
                              const filteredSubs = isSearchingCat
                                ? enabledSubs.filter((sub) => {
                                    const label = formatLeafLabel(sub).toLowerCase();
                                    const full = formatPersonaPath(dept.id, cat.id, sub).toLowerCase();
                                    return sub.toLowerCase().includes(q) || label.includes(q) || catDisplayName.toLowerCase().includes(q) || dept.name.toLowerCase().includes(q) || full.includes(q);
                                  })
                                : enabledSubs;
                              const filteredCustom = isSearchingCat
                                ? customLeavesUnderCat.filter((cl) => cl.label.toLowerCase().includes(q) || cl.subCategory.toLowerCase().includes(q) || catDisplayName.toLowerCase().includes(q))
                                : customLeavesUnderCat;

                              // A store category can bind to the category node itself rather than to one of
                              // its sub-leaves — the header is an assign target, and Auto-Match answers at
                              // this level whenever it can place the parent but not the garment. Such a
                              // binding has no sub-leaf row to surface on, so the header carries it;
                              // otherwise a category with no enabled leaves drops out of the tree entirely
                              // while still feeding the scan.
                              const categoryLevelMapped = getMappedCategoriesForNode(dept.id, cat.id);
                              const categoryLevelSkus = getLeafSkuCount(dept.id, cat.id);
                              const showCategoryLevel =
                                categoryLevelMapped.length > 0 &&
                                (!isSearchingCat ||
                                  catDisplayName.toLowerCase().includes(q) ||
                                  dept.name.toLowerCase().includes(q) ||
                                  formatPersonaPath(dept.id, cat.id).toLowerCase().includes(q) ||
                                  categoryLevelMapped.some((mc) => mc.name.toLowerCase().includes(q)));

                              if (filteredSubs.length === 0 && filteredCustom.length === 0 && !showCategoryLevel) return null;
                              const isCatExpanded = isSearchingCat ? true : expandedCats[catKey] ?? true;

                              return (
                                <div key={cat.id} className="space-y-2 border-l-2 border-[var(--color-border)] py-1 pl-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <button type="button" onClick={() => toggleCatExpanded(dept.id, cat.id)} className="p-0.5 text-[var(--color-text-muted)]" title={isCatExpanded ? "Collapse" : "Expand"}>
                                        {isCatExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAssignTaxonomy(dept.id, cat.id)}
                                        title="Click to map category-level path to selected category"
                                        className="flex min-w-0 items-center gap-1.5 text-left text-xs font-bold text-[var(--color-text-primary)] hover:text-[var(--color-brand-strong)]"
                                      >
                                        <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />
                                        <span>{catDisplayName}</span>
                                        <span className="truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] px-1.5 py-0.5 font-mono text-[10px] font-normal text-[var(--color-text-muted)]">
                                          Path: {dept.name} &gt; {catDisplayName}
                                        </span>
                                      </button>
                                      {showCategoryLevel && (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--color-success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                          <Check className="h-2.5 w-2.5" />
                                          {categoryLevelMapped.length === 1 ? "Mapped" : `${categoryLevelMapped.length} Mapped`}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                      {showCategoryLevel && (
                                        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                                          {categoryLevelSkus.toLocaleString()} mapped SKUs
                                        </span>
                                      )}
                                      <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                                        {filteredSubs.length + filteredCustom.length} active
                                      </span>
                                    </div>
                                  </div>

                                  {isCatExpanded && (
                                    <div className="space-y-1.5 pl-6 pt-1">
                                      {showCategoryLevel && (
                                        <div className="space-y-1.5 rounded-[var(--radius-xl)] border border-[var(--color-success-border)] bg-[var(--color-success-light)]/40 p-2.5">
                                          <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                            Path: {dept.name} &gt; {catDisplayName} — mapped at category level, no sub-category
                                          </div>
                                          {categoryLevelMapped.map((mc) => (
                                            <div
                                              key={mc.id}
                                              onClick={(e) => { e.stopPropagation(); locateAndHighlightCategory(mc.id); }}
                                              title={`Click to locate & highlight "${mc.name}" on the left catalog list`}
                                              className="group flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-surface-sticky)] p-1.5 transition-all hover:border-[var(--color-brand)]/40 hover:ring-2 hover:ring-[var(--color-brand)]/20"
                                            >
                                              <div className="flex min-w-0 items-center gap-1.5">
                                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)] group-hover:text-[var(--color-brand)]" />
                                                <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-success)]">Store PLP:</span>
                                                <span className="truncate text-xs font-bold text-[var(--color-text-primary)]" title={mc.name}>&ldquo;{mc.name}&rdquo;</span>
                                                <span className="shrink-0 rounded bg-[var(--color-success-light)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--color-success)]">{mc.productCount.toLocaleString()} SKUs</span>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleUnmapSingleCategory(mc.id, mc.name, e); }}
                                                title="Unmap this store category"
                                                className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                                              >
                                                <X className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {filteredSubs.map((sub) => {
                                        const fullPath = formatPersonaPath(dept.id, cat.id, sub);
                                        const leafLabel = formatLeafLabel(sub);
                                        const skuCount = getLeafSkuCount(dept.id, cat.id, sub);
                                        const targetKey = `${dept.id}:${cat.id}:${sub}`;
                                        const isDragOver = dragOverTargetKey === targetKey;
                                        const mappedCategories = getMappedCategoriesForNode(dept.id, cat.id, sub);
                                        const hasMapped = mappedCategories.length > 0;
                                        const isSelectedCatMappedHere = selectedItemsPreview.length === 1 && selectedItemsPreview[0].assignedPersonaPath === fullPath;

                                        return (
                                          <div
                                            key={sub}
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverTargetKey !== targetKey) setDragOverTargetKey(targetKey); }}
                                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && dragOverTargetKey === targetKey) setDragOverTargetKey(null); }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              setDragOverTargetKey(null);
                                              const droppedId = e.dataTransfer.getData("text/plain") || draggedCategoryId;
                                              if (droppedId) handleDropOnTaxonomy(droppedId, dept.id, cat.id, sub);
                                              setDraggedCategoryId(null);
                                            }}
                                            onClick={() => handleAssignTaxonomy(dept.id, cat.id, sub)}
                                            className={cn(
                                              "flex select-none flex-col gap-1.5 rounded-[var(--radius-xl)] border p-2.5 text-xs transition-all cursor-pointer",
                                              isDragOver
                                                ? "scale-[1.01] border-[var(--color-brand)] bg-[var(--color-brand)]/20 ring-2 ring-[var(--color-brand)]/40"
                                                : hasMapped
                                                ? "border-[var(--color-success-border)] bg-[var(--color-success-light)]/40"
                                                : isSelectedCatMappedHere
                                                ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] font-semibold text-[var(--color-brand-strong)]"
                                                : draggedCategoryId !== null
                                                ? "border-dashed border-[var(--color-brand)]/40 bg-[var(--color-brand-light)]/20"
                                                : "border-[var(--color-border)] bg-[var(--color-surface-sticky)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)]/30 hover:bg-[var(--color-brand-light)]/40"
                                            )}
                                          >
                                            <div className="flex min-w-0 items-center justify-between gap-2">
                                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                                <span className={cn("h-2 w-2 shrink-0 rounded-full", hasMapped ? "bg-[var(--color-success)]" : "bg-[var(--color-brand)]")} />
                                                <div className="flex min-w-0 items-center gap-2">
                                                  <span className="truncate font-bold text-[var(--color-text-primary)]">{leafLabel}</span>
                                                  {hasMapped && (
                                                    <span className="inline-flex items-center gap-1 rounded bg-[var(--color-success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                      <Check className="h-2.5 w-2.5" />
                                                      {mappedCategories.length === 1 ? "Mapped" : `${mappedCategories.length} Mapped`}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-muted)]">{skuCount.toLocaleString()} mapped SKUs</span>
                                            </div>

                                            <div className="truncate pl-4.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                                              Path: {dept.name} &gt; {catDisplayName} &gt; {leafLabel}
                                            </div>

                                            {isDragOver ? (
                                              <div className="ml-4.5 flex animate-pulse items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-brand)] bg-[var(--color-brand)]/25 p-1.5 text-[11px] font-bold text-[var(--color-brand-strong)]">
                                                <span className="flex min-w-0 items-center gap-1.5 truncate">
                                                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                                  <span className="truncate">
                                                    Drop to map &ldquo;{draggedCategory?.name}&rdquo;{hasMapped ? ` (${mappedCategories.length} already mapped)` : ""}
                                                  </span>
                                                </span>
                                              </div>
                                            ) : hasMapped ? (
                                              <div className="ml-4.5 space-y-1.5">
                                                {mappedCategories.map((mc) => (
                                                  <div
                                                    key={mc.id}
                                                    onClick={(e) => { e.stopPropagation(); locateAndHighlightCategory(mc.id); }}
                                                    title={`Click to locate & highlight "${mc.name}" on the left catalog list`}
                                                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-surface-sticky)] p-1.5 transition-all hover:border-[var(--color-brand)]/40 hover:ring-2 hover:ring-[var(--color-brand)]/20"
                                                  >
                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)] group-hover:text-[var(--color-brand)]" />
                                                      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-success)]">Store PLP:</span>
                                                      <span className="truncate text-xs font-bold text-[var(--color-text-primary)]" title={mc.name}>&ldquo;{mc.name}&rdquo;</span>
                                                      <span className="shrink-0 rounded bg-[var(--color-success-light)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--color-success)]">{mc.productCount} SKUs</span>
                                                    </div>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => { e.stopPropagation(); handleUnmapSingleCategory(mc.id, mc.name, e); }}
                                                      title="Unmap this store category"
                                                      className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                                                    >
                                                      <X className="h-3.5 w-3.5" />
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : draggedCategoryId !== null ? (
                                              <div className="ml-4.5 flex items-center gap-1 text-[11px] font-medium text-[var(--color-brand-strong)]">
                                                <Move className="h-3 w-3" />
                                                <span>Drop &ldquo;{draggedCategory?.name}&rdquo; here</span>
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}

                                      {filteredCustom.map((custom) => {
                                        const customPath = `${dept.name} > ${catDisplayName} > ${custom.label}`;
                                        const customTargetKey = `custom-leaf:${custom.id}`;
                                        const isDragOver = dragOverTargetKey === customTargetKey;
                                        const mappedCategories = getMappedCategoriesForNode(dept.id, cat.id, custom.subCategory, customPath);
                                        const hasMapped = mappedCategories.length > 0;
                                        const isLeafMappedToTarget = selectedItemsPreview.length === 1 && selectedItemsPreview[0].assignedPersonaPath === customPath;

                                        return (
                                          <div
                                            key={custom.id}
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverTargetKey !== customTargetKey) setDragOverTargetKey(customTargetKey); }}
                                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && dragOverTargetKey === customTargetKey) setDragOverTargetKey(null); }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              setDragOverTargetKey(null);
                                              const droppedId = e.dataTransfer.getData("text/plain") || draggedCategoryId;
                                              if (droppedId) handleDropOnTaxonomy(droppedId, dept.id, cat.id, custom.subCategory, customPath);
                                              setDraggedCategoryId(null);
                                            }}
                                            onClick={() => handleAssignTaxonomy(dept.id, cat.id, custom.subCategory, customPath)}
                                            className={cn(
                                              "flex select-none flex-col gap-1.5 rounded-[var(--radius-xl)] border p-2.5 text-xs transition-all cursor-pointer",
                                              isDragOver
                                                ? "scale-[1.01] border-[var(--color-brand)] bg-[var(--color-brand)]/20 ring-2 ring-[var(--color-brand)]/40"
                                                : hasMapped
                                                ? "border-[var(--color-success-border)] bg-[var(--color-success-light)]/40"
                                                : isLeafMappedToTarget
                                                ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] font-semibold text-[var(--color-brand-strong)]"
                                                : draggedCategoryId !== null
                                                ? "border-dashed border-[var(--color-brand)]/40 bg-[var(--color-brand-light)]/20"
                                                : "border-[var(--color-border)] bg-[var(--color-surface-sticky)] text-[var(--color-text-secondary)] hover:border-[var(--color-warning-border)] hover:bg-[var(--color-warning-light)]/40"
                                            )}
                                          >
                                            <div className="flex min-w-0 items-center justify-between gap-2">
                                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <span className={cn("h-2 w-2 shrink-0 rounded-full", hasMapped ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]")} />
                                                <div className="flex min-w-0 items-center gap-2">
                                                  <span className="truncate font-bold text-[var(--color-text-primary)]">{custom.label}</span>
                                                  <span className="shrink-0 rounded border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-1.5 py-0.2 text-[9px] font-bold text-[var(--color-warning)]">Custom</span>
                                                  {hasMapped && (
                                                    <span className="inline-flex items-center gap-1 rounded bg-[var(--color-success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                      <Check className="h-2.5 w-2.5" />
                                                      {mappedCategories.length === 1 ? "Mapped" : `${mappedCategories.length} Mapped`}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <span className="shrink-0 font-mono text-[11px] italic text-[var(--color-text-muted)]">Custom Item</span>
                                            </div>
                                            <div className="truncate pl-4 font-mono text-[10px] text-[var(--color-text-muted)]">Path: {customPath}</div>

                                            {isDragOver ? (
                                              <div className="ml-4 flex animate-pulse items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-brand)] bg-[var(--color-brand)]/25 p-1.5 text-[11px] font-bold text-[var(--color-brand-strong)]">
                                                <span className="flex min-w-0 items-center gap-1.5 truncate">
                                                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                                  <span className="truncate">Drop to map &ldquo;{draggedCategory?.name}&rdquo;{hasMapped ? ` (${mappedCategories.length} already mapped)` : ""}</span>
                                                </span>
                                              </div>
                                            ) : hasMapped ? (
                                              <div className="ml-4 space-y-1.5">
                                                {mappedCategories.map((mc) => (
                                                  <div
                                                    key={mc.id}
                                                    onClick={(e) => { e.stopPropagation(); locateAndHighlightCategory(mc.id); }}
                                                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-surface-sticky)] p-1.5"
                                                  >
                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                                                      <span className="truncate text-xs font-bold text-[var(--color-text-primary)]">&ldquo;{mc.name}&rdquo;</span>
                                                      <span className="shrink-0 rounded bg-[var(--color-success-light)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--color-success)]">{mc.productCount} SKUs</span>
                                                    </div>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleUnmapSingleCategory(mc.id, mc.name, e); }} className="shrink-0 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]">
                                                      <X className="h-3.5 w-3.5" />
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : draggedCategoryId !== null ? (
                                              <div className="ml-4 flex items-center gap-1 text-[11px] font-medium text-[var(--color-brand-strong)]">
                                                <Move className="h-3 w-3" />
                                                <span>Drop &ldquo;{draggedCategory?.name}&rdquo; here</span>
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

                            {scopeState.customCategories.filter((cc) => cc.deptId === dept.id).map((customCat) => {
                              const customCatLeaves = scopeState.customLeaves.filter((cl) => cl.deptId === dept.id && cl.catId === customCat.id);
                              return (
                                <div key={customCat.id} className="space-y-2 border-l-2 border-[var(--color-warning)]/50 py-1 pl-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-primary)]">
                                      <Tag className="h-3.5 w-3.5 text-[var(--color-warning)]" />
                                      <span>{customCat.name}</span>
                                      <span className="rounded border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-1.5 py-0.2 text-[9px] font-bold text-[var(--color-warning)]">Custom Category</span>
                                    </div>
                                    <span className="text-[11px] font-medium text-[var(--color-text-muted)]">{customCatLeaves.length} items</span>
                                  </div>
                                  <div className="space-y-1.5 pl-6 pt-1">
                                    {customCatLeaves.map((cl) => {
                                      const customFullPath = `${dept.name} > ${customCat.name} > ${cl.label}`;
                                      const customLeafKey = `custom-cat-leaf:${cl.id}`;
                                      const isDragOver = dragOverTargetKey === customLeafKey;
                                      const mappedCategories = getMappedCategoriesForNode(dept.id, customCat.id, cl.subCategory, customFullPath);
                                      const hasMapped = mappedCategories.length > 0;
                                      return (
                                        <div
                                          key={cl.id}
                                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverTargetKey !== customLeafKey) setDragOverTargetKey(customLeafKey); }}
                                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && dragOverTargetKey === customLeafKey) setDragOverTargetKey(null); }}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            setDragOverTargetKey(null);
                                            const droppedId = e.dataTransfer.getData("text/plain") || draggedCategoryId;
                                            if (droppedId) handleDropOnTaxonomy(droppedId, dept.id, customCat.id, cl.subCategory, customFullPath);
                                            setDraggedCategoryId(null);
                                          }}
                                          onClick={() => handleAssignTaxonomy(dept.id, customCat.id, cl.subCategory, customFullPath)}
                                          className={cn(
                                            "flex select-none flex-col gap-1.5 rounded-[var(--radius-xl)] border p-2.5 text-xs transition-all cursor-pointer",
                                            isDragOver
                                              ? "scale-[1.01] border-[var(--color-brand)] bg-[var(--color-brand)]/20 ring-2 ring-[var(--color-brand)]/40"
                                              : hasMapped
                                              ? "border-[var(--color-success-border)] bg-[var(--color-success-light)]/40"
                                              : "border-[var(--color-border)] bg-[var(--color-surface-sticky)] text-[var(--color-text-secondary)]"
                                          )}
                                        >
                                          <div className="flex min-w-0 items-center justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <span className={cn("h-2 w-2 shrink-0 rounded-full", hasMapped ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]")} />
                                              <span className="truncate font-bold text-[var(--color-text-primary)]">{cl.label}</span>
                                              {hasMapped && (
                                                <span className="inline-flex items-center gap-1 rounded bg-[var(--color-success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                  <Check className="h-2.5 w-2.5" />
                                                  {mappedCategories.length === 1 ? "Mapped" : `${mappedCategories.length} Mapped`}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="truncate pl-4 font-mono text-[10px] text-[var(--color-text-muted)]">Path: {customFullPath}</div>
                                          {hasMapped && (
                                            <div className="ml-4 space-y-1.5">
                                              {mappedCategories.map((mc) => (
                                                <div key={mc.id} onClick={(e) => { e.stopPropagation(); locateAndHighlightCategory(mc.id); }} className="flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-surface-sticky)] p-1.5">
                                                  <span className="truncate text-xs font-bold text-[var(--color-text-primary)]">&ldquo;{mc.name}&rdquo;</span>
                                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleUnmapSingleCategory(mc.id, mc.name, e); }} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]">
                                                    <X className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
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

                {taxonomySearch.trim() && matchingGlobalPaths.length === 0 && (
                  <div className="space-y-2 rounded-[var(--radius-2xl)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-sticky)] p-8 text-center">
                    <p className="text-xs font-semibold text-[var(--color-text-secondary)]">No taxonomy paths found matching &ldquo;{taxonomySearch}&rdquo;</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">Try searching for keywords like &ldquo;hoodie&rdquo;, &ldquo;dress&rdquo;, &ldquo;jean&rdquo;, &ldquo;sneaker&rdquo;, or &ldquo;coat&rdquo;</p>
                    <button type="button" onClick={() => setTaxonomySearch("")} className="mt-2 text-xs font-bold text-[var(--color-brand-strong)] hover:underline">
                      Clear search query
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isScopeModalOpen && (
        <CatalogScopeModal
          isOpen
          onClose={() => setIsScopeModalOpen(false)}
          scopeState={scopeState}
          onSaveScope={handleSaveScope}
        />
      )}

      {previewCategory && (
        <CategoryItemsPreviewModal
          key={previewCategory.id}
          category={previewCategory}
          onClose={() => setPreviewCategory(null)}
          onSelectForMapping={(cat) => {
            setSelectedIds(new Set([cat.id]));
            showFeedback(`Targeted "${cat.name}" for taxonomy mapping`, "info");
          }}
        />
      )}
    </div>
  );
}
