"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Eye,
  MinusSquare,
  Search,
  Square,
  X,
} from "lucide-react";
import type { StoreCategory } from "@/modules/store/types";
import type { CategoryNode } from "@/modules/store/sizing/types";
import {
  buildCategoryTree,
  checkStateOf,
  deselectSubtree,
  flattenTree,
  matchingIds,
  selectSubtree,
  type CheckState,
} from "@/lib/catalog/category-tree";
import { cn } from "@/lib/utils/cn";
import type { CategoryPreviewTarget } from "../category-preview-modal";

/**
 * Step 1 of the Categories tab on platforms that publish a real taxonomy.
 *
 * WooCommerce terms carry a parent id, so the merchant's own hierarchy is already there to be
 * ticked and there is nothing for them to assemble — the opposite of Shopify, where the whole of
 * step 1 is building a tree that does not exist. Both end at the same place: a set of paths in
 * scope, which step 2 then maps onto the five parent sizing categories.
 *
 * Selection is stored closed under descendants: ticking a branch stores that branch and everything
 * beneath it. That is exactly what `expandCategorySelection` derives on the server, so what the
 * merchant sees here and what the indexer walks cannot drift apart. The non-obvious consequences of
 * that all live in `@/lib/catalog/category-tree`, not here.
 */
export interface WooScopeTreeProps {
  categories: readonly StoreCategory[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  onPreview: (target: CategoryPreviewTarget) => void;
}

export function WooScopeTree({ categories, selected, onSelectedChange, onPreview }: WooScopeTreeProps) {
  const tree = React.useMemo(() => buildCategoryTree(categories), [categories]);
  const allNodes = React.useMemo(() => flattenTree(tree), [tree]);

  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => {
    // Roots open, deeper levels closed — a large WooCommerce store is unreadable fully expanded.
    return new Set(tree.filter((node) => node.children.length > 0).map((node) => node.id));
  });

  const visible = React.useMemo(() => matchingIds(tree, query), [tree, query]);
  const isFiltering = query.trim().length > 0;

  const allExpandable = React.useMemo(
    () => allNodes.filter((node) => node.children.length > 0).map((node) => node.id),
    [allNodes]
  );
  const allExpanded = allExpandable.length > 0 && allExpandable.every((id) => expanded.has(id));

  function toggleNode(node: CategoryNode, state: CheckState) {
    onSelectedChange(
      state === "checked" ? deselectSubtree(selected, tree, node) : selectSubtree(selected, node)
    );
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-3.5 shadow-[var(--shadow-card)] backdrop-blur-xl sm:flex-row">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter categories (e.g. T-Shirts, Dresses, Jeans)…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          {allExpandable.length > 0 && !isFiltering && (
            <QuickButton onClick={() => setExpanded(allExpanded ? new Set() : new Set(allExpandable))}>
              {allExpanded ? "Collapse All" : "Expand All"}
            </QuickButton>
          )}
          <QuickButton emphasis onClick={() => onSelectedChange(new Set(allNodes.map((node) => node.id)))}>
            Select All
          </QuickButton>
          <QuickButton onClick={() => onSelectedChange(new Set())} disabled={selected.size === 0}>
            Clear
          </QuickButton>
        </div>
      </div>

      {allNodes.length === 0 ? (
        <p className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] py-10 text-center text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
          No categories found on this store yet. Create one in your store admin, then run Sync Now on
          the Connection tab.
        </p>
      ) : isFiltering && visible.size === 0 ? (
        <p className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] py-10 text-center text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
          No categories match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
          {tree.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              ancestorNames={[]}
              selected={selected}
              expanded={expanded}
              visible={visible}
              isFiltering={isFiltering}
              onToggle={toggleNode}
              onToggleExpanded={toggleExpanded}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Every descendant leaf (a node with no children of its own) under `node`, self included when
 *  `node` is already a leaf. Counts are always leaf-scoped — a subcategory is never counted as one
 *  of its own leaves. */
function collectLeaves(node: CategoryNode): CategoryNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

function QuickButton({
  children,
  emphasis,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50",
        emphasis
          ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand)] hover:border-[var(--color-brand)]/50"
          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

interface CategoryRowProps {
  node: CategoryNode;
  depth: number;
  /** Ancestor names from the tree root down to (not including) `node`, joined into the small
   *  breadcrumb every leaf carries — e.g. `Women > Tops > T-Shirts`. */
  ancestorNames: readonly string[];
  selected: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  visible: ReadonlySet<string>;
  isFiltering: boolean;
  onToggle: (node: CategoryNode, state: CheckState) => void;
  onToggleExpanded: (id: string) => void;
  onPreview: (target: CategoryPreviewTarget) => void;
}

/**
 * Dispatches each node to the row shape that matches its role: a full-width header band for
 * top-level departments, a left-rule indented block for mid-level subcategories, and a bordered
 * card for every leaf.
 */
function CategoryRow(props: CategoryRowProps) {
  const { node, depth, isFiltering, visible } = props;
  if (isFiltering && !visible.has(node.id)) return null;

  if (depth === 0) return <GroupRow {...props} />;
  if (node.children.length > 0) return <SubgroupRow {...props} />;
  return <LeafRow {...props} />;
}

function GroupRow({
  node,
  depth,
  ancestorNames,
  selected,
  expanded,
  visible,
  isFiltering,
  onToggle,
  onToggleExpanded,
  onPreview,
}: CategoryRowProps) {
  const state = checkStateOf(node, selected);
  const hasChildren = node.children.length > 0;
  const isOpen = isFiltering || expanded.has(node.id);
  const leaves = hasChildren ? node.children.flatMap(collectLeaves) : [];
  const selectedLeaves = leaves.filter((leaf) => selected.has(leaf.id)).length;
  // A top-level category with no subcategories at all. Fit accuracy is worse here since every
  // product in the department sits on one flat term.
  const isShallowRoot = !hasChildren && node.productCount > 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[var(--color-surface-elevated)] to-[var(--color-surface-elevated)]/40 px-4 py-3 select-none">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={() => hasChildren && onToggleExpanded(node.id)}
            title={isOpen ? "Collapse group" : "Expand group"}
            disabled={!hasChildren || isFiltering}
            className={cn(
              "rounded p-1 text-[var(--color-text-muted)] transition-colors",
              hasChildren &&
                !isFiltering &&
                "hover:bg-[var(--color-surface-card)] hover:text-[var(--color-text-primary)]",
              !hasChildren && "invisible"
            )}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => onToggle(node, state)}
            className="group flex min-w-0 items-center gap-2 text-left"
          >
            <CheckboxIcon state={state} />
            <span className="truncate text-sm font-bold text-[var(--color-text-primary)]">{node.name}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <PreviewButton node={node} onPreview={onPreview} />
          {hasChildren && (
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">
              {selectedLeaves} / {leaves.length} Leafs Selected
            </span>
          )}
          <span className="rounded bg-[var(--color-surface-base)] px-2 py-0.5 font-mono text-xs font-medium text-[var(--color-text-muted)]">
            {node.productCount.toLocaleString()} products
          </span>
        </div>
      </div>

      {isShallowRoot && (
        <div className="mx-6 my-2.5 flex items-center gap-2.5 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-3 py-3 text-xs text-[var(--color-warning)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            This category has no subcategories. Fit accuracy will be limited without more specific
            categorization.
          </span>
        </div>
      )}

      {hasChildren && isOpen && (
        <div className="space-y-3 py-2 pr-4 pl-6">
          {node.children.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              ancestorNames={[...ancestorNames, node.name]}
              selected={selected}
              expanded={expanded}
              visible={visible}
              isFiltering={isFiltering}
              onToggle={onToggle}
              onToggleExpanded={onToggleExpanded}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubgroupRow({
  node,
  depth,
  ancestorNames,
  selected,
  expanded,
  visible,
  isFiltering,
  onToggle,
  onToggleExpanded,
  onPreview,
}: CategoryRowProps) {
  const state = checkStateOf(node, selected);
  const isOpen = isFiltering || expanded.has(node.id);
  const leaves = node.children.flatMap(collectLeaves);
  const selectedLeaves = leaves.filter((leaf) => selected.has(leaf.id)).length;

  return (
    <div className="space-y-2 border-l-2 border-[var(--color-border-strong)] py-1 pl-3">
      <div className="flex items-center justify-between gap-2 select-none">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleExpanded(node.id)}
            disabled={isFiltering}
            title={isOpen ? "Collapse subcategory" : "Expand subcategory"}
            className="p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onToggle(node, state)}
            className="group flex min-w-0 items-center gap-1.5 text-left"
          >
            <CheckboxIcon state={state} size="sm" />
            <span className="truncate text-xs font-bold text-[var(--color-text-primary)]">{node.name}</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <PreviewButton node={node} onPreview={onPreview} />
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {selectedLeaves}/{leaves.length} leaves
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-1.5 pt-1 pl-6">
          {node.children.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              ancestorNames={[...ancestorNames, node.name]}
              selected={selected}
              expanded={expanded}
              visible={visible}
              isFiltering={isFiltering}
              onToggle={onToggle}
              onToggleExpanded={onToggleExpanded}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeafRow({ node, ancestorNames, selected, onToggle, onPreview }: CategoryRowProps) {
  const state = checkStateOf(node, selected);
  const isChecked = state === "checked";

  return (
    <div
      onClick={() => onToggle(node, state)}
      className={cn(
        "group flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-2 text-xs transition-all",
        isChecked
          ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] font-semibold shadow-[0_0_0_1px_rgba(247,109,1,0.12)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-card)]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <CheckboxIcon state={state} />
        <div className="min-w-0">
          <span className="block truncate text-[var(--color-text-primary)]">{node.name}</span>
          <span className="block truncate font-mono text-[10px] text-[var(--color-text-muted)]">
            {[...ancestorNames, node.name].join(" > ")}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <PreviewButton node={node} onPreview={onPreview} />
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
          {node.productCount.toLocaleString()} products
        </span>
      </div>
    </div>
  );
}

function CheckboxIcon({ state, size = "md" }: { state: CheckState; size?: "sm" | "md" }) {
  const box = cn("shrink-0", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4");
  if (state === "checked") return <CheckSquare className={cn(box, "text-[var(--color-brand)]")} />;
  if (state === "indeterminate") return <MinusSquare className={cn(box, "text-[var(--color-brand)]")} />;
  return (
    <Square className={cn(box, "text-[var(--color-border-strong)] group-hover:text-[var(--color-brand)]")} />
  );
}

function PreviewButton({
  node,
  onPreview,
}: {
  node: CategoryNode;
  onPreview: (target: CategoryPreviewTarget) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onPreview({ categoryId: node.id, categoryName: node.name });
      }}
      title={`Preview live products in "${node.name}"`}
      className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] px-1.5 py-1 text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
    >
      <Eye className="h-3.5 w-3.5" />
      <span className="hidden md:inline">Preview</span>
    </button>
  );
}
