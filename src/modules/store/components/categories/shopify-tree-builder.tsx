"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FolderPlus,
  FolderTree,
  GripVertical,
  Loader2,
  MinusSquare,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import type {
  MerchantTreeLeaf,
  MerchantTreeNode,
  MerchantTreeSubGroup,
  StoreCategory,
} from "@/modules/store/types";
import type { CategoryPreviewTarget } from "../category-preview-modal";

export interface ShopifyTreeBuilderProps {
  /** The flat collections pulled from the store, already carrying `handle` and `collectionType`. */
  collections: readonly StoreCategory[];
  tree: readonly MerchantTreeNode[];
  onTreeChange: (tree: MerchantTreeNode[]) => void;
  /** Ids of `MerchantTreeLeaf` nodes currently in scope. */
  selectedLeafIds: ReadonlySet<string>;
  onSelectedLeafIdsChange: (ids: Set<string>) => void;
  /** Opens the shared live-products modal, owned by the parent. */
  onPreview: (target: CategoryPreviewTarget) => void;
}

type CheckState = "checked" | "indeterminate" | "unchecked";

type BankTab = "all" | "unassigned" | "in-tree";

/** A leaf the merchant typed rather than dragged. The type requires a collection id, so the empty
 *  string is what "nothing behind this" looks like — and since indexing walks collection ids, such
 *  a leaf is deliberately kept out of the scope selection instead of silently scoping zero
 *  products. */
const NO_COLLECTION = "";

/** Shopify has no field marking a collection as merchandising rather than taxonomy, so the title
 *  is all there is to go on. Purely a hint on the card — it never changes what is stored, what can
 *  be dragged, or what ends up in scope. */
const PROMO_TITLE =
  /\b(?:sale|clearance|best[\s-]?sellers?|trending|new[\s-]?arrivals?|featured|staff[\s-]?picks?|gifts?|under\s*\$)/i;

/** Word groups the local classifier recognises. Order matters: the first rule that matches a
 *  title wins, so "Women" has to be tried before "Men". */
const AUDIENCE_RULES: readonly { key: string; pattern: RegExp }[] = [
  { key: "Women", pattern: /\b(?:women|womens|ladies|female)\b/i },
  { key: "Men", pattern: /\b(?:men|mens|male)\b/i },
  { key: "Kids", pattern: /\b(?:kids?|child|children|childrens|boys?|girls?|junior|youth|baby|toddler)\b/i },
  { key: "Unisex", pattern: /\b(?:unisex|all[\s-]?gender)\b/i },
];

const GARMENT_RULES: readonly { key: string; pattern: RegExp }[] = [
  { key: "Dresses", pattern: /\b(?:dress|dresses|gowns?)\b/i },
  {
    key: "Tops",
    pattern: /\b(?:tops?|t[\s-]?shirts?|tees?|shirts?|blouses?|sweaters?|knitwear|hoodies?|sweatshirts?)\b/i,
  },
  { key: "Bottoms", pattern: /\b(?:bottoms?|pants?|trousers?|jeans|denim|shorts?|skirts?|leggings)\b/i },
  { key: "Outerwear", pattern: /\b(?:outerwear|jackets?|coats?|parkas?|blazers?|puffers?)\b/i },
  { key: "Footwear", pattern: /\b(?:footwear|shoes?|sneakers?|trainers?|boots?|sandals?|heels?|loafers?)\b/i },
];

const FILLER_WORDS = /\b(?:collection|collections|shop|all|the|and|our|store|apparel|clothing|wear)\b/gi;

function isPromoTitle(title: string): boolean {
  return PROMO_TITLE.test(title);
}

function matchRule(rules: readonly { key: string; pattern: RegExp }[], title: string) {
  return rules.find((rule) => rule.pattern.test(title));
}

/** What is left of a title once the words that already placed it in the tree are removed. Empty
 *  means the collection says nothing more than its own position — "Women's Dresses" under
 *  `Women > Dresses` — so it can stand as that node rather than hang beneath it. */
function residualOf(title: string, matched: readonly RegExp[]): string {
  let rest = title;
  for (const pattern of matched) {
    rest = rest.replace(new RegExp(pattern.source, "gi"), " ");
  }
  return rest
    .replace(FILLER_WORDS, " ")
    .replace(/[^a-z]+/gi, " ")
    .trim();
}

function hasCollection(leaf: MerchantTreeLeaf): boolean {
  return leaf.collectionId !== NO_COLLECTION;
}

function subGroupLeafIds(subGroup: MerchantTreeSubGroup): string[] {
  return subGroup.leafs.filter(hasCollection).map((leaf) => leaf.id);
}

function departmentLeafIds(department: MerchantTreeNode): string[] {
  return department.subGroups.flatMap(subGroupLeafIds);
}

function checkStateOf(leafIds: readonly string[], selected: ReadonlySet<string>): CheckState {
  if (leafIds.length === 0) return "unchecked";
  const count = leafIds.filter((id) => selected.has(id)).length;
  if (count === 0) return "unchecked";
  return count === leafIds.length ? "checked" : "indeterminate";
}

/**
 * Stands in for a real classifier: a deterministic pass over the collection titles it is given that
 * puts audience words at the top, garment words under them, and everything else at the leaves.
 * Replace the body wholesale once there is a backend for this — nothing outside it assumes how the
 * grouping was reached.
 *
 * Classifies exactly what it is handed and produces a free-standing tree. Deciding which
 * collections are still unplaced, and how the result joins what is already on the canvas, is the
 * caller's job.
 */
function autoClassify(collections: readonly StoreCategory[]): {
  tree: MerchantTreeNode[];
  selectedLeafIds: Set<string>;
} {
  const ordered: MerchantTreeNode[] = [];
  const departments = new Map<string, MerchantTreeNode>();
  const subGroups = new Map<string, MerchantTreeSubGroup>();
  const claimed = new Set<string>();
  const selectedLeafIds = new Set<string>();

  function departmentFor(key: string): MerchantTreeNode {
    const existing = departments.get(key);
    if (existing) return existing;
    const created: MerchantTreeNode = {
      id: crypto.randomUUID(),
      name: key,
      collectionId: null,
      subGroups: [],
    };
    departments.set(key, created);
    ordered.push(created);
    return created;
  }

  function subGroupFor(department: MerchantTreeNode, deptKey: string, groupKey: string): MerchantTreeSubGroup {
    const mapKey = `${deptKey}::${groupKey}`;
    const existing = subGroups.get(mapKey);
    if (existing) return existing;
    const created: MerchantTreeSubGroup = {
      id: crypto.randomUUID(),
      name: groupKey,
      collectionId: null,
      leafs: [],
    };
    subGroups.set(mapKey, created);
    department.subGroups.push(created);
    return created;
  }

  const candidates = collections.filter((collection) => !isPromoTitle(collection.name));

  for (const collection of candidates) {
    const audience = matchRule(AUDIENCE_RULES, collection.name);
    if (!audience || matchRule(GARMENT_RULES, collection.name)) continue;
    if (residualOf(collection.name, [audience.pattern]) !== "") continue;
    const department = departmentFor(audience.key);
    if (department.collectionId === null) {
      department.collectionId = collection.id;
      department.name = collection.name;
      claimed.add(collection.id);
    }
  }

  for (const collection of candidates) {
    if (claimed.has(collection.id)) continue;
    const audience = matchRule(AUDIENCE_RULES, collection.name);
    const garment = matchRule(GARMENT_RULES, collection.name);
    const deptKey = audience?.key ?? "All Products";
    const department = departmentFor(deptKey);
    const subGroup = subGroupFor(department, deptKey, garment?.key ?? "Other");

    const matched = [audience?.pattern, garment?.pattern].filter((p): p is RegExp => p !== undefined);
    if (garment && subGroup.collectionId === null && residualOf(collection.name, matched) === "") {
      subGroup.collectionId = collection.id;
      subGroup.name = collection.name;
      continue;
    }

    const leaf: MerchantTreeLeaf = {
      id: crypto.randomUUID(),
      name: collection.name,
      collectionId: collection.id,
      productCount: collection.productCount,
    };
    subGroup.leafs.push(leaf);
    selectedLeafIds.add(leaf.id);
  }

  return { tree: ordered, selectedLeafIds };
}

/**
 * Builds the same shape `autoClassify` returns, from placements decided elsewhere.
 *
 * The model is asked for a department and sub-group name per collection and never sees node ids, so
 * this is where its answer becomes a tree. Collections it declined to place are simply absent from
 * `placements` and stay in the bank — which is where a promotion like "Summer Sale" belongs.
 */
function treeFromPlacements(
  collections: readonly StoreCategory[],
  placements: ReadonlyMap<string, { department: string; subGroup: string }>
): { tree: MerchantTreeNode[]; selectedLeafIds: Set<string> } {
  const ordered: MerchantTreeNode[] = [];
  const departments = new Map<string, MerchantTreeNode>();
  const subGroups = new Map<string, MerchantTreeSubGroup>();
  const selectedLeafIds = new Set<string>();

  for (const collection of collections) {
    const placement = placements.get(collection.id);
    if (!placement) continue;

    // Keyed case-insensitively so "Womens" and "womens" cannot stand up two departments, while the
    // first spelling seen is the one displayed.
    const deptKey = placement.department.toLowerCase();
    let department = departments.get(deptKey);
    if (!department) {
      department = { id: crypto.randomUUID(), name: placement.department, collectionId: null, subGroups: [] };
      departments.set(deptKey, department);
      ordered.push(department);
    }

    const subKey = `${deptKey}::${placement.subGroup.toLowerCase()}`;
    let subGroup = subGroups.get(subKey);
    if (!subGroup) {
      subGroup = { id: crypto.randomUUID(), name: placement.subGroup, collectionId: null, leafs: [] };
      subGroups.set(subKey, subGroup);
      department.subGroups.push(subGroup);
    }

    const leaf: MerchantTreeLeaf = {
      id: crypto.randomUUID(),
      name: collection.name,
      collectionId: collection.id,
      productCount: collection.productCount,
    };
    subGroup.leafs.push(leaf);
    selectedLeafIds.add(leaf.id);
  }

  return { tree: ordered, selectedLeafIds };
}

/**
 * Folds newly classified departments into the ones already on the canvas, matching on name so a
 * second pass adds to the merchant's `Women` rather than standing a second one beside it.
 */
function mergeTrees(
  existing: readonly MerchantTreeNode[],
  incoming: readonly MerchantTreeNode[]
): MerchantTreeNode[] {
  const merged = existing.map((department) => ({
    ...department,
    subGroups: department.subGroups.map((subGroup) => ({ ...subGroup, leafs: [...subGroup.leafs] })),
  }));
  const departmentsByName = new Map(merged.map((department) => [department.name.toLowerCase(), department]));

  for (const department of incoming) {
    const host = departmentsByName.get(department.name.toLowerCase());
    if (!host) {
      merged.push(department);
      departmentsByName.set(department.name.toLowerCase(), department);
      continue;
    }

    const subGroupsByName = new Map(host.subGroups.map((subGroup) => [subGroup.name.toLowerCase(), subGroup]));
    for (const subGroup of department.subGroups) {
      const hostSubGroup = subGroupsByName.get(subGroup.name.toLowerCase());
      if (!hostSubGroup) {
        host.subGroups.push(subGroup);
        subGroupsByName.set(subGroup.name.toLowerCase(), subGroup);
        continue;
      }
      hostSubGroup.leafs.push(...subGroup.leafs);
    }
  }

  return merged;
}

/** Everything a node row needs to change the tree. Bundled rather than drilled one by one: the
 *  canvas is three levels deep and every level forwards the whole set unchanged. */
interface BuilderActions {
  toggleLeaves: (leafIds: readonly string[], select: boolean) => void;
  rename: (nodeId: string, name: string) => void;
  removeDepartment: (deptId: string) => void;
  removeSubGroup: (deptId: string, subId: string) => void;
  removeLeaf: (deptId: string, subId: string, leafId: string) => void;
  addSubGroup: (deptId: string, name: string) => void;
  addLeaf: (deptId: string, subId: string, name: string) => void;
  dropOnDepartment: (deptId: string, event: React.DragEvent) => void;
  dropOnSubGroup: (deptId: string, subId: string, event: React.DragEvent) => void;
  preview: (target: CategoryPreviewTarget) => void;
}

interface BuilderView {
  selected: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (id: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  activeDropZone: string | null;
  setActiveDropZone: (zone: string | null) => void;
  /** Title of the collection under the cursor, so drop targets can name it while hovering. */
  draggedTitle: string | null;
  addingSubFor: string | null;
  setAddingSubFor: (id: string | null) => void;
  addingLeafFor: string | null;
  setAddingLeafFor: (id: string | null) => void;
  productCountOf: (collectionId: string | null) => number;
}

/**
 * Step 1 of the Categories tab on Shopify: the merchant assembles Department > Subcategory > Leaf
 * out of a flat bag of collections, either by dragging cards from the bank or by mapping them
 * point-and-click.
 *
 * The same collection may legitimately sit under two departments — the tree is scope and
 * presentation, and indexing walks collection ids at the leaves — so nothing here dedupes on drop.
 * Scope lives in `selectedLeafIds` and only ever holds leaf ids, which is why deleting a branch has
 * to prune its descendants out of the selection in the same update.
 */
export function ShopifyTreeBuilder({
  collections,
  tree,
  onTreeChange,
  selectedLeafIds,
  onSelectedLeafIdsChange,
  onPreview,
}: ShopifyTreeBuilderProps): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [bankTab, setBankTab] = React.useState<BankTab>("all");
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [activeDropZone, setActiveDropZone] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [isAddingDepartment, setIsAddingDepartment] = React.useState(false);
  const [addingSubFor, setAddingSubFor] = React.useState<string | null>(null);
  const [addingLeafFor, setAddingLeafFor] = React.useState<string | null>(null);
  const [quickMapTarget, setQuickMapTarget] = React.useState<StoreCategory | null>(null);
  const [classifying, setClassifying] = React.useState(false);

  const collectionById = React.useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections]
  );

  const assignedIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const department of tree) {
      if (department.collectionId) ids.add(department.collectionId);
      for (const subGroup of department.subGroups) {
        if (subGroup.collectionId) ids.add(subGroup.collectionId);
        for (const leaf of subGroup.leafs) {
          if (hasCollection(leaf)) ids.add(leaf.collectionId);
        }
      }
    }
    return ids;
  }, [tree]);

  const allLeaves = React.useMemo(
    () => tree.flatMap((department) => department.subGroups.flatMap((subGroup) => subGroup.leafs)),
    [tree]
  );
  const scopableLeafIds = React.useMemo(
    () => allLeaves.filter(hasCollection).map((leaf) => leaf.id),
    [allLeaves]
  );
  const selectedCount = scopableLeafIds.filter((id) => selectedLeafIds.has(id)).length;
  const unassignedCount = collections.filter((collection) => !assignedIds.has(collection.id)).length;

  const visibleCollections = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collections.filter((collection) => {
      if (
        needle &&
        !collection.name.toLowerCase().includes(needle) &&
        !(collection.handle ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }
      const isAssigned = assignedIds.has(collection.id);
      if (bankTab === "unassigned" && isAssigned) return false;
      if (bankTab === "in-tree" && !isAssigned) return false;
      return true;
    });
  }, [collections, query, bankTab, assignedIds]);

  function updateSelection(mutate: (next: Set<string>) => void) {
    const next = new Set(selectedLeafIds);
    mutate(next);
    onSelectedLeafIdsChange(next);
  }

  function toggleLeaves(leafIds: readonly string[], select: boolean) {
    updateSelection((next) => {
      for (const id of leafIds) {
        if (select) next.add(id);
        else next.delete(id);
      }
    });
  }

  function clearDrag() {
    setDraggedId(null);
    setActiveDropZone(null);
  }

  /** The dragged id is tracked in state for the hover copy; `dataTransfer` is the authority on
   *  drop, since a drag can outlive a re-render that clears the state. */
  function droppedCollection(event: React.DragEvent): StoreCategory | null {
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    return id ? collectionById.get(id) ?? null : null;
  }

  function mapDepartments(deptId: string, map: (department: MerchantTreeNode) => MerchantTreeNode) {
    onTreeChange(tree.map((department) => (department.id === deptId ? map(department) : department)));
  }

  function dropOnCanvas(event: React.DragEvent) {
    event.preventDefault();
    const collection = droppedCollection(event);
    clearDrag();
    if (!collection) return;
    onTreeChange([
      ...tree,
      {
        id: crypto.randomUUID(),
        name: collection.name,
        collectionId: collection.id,
        subGroups: [],
      },
    ]);
  }

  function dropOnDepartment(deptId: string, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const collection = droppedCollection(event);
    clearDrag();
    if (!collection) return;
    mapDepartments(deptId, (department) => ({
      ...department,
      subGroups: [
        ...department.subGroups,
        {
          id: crypto.randomUUID(),
          name: collection.name,
          collectionId: collection.id,
          leafs: [],
        },
      ],
    }));
  }

  function dropOnSubGroup(deptId: string, subId: string, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const collection = droppedCollection(event);
    clearDrag();
    if (!collection) return;
    const leaf: MerchantTreeLeaf = {
      id: crypto.randomUUID(),
      name: collection.name,
      collectionId: collection.id,
      productCount: collection.productCount,
    };
    mapDepartments(deptId, (department) => ({
      ...department,
      subGroups: department.subGroups.map((subGroup) =>
        subGroup.id === subId ? { ...subGroup, leafs: [...subGroup.leafs, leaf] } : subGroup
      ),
    }));
    updateSelection((next) => next.add(leaf.id));
  }

  function addDepartment(name: string) {
    onTreeChange([
      ...tree,
      { id: crypto.randomUUID(), name, collectionId: null, subGroups: [] },
    ]);
    setIsAddingDepartment(false);
  }

  function addSubGroup(deptId: string, name: string) {
    mapDepartments(deptId, (department) => ({
      ...department,
      subGroups: [
        ...department.subGroups,
        { id: crypto.randomUUID(), name, collectionId: null, leafs: [] },
      ],
    }));
    setAddingSubFor(null);
  }

  function addLeaf(deptId: string, subId: string, name: string) {
    mapDepartments(deptId, (department) => ({
      ...department,
      subGroups: department.subGroups.map((subGroup) =>
        subGroup.id === subId
          ? {
              ...subGroup,
              leafs: [
                ...subGroup.leafs,
                { id: crypto.randomUUID(), name, collectionId: NO_COLLECTION, productCount: 0 },
              ],
            }
          : subGroup
      ),
    }));
    setAddingLeafFor(null);
  }

  function rename(nodeId: string, name: string) {
    onTreeChange(
      tree.map((department) => {
        if (department.id === nodeId) return { ...department, name };
        return {
          ...department,
          subGroups: department.subGroups.map((subGroup) => {
            if (subGroup.id === nodeId) return { ...subGroup, name };
            return {
              ...subGroup,
              leafs: subGroup.leafs.map((leaf) => (leaf.id === nodeId ? { ...leaf, name } : leaf)),
            };
          }),
        };
      })
    );
    setEditingId(null);
  }

  function removeDepartment(deptId: string) {
    const department = tree.find((node) => node.id === deptId);
    onTreeChange(tree.filter((node) => node.id !== deptId));
    if (department) {
      const orphaned = departmentLeafIds(department);
      updateSelection((next) => {
        for (const id of orphaned) next.delete(id);
      });
    }
  }

  function removeSubGroup(deptId: string, subId: string) {
    const subGroup = tree
      .find((node) => node.id === deptId)
      ?.subGroups.find((node) => node.id === subId);
    mapDepartments(deptId, (department) => ({
      ...department,
      subGroups: department.subGroups.filter((node) => node.id !== subId),
    }));
    if (subGroup) {
      const orphaned = subGroupLeafIds(subGroup);
      updateSelection((next) => {
        for (const id of orphaned) next.delete(id);
      });
    }
  }

  function removeLeaf(deptId: string, subId: string, leafId: string) {
    mapDepartments(deptId, (department) => ({
      ...department,
      subGroups: department.subGroups.map((subGroup) =>
        subGroup.id === subId
          ? { ...subGroup, leafs: subGroup.leafs.filter((leaf) => leaf.id !== leafId) }
          : subGroup
      ),
    }));
    updateSelection((next) => next.delete(leafId));
  }

  /** Classifies only what is still sitting in the bank, and folds the result into what the merchant
   *  has already built. "Classify the rest for me", never "start again" — someone who has spent ten
   *  minutes arranging three departments should not lose them to a button they pressed once.
   *
   *  Asks the model first and falls back to the local word rules if it cannot be reached, so an
   *  outage costs accuracy on unusual titles rather than the whole button. */
  async function runAutoClassify() {
    const unplaced = collections.filter((collection) => !assignedIds.has(collection.id));
    if (unplaced.length === 0) return;

    setClassifying(true);
    try {
      const res = await fetch("/api/store-connection/categories/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionIds: unplaced.map((collection) => collection.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not group these collections");

      const placements = new Map<string, { department: string; subGroup: string }>(
        (data.placements ?? []).map((placement: { id: string; department: string; subGroup: string }) => [
          placement.id,
          { department: placement.department, subGroup: placement.subGroup },
        ])
      );
      applyClassified(treeFromPlacements(unplaced, placements));
    } catch {
      applyClassified(autoClassify(unplaced));
    } finally {
      setClassifying(false);
    }
  }

  function applyClassified(result: { tree: MerchantTreeNode[]; selectedLeafIds: Set<string> }) {
    onTreeChange(mergeTrees(tree, result.tree));
    onSelectedLeafIdsChange(new Set([...selectedLeafIds, ...result.selectedLeafIds]));
  }

  function clearTree() {
    onTreeChange([]);
    onSelectedLeafIdsChange(new Set());
  }

  function quickMap(
    collection: StoreCategory,
    target: { kind: "department" } | { kind: "sub"; deptId: string } | { kind: "leaf"; deptId: string; subId: string }
  ) {
    if (target.kind === "department") {
      onTreeChange([
        ...tree,
        { id: crypto.randomUUID(), name: collection.name, collectionId: collection.id, subGroups: [] },
      ]);
    } else if (target.kind === "sub") {
      mapDepartments(target.deptId, (department) => ({
        ...department,
        subGroups: [
          ...department.subGroups,
          { id: crypto.randomUUID(), name: collection.name, collectionId: collection.id, leafs: [] },
        ],
      }));
    } else {
      const leaf: MerchantTreeLeaf = {
        id: crypto.randomUUID(),
        name: collection.name,
        collectionId: collection.id,
        productCount: collection.productCount,
      };
      mapDepartments(target.deptId, (department) => ({
        ...department,
        subGroups: department.subGroups.map((subGroup) =>
          subGroup.id === target.subId ? { ...subGroup, leafs: [...subGroup.leafs, leaf] } : subGroup
        ),
      }));
      updateSelection((next) => next.add(leaf.id));
    }
    setQuickMapTarget(null);
  }

  const actions: BuilderActions = {
    toggleLeaves,
    rename,
    removeDepartment,
    removeSubGroup,
    removeLeaf,
    addSubGroup,
    addLeaf,
    dropOnDepartment,
    dropOnSubGroup,
    preview: onPreview,
  };

  const view: BuilderView = {
    selected: selectedLeafIds,
    collapsed,
    toggleCollapsed: (id) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    editingId,
    setEditingId,
    activeDropZone,
    setActiveDropZone,
    draggedTitle: draggedId ? collectionById.get(draggedId)?.name ?? null : null,
    addingSubFor,
    setAddingSubFor,
    addingLeafFor,
    setAddingLeafFor,
    productCountOf: (collectionId) =>
      collectionId ? collectionById.get(collectionId)?.productCount ?? 0 : 0,
  };

  const isCanvasActive = activeDropZone === "canvas" && draggedId !== null;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
      {/* Collections bank. */}
      <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-3.5 shadow-[var(--shadow-elevated)] backdrop-blur-xl lg:sticky lg:top-20 lg:col-span-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--color-brand)]" />
            <span className="text-xs font-bold text-[var(--color-text-primary)]">
              Collections Bank ({collections.length})
            </span>
          </div>
          {unassignedCount > 0 ? (
            <span className="rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
              {unassignedCount} Unassigned
            </span>
          ) : (
            <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">
              All Mapped
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface-base)] p-0.5 text-[11px] font-semibold">
            <BankTabButton active={bankTab === "all"} onClick={() => setBankTab("all")}>
              All ({collections.length})
            </BankTabButton>
            <BankTabButton active={bankTab === "unassigned"} onClick={() => setBankTab("unassigned")}>
              Unassigned ({unassignedCount})
            </BankTabButton>
            <BankTabButton active={bankTab === "in-tree"} onClick={() => setBankTab("in-tree")}>
              In Tree ({assignedIds.size})
            </BankTabButton>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search collections…"
              className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-8 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear collection search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {visibleCollections.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-base)] py-6 text-center text-xs italic text-[var(--color-text-muted)]">
              No collections match your filter
            </p>
          ) : (
            visibleCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                isAssigned={assignedIds.has(collection.id)}
                isDragging={draggedId === collection.id}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", collection.id);
                  event.dataTransfer.effectAllowed = "copy";
                  setDraggedId(collection.id);
                }}
                onDragEnd={clearDrag}
                onPreview={onPreview}
                onQuickMap={() => setQuickMapTarget(collection)}
              />
            ))
          )}
        </div>
      </div>

      {/* Hierarchy canvas. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (activeDropZone !== "canvas") setActiveDropZone("canvas");
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setActiveDropZone(null);
        }}
        onDrop={dropOnCanvas}
        className={cn(
          "min-h-[450px] space-y-3 rounded-[var(--radius-2xl)] p-1 transition-all lg:col-span-8",
          isCanvasActive && "bg-[var(--color-brand-light)] ring-2 ring-[var(--color-brand)]/50"
        )}
      >
        <div className="flex flex-col items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-3 shadow-[var(--shadow-card)] backdrop-blur-xl sm:flex-row">
          <div className="flex flex-wrap items-center gap-2">
            <FolderTree className="h-4 w-4 text-[var(--color-brand)]" />
            <span className="text-xs font-bold text-[var(--color-text-primary)]">Hierarchy Tree:</span>
            <span className="rounded-[var(--radius-md)] bg-[var(--color-brand-light)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand)]">
              {tree.length} Categories &bull; {selectedCount} of {allLeaves.length} Leaves Selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <QuickButton
              emphasis={isAddingDepartment}
              onClick={() => setIsAddingDepartment(!isAddingDepartment)}
              title="Manually create a new top-level category"
            >
              <PlusCircle className="h-3.5 w-3.5" /> + New Category
            </QuickButton>
            <Button
              size="sm"
              onClick={runAutoClassify}
              disabled={unassignedCount === 0 || classifying}
              title="Group the collections still in the bank into categories, subcategories and leaves"
            >
              {classifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {classifying ? "Classifying…" : "AI Auto-Classify"}
            </Button>
            {tree.length > 0 && (
              <>
                <QuickButton onClick={() => toggleLeaves(scopableLeafIds, true)}>Select All</QuickButton>
                <QuickButton onClick={() => toggleLeaves(scopableLeafIds, false)}>Deselect All</QuickButton>
                <QuickButton danger onClick={clearTree}>
                  <Trash2 className="h-3 w-3" /> Clear
                </QuickButton>
              </>
            )}
          </div>
        </div>

        {isAddingDepartment && (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-2xl)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-3 shadow-[var(--shadow-card)] sm:flex-row">
            <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-[var(--color-brand)]">
              <FolderPlus className="h-4 w-4" />
              <span>Create Custom Category:</span>
            </div>
            <InlineNameForm
              placeholder="e.g., Men, Women, Kids, Accessories, Footwear…"
              submitLabel="+ Create Category"
              onSubmit={addDepartment}
              onCancel={() => setIsAddingDepartment(false)}
            />
          </div>
        )}

        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
          {tree.length === 0 ? (
            <div
              className={cn(
                "m-4 flex flex-col items-center justify-center space-y-3 rounded-[var(--radius-2xl)] border-2 border-dashed p-10 text-center transition-all",
                activeDropZone === "canvas"
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-base)]"
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-2xl)] bg-[var(--color-brand-light)] text-[var(--color-brand)]">
                <FolderTree className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--color-text-primary)]">
                  Hierarchy Canvas is Ready
                </p>
                <p className="mt-0.5 max-w-sm text-xs text-[var(--color-text-muted)]">
                  Build your custom category hierarchy by dragging collections or adding manually
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <QuickButton emphasis onClick={() => setIsAddingDepartment(true)}>
                  <PlusCircle className="h-3.5 w-3.5" /> + Add Custom Category
                </QuickButton>
                <Button size="sm" onClick={runAutoClassify} disabled={unassignedCount === 0 || classifying}>
                  {classifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {classifying ? "Classifying your collections…" : "AI Auto-Classify Store"}
                </Button>
              </div>
            </div>
          ) : (
            tree.map((department) => (
              <DepartmentBlock
                key={department.id}
                department={department}
                actions={actions}
                view={view}
              />
            ))
          )}

          {tree.length > 0 && (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "copy";
                setActiveDropZone("canvas-bottom");
              }}
              onDragLeave={(event) => {
                event.stopPropagation();
                setActiveDropZone(null);
              }}
              onDrop={(event) => {
                event.stopPropagation();
                dropOnCanvas(event);
              }}
              className={cn(
                "m-3 flex items-center justify-center gap-2 rounded-[var(--radius-xl)] border-2 border-dashed p-3.5 text-center transition-all",
                activeDropZone === "canvas-bottom"
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
              )}
            >
              <PlusCircle className="h-4 w-4" />
              <span className="text-xs font-semibold">
                {view.draggedTitle
                  ? `Drop "${view.draggedTitle}" here to create a new Category`
                  : "Drop any collection here to create a new Category (Level 1)"}
              </span>
            </div>
          )}
        </div>
      </div>

      <QuickMapModal
        collection={quickMapTarget}
        tree={tree}
        onClose={() => setQuickMapTarget(null)}
        onMap={quickMap}
      />
    </div>
  );
}

function BankTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[var(--radius-md)] py-1.5 text-center transition-all",
        active
          ? "bg-[var(--color-surface-card)] font-bold text-[var(--color-brand)] shadow-[var(--shadow-card)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

function QuickButton({
  children,
  emphasis,
  danger,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50",
        danger
          ? "border-[var(--color-error)]/30 text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
          : emphasis
            ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand)] hover:border-[var(--color-brand)]/50"
            : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

function CollectionCard({
  collection,
  isAssigned,
  isDragging,
  onDragStart,
  onDragEnd,
  onPreview,
  onQuickMap,
}: {
  collection: StoreCategory;
  isAssigned: boolean;
  isDragging: boolean;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onPreview: (target: CategoryPreviewTarget) => void;
  onQuickMap: () => void;
}) {
  const isPromo = isPromoTitle(collection.name);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab select-none rounded-[var(--radius-lg)] border p-2.5 text-xs transition-all active:cursor-grabbing",
        isDragging
          ? "scale-95 border-[var(--color-brand)] opacity-40"
          : isAssigned
            ? "border-[var(--color-border)] bg-[var(--color-surface-base)] opacity-70"
            : isPromo
              ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-card)] hover:border-[var(--color-border-strong)]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "shrink-0 rounded p-1",
              isAssigned
                ? "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]"
                : "bg-[var(--color-brand-light)] text-[var(--color-brand)]"
            )}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {isAssigned && <Check className="h-3 w-3 shrink-0 text-[var(--color-success)]" />}
              <span className="truncate text-xs font-bold text-[var(--color-text-primary)]">
                {collection.name}
              </span>
              {isPromo && (
                <span className="rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-1.5 text-[9px] font-bold text-[var(--color-warning)]">
                  Promo
                </span>
              )}
            </div>
            {collection.handle && (
              <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                {collection.handle}
              </span>
            )}
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <span className="font-mono">{collection.productCount.toLocaleString()} products</span>
              {collection.collectionType && (
                <span className="rounded border border-[var(--color-border)] px-1 text-[9px] font-semibold uppercase tracking-wide">
                  {collection.collectionType === "smart" ? "Smart" : "Manual"}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPreview({ categoryId: collection.id, categoryName: collection.name })}
            title={`Preview live products in "${collection.name}"`}
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand)]"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onQuickMap}
            title={`Map "${collection.name}" into the hierarchy`}
            className="flex items-center gap-1 rounded-md border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand)] transition-colors hover:border-[var(--color-brand)]/50"
          >
            <FolderPlus className="h-3 w-3" /> Map
          </button>
        </div>
      </div>
    </div>
  );
}

function DepartmentBlock({
  department,
  actions,
  view,
}: {
  department: MerchantTreeNode;
  actions: BuilderActions;
  view: BuilderView;
}) {
  const leafIds = departmentLeafIds(department);
  const state = checkStateOf(leafIds, view.selected);
  const selectedHere = leafIds.filter((id) => view.selected.has(id)).length;
  const isCollapsed = view.collapsed.has(department.id);
  const isDropActive = view.activeDropZone === `dept-${department.id}`;
  const productCount =
    department.subGroups.reduce(
      (total, subGroup) =>
        total +
        (subGroup.leafs.length > 0
          ? subGroup.leafs.reduce((sum, leaf) => sum + leaf.productCount, 0)
          : view.productCountOf(subGroup.collectionId)),
      0
    ) || view.productCountOf(department.collectionId);

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          view.setActiveDropZone(`dept-${department.id}`);
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          view.setActiveDropZone(null);
        }}
        onDrop={(event) => actions.dropOnDepartment(department.id, event)}
        className={cn(
          "flex select-none items-center justify-between gap-3 px-4 py-3 transition-all",
          isDropActive
            ? "bg-[var(--color-brand-light)] ring-2 ring-inset ring-[var(--color-brand)]/50"
            : "bg-[var(--color-surface-elevated)]"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={() => view.toggleCollapsed(department.id)}
            title={isCollapsed ? "Expand category" : "Collapse category"}
            className="shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => actions.toggleLeaves(leafIds, state !== "checked")}
            disabled={leafIds.length === 0}
            aria-label={`Select every leaf under ${department.name}`}
            className="group shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckboxIcon state={state} />
          </button>

          {view.editingId === department.id ? (
            <NameEditor
              initial={department.name}
              onCommit={(name) => actions.rename(department.id, name)}
              onCancel={() => view.setEditingId(null)}
            />
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-bold text-[var(--color-text-primary)]">
                {department.name}
              </span>
              <RenameButton onClick={() => view.setEditingId(department.id)} label="Rename category" />
              <span className="rounded border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2 text-[9px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
                Category
              </span>
              {isDropActive && view.draggedTitle && (
                <span className="rounded border border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-brand)]">
                  Release to add &ldquo;{view.draggedTitle}&rdquo; as Subcategory
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <QuickButton
            onClick={() =>
              view.setAddingSubFor(view.addingSubFor === department.id ? null : department.id)
            }
            title={`Add a subcategory under ${department.name}`}
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">+ Subcategory</span>
          </QuickButton>
          <PreviewButton
            collectionId={department.collectionId}
            name={department.name}
            onPreview={actions.preview}
          />
          <span className="hidden text-xs font-semibold text-[var(--color-text-muted)] sm:inline">
            {selectedHere} / {leafIds.length} Selected
          </span>
          <span className="rounded bg-[var(--color-surface-base)] px-2 py-0.5 font-mono text-xs text-[var(--color-text-muted)]">
            {productCount.toLocaleString()} products
          </span>
          <DeleteButton onClick={() => actions.removeDepartment(department.id)} label="Remove category" />
        </div>
      </div>

      {view.addingSubFor === department.id && (
        <div className="mx-4 my-2 flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-2.5">
          <span className="shrink-0 text-xs font-bold text-[var(--color-brand)]">
            New Subcategory in {department.name}:
          </span>
          <InlineNameForm
            placeholder="e.g., Tops, Bottoms, Outerwear, Dresses…"
            submitLabel="+ Add"
            onSubmit={(name) => actions.addSubGroup(department.id, name)}
            onCancel={() => view.setAddingSubFor(null)}
          />
        </div>
      )}

      {department.subGroups.length === 0 && (
        <div className="mx-6 my-2 flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-3 py-2 text-[11px] text-[var(--color-warning)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            <strong>{department.name}</strong> has no subcategories yet. Drop a collection on this row
            or use &ldquo;+ Subcategory&rdquo;.
          </span>
        </div>
      )}

      {!isCollapsed && department.subGroups.length > 0 && (
        <div className="space-y-2 py-2 pl-6 pr-4">
          {department.subGroups.map((subGroup) => (
            <SubGroupBlock
              key={subGroup.id}
              department={department}
              subGroup={subGroup}
              actions={actions}
              view={view}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubGroupBlock({
  department,
  subGroup,
  actions,
  view,
}: {
  department: MerchantTreeNode;
  subGroup: MerchantTreeSubGroup;
  actions: BuilderActions;
  view: BuilderView;
}) {
  const leafIds = subGroupLeafIds(subGroup);
  const state = checkStateOf(leafIds, view.selected);
  const selectedHere = leafIds.filter((id) => view.selected.has(id)).length;
  const isCollapsed = view.collapsed.has(subGroup.id);
  const isDropActive = view.activeDropZone === `sub-${subGroup.id}`;
  const productCount =
    subGroup.leafs.length > 0
      ? subGroup.leafs.reduce((sum, leaf) => sum + leaf.productCount, 0)
      : view.productCountOf(subGroup.collectionId);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        view.setActiveDropZone(`sub-${subGroup.id}`);
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        view.setActiveDropZone(null);
      }}
      onDrop={(event) => actions.dropOnSubGroup(department.id, subGroup.id, event)}
      className={cn(
        "space-y-2 rounded-r-[var(--radius-lg)] border-l-2 p-2 pl-3 transition-all",
        isDropActive
          ? "border-[var(--color-brand)] bg-[var(--color-brand-light)]"
          : "border-[var(--color-border-strong)]"
      )}
    >
      <div className="flex select-none items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => view.toggleCollapsed(subGroup.id)}
            title={isCollapsed ? "Expand subcategory" : "Collapse subcategory"}
            className="shrink-0 p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => actions.toggleLeaves(leafIds, state !== "checked")}
            disabled={leafIds.length === 0}
            aria-label={`Select every leaf under ${subGroup.name}`}
            className="group shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckboxIcon state={state} size="sm" />
          </button>

          {view.editingId === subGroup.id ? (
            <NameEditor
              initial={subGroup.name}
              onCommit={(name) => actions.rename(subGroup.id, name)}
              onCancel={() => view.setEditingId(null)}
            />
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-xs font-bold text-[var(--color-text-primary)]">
                {subGroup.name}
              </span>
              <RenameButton onClick={() => view.setEditingId(subGroup.id)} label="Rename subcategory" />
              <span className="rounded bg-[var(--color-surface-base)] px-1.5 text-[9px] font-semibold text-[var(--color-text-muted)]">
                Subcategory
              </span>
              {isDropActive && view.draggedTitle && (
                <span className="rounded border border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-brand)]">
                  Release to add &ldquo;{view.draggedTitle}&rdquo; as Leaf
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <QuickButton
            onClick={() => view.setAddingLeafFor(view.addingLeafFor === subGroup.id ? null : subGroup.id)}
            title={`Add a leaf under ${subGroup.name}`}
          >
            <Plus className="h-2.5 w-2.5" />
            <span className="hidden md:inline">+ Leaf</span>
          </QuickButton>
          <PreviewButton
            collectionId={subGroup.collectionId}
            name={subGroup.name}
            onPreview={actions.preview}
          />
          <span className="hidden text-[11px] text-[var(--color-text-muted)] sm:inline">
            {selectedHere}/{leafIds.length} leaves
          </span>
          <span className="rounded bg-[var(--color-surface-base)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">
            {productCount.toLocaleString()}
          </span>
          <DeleteButton
            onClick={() => actions.removeSubGroup(department.id, subGroup.id)}
            label="Remove subcategory"
          />
        </div>
      </div>

      {view.addingLeafFor === subGroup.id && (
        <div className="my-1.5 ml-5 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-2">
          <span className="shrink-0 text-[11px] font-bold text-[var(--color-brand)]">
            New Leaf in {subGroup.name}:
          </span>
          <InlineNameForm
            placeholder="e.g., Casual Dresses, Graphic Tees, Denim Jeans…"
            submitLabel="+ Add"
            onSubmit={(name) => actions.addLeaf(department.id, subGroup.id, name)}
            onCancel={() => view.setAddingLeafFor(null)}
          />
        </div>
      )}

      {!isCollapsed && (
        <div className="space-y-1.5 pl-5 pt-1">
          {subGroup.leafs.length === 0 ? (
            <p className="py-1 pl-2 text-[11px] italic text-[var(--color-text-muted)]">
              {view.draggedTitle
                ? `Drop "${view.draggedTitle}" on this subcategory to add it as a leaf`
                : "No leaves yet. Drop a collection here or use \u201C+ Leaf\u201D."}
            </p>
          ) : (
            subGroup.leafs.map((leaf) => (
              <LeafRow
                key={leaf.id}
                department={department}
                subGroup={subGroup}
                leaf={leaf}
                actions={actions}
                view={view}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LeafRow({
  department,
  subGroup,
  leaf,
  actions,
  view,
}: {
  department: MerchantTreeNode;
  subGroup: MerchantTreeSubGroup;
  leaf: MerchantTreeLeaf;
  actions: BuilderActions;
  view: BuilderView;
}) {
  const scopable = hasCollection(leaf);
  const isSelected = view.selected.has(leaf.id);
  const isEditing = view.editingId === leaf.id;

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border p-2 text-xs transition-all",
        isSelected
          ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] font-semibold"
          : "border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-strong)]"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={() => actions.toggleLeaves([leaf.id], !isSelected)}
          disabled={!scopable}
          aria-label={`Include ${leaf.name} in scope`}
          title={scopable ? undefined : "This heading has no collection behind it, so it holds no products"}
          className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckboxIcon state={isSelected ? "checked" : "unchecked"} />
        </button>

        {isEditing ? (
          <NameEditor
            initial={leaf.name}
            onCommit={(name) => actions.rename(leaf.id, name)}
            onCancel={() => view.setEditingId(null)}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-bold text-[var(--color-text-primary)]">{leaf.name}</span>
              <RenameButton onClick={() => view.setEditingId(leaf.id)} label="Rename leaf" />
              {!scopable && (
                <span className="rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-1.5 text-[9px] font-bold text-[var(--color-warning)]">
                  No collection
                </span>
              )}
            </div>
            <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--color-text-muted)]">
              {department.name} &gt; {subGroup.name} &gt; {leaf.name}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <PreviewButton
          collectionId={scopable ? leaf.collectionId : null}
          name={leaf.name}
          onPreview={actions.preview}
        />
        <span className="rounded bg-[var(--color-surface-base)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">
          {leaf.productCount.toLocaleString()} products
        </span>
        <DeleteButton
          onClick={() => actions.removeLeaf(department.id, subGroup.id, leaf.id)}
          label="Remove leaf"
        />
      </div>
    </div>
  );
}

function CheckboxIcon({ state, size = "md" }: { state: CheckState; size?: "sm" | "md" }) {
  const box = cn("shrink-0", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4");
  if (state === "checked") return <CheckSquare className={cn(box, "text-[var(--color-brand)]")} />;
  if (state === "indeterminate") return <MinusSquare className={cn(box, "text-[var(--color-brand)]")} />;
  return (
    <Square
      className={cn(box, "text-[var(--color-border-strong)] group-hover:text-[var(--color-brand)]")}
    />
  );
}

function RenameButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand)]"
    >
      <Pencil className="h-3 w-3" />
    </button>
  );
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** Hidden on hand-typed headings: preview loads live products for a store collection, and there is
 *  none behind a name the merchant invented. */
function PreviewButton({
  collectionId,
  name,
  onPreview,
}: {
  collectionId: string | null;
  name: string;
  onPreview: (target: CategoryPreviewTarget) => void;
}) {
  if (!collectionId) return null;
  return (
    <button
      type="button"
      onClick={() => onPreview({ categoryId: collectionId, categoryName: name })}
      title={`Preview live products in "${name}"`}
      className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] px-1.5 py-1 text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
    >
      <Eye className="h-3.5 w-3.5" />
      <span className="hidden md:inline">Preview</span>
    </button>
  );
}

/** Escape has to win over the blur that follows it, so the cancel flag is read on the way out
 *  rather than inferred from which handler fired first. */
function NameEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = React.useState(initial);
  const cancelled = React.useRef(false);

  function commit() {
    if (cancelled.current) return;
    const trimmed = text.trim();
    if (trimmed) onCommit(trimmed);
    else onCancel();
  }

  return (
    <input
      autoFocus
      value={text}
      aria-label="Node name"
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={commit}
      className="w-full max-w-xs rounded-md border border-[var(--color-brand)] bg-[var(--color-surface-base)] px-2 py-0.5 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none"
    />
  );
}

function InlineNameForm({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = React.useState("");
  const trimmed = text.trim();

  return (
    <div className="flex w-full items-center gap-1.5">
      <input
        autoFocus
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && trimmed) onSubmit(trimmed);
          if (event.key === "Escape") onCancel();
        }}
        className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-primary)] placeholder:font-normal placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
      />
      <Button size="sm" onClick={() => onSubmit(trimmed)} disabled={!trimmed}>
        {submitLabel}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function QuickMapModal({
  collection,
  tree,
  onClose,
  onMap,
}: {
  collection: StoreCategory | null;
  tree: readonly MerchantTreeNode[];
  onClose: () => void;
  onMap: (
    collection: StoreCategory,
    target: { kind: "department" } | { kind: "sub"; deptId: string } | { kind: "leaf"; deptId: string; subId: string }
  ) => void;
}) {
  return (
    <Modal
      isOpen={collection !== null}
      onClose={onClose}
      title={collection ? `Map collection "${collection.name}"` : ""}
      description={
        collection
          ? `${collection.productCount.toLocaleString()} products · choose where it sits in the hierarchy`
          : undefined
      }
      icon={<FolderPlus className="h-4 w-4" />}
      size="sm"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      {collection && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onMap(collection, { kind: "department" })}
            className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-3 text-left transition-colors hover:border-[var(--color-brand)]/50"
          >
            <span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-brand)]">
                <PlusCircle className="h-3.5 w-3.5" /> Create as new Category (Level 1)
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-[var(--color-text-muted)]">
                {collection.name}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-brand)]" />
          </button>

          {tree.map((department) => (
            <div
              key={department.id}
              className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-[var(--color-text-primary)]">
                  Under {department.name}
                </span>
                <button
                  type="button"
                  onClick={() => onMap(collection, { kind: "sub", deptId: department.id })}
                  className="shrink-0 rounded-lg border border-[var(--color-brand)]/30 px-2 py-1 text-[10px] font-bold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-light)]"
                >
                  + Add as Subcategory
                </button>
              </div>

              {department.subGroups.length > 0 && (
                <div className="space-y-1.5 border-l-2 border-[var(--color-border-strong)] pl-3">
                  {department.subGroups.map((subGroup) => (
                    <div key={subGroup.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="truncate text-[11px] font-medium text-[var(--color-text-secondary)]">
                        {subGroup.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onMap(collection, { kind: "leaf", deptId: department.id, subId: subGroup.id })
                        }
                        className="shrink-0 rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
                      >
                        + Add as Leaf
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
