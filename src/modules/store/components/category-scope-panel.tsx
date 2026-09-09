"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, FolderTree, Layers, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreConnectionStore } from "@/modules/store/store";
import type { CategoryParentMap, MerchantTreeNode, StoreCategory, StorePlatform } from "@/modules/store/types";
import {
  buildCategoryIndex,
  mappableCategoryIds,
  suggestParentCategory,
  type CategoryIndex,
} from "@/lib/catalog/category-parents";
import { merchantTreePaths, selectedCollectionIds } from "@/lib/catalog/merchant-tree";
import { isSizingGroup } from "@/lib/sizing/measurements";
import { cn } from "@/lib/utils/cn";
import { CategoryPreviewModal, type CategoryPreviewTarget } from "./category-preview-modal";
import { WooScopeTree } from "./categories/woo-scope-tree";
import { ShopifyTreeBuilder } from "./categories/shopify-tree-builder";
import { ParentMappingGrid, type AutoClassifyResult } from "./categories/parent-mapping-grid";
import type { ClassifiedPath, MappablePath, PathNote } from "./categories/types";

/**
 * The Categories tab, in two steps.
 *
 * Step 1 settles which of the store's paths are in scope for sizing, and differs completely by
 * platform: WooCommerce publishes a real term hierarchy that only has to be ticked, while Shopify
 * publishes a flat bag of collections with no parent links at all, so its merchant assembles a
 * three-level tree by hand before there is anything to tick. Step 2 is identical for both — each
 * in-scope path is mapped onto one of the five parent sizing categories, and every SKU underneath
 * inherits it.
 *
 * Both steps save together at the end. A scope stored without its mapping is a catalog that indexes
 * and cannot be sized, which is a worse state than not having saved at all.
 */
interface CategoryScopePanelProps {
  platform: StorePlatform;
  onBackToConnection?: () => void;
  onContinueToSetup?: () => void;
}

export function CategoryScopePanel({
  platform,
  onBackToConnection,
  onContinueToSetup,
}: CategoryScopePanelProps) {
  const categories = useStoreConnectionStore((s) => s.categories);
  const savedSelectedIds = useStoreConnectionStore((s) => s.selectedCategoryIds);
  const savedParentMap = useStoreConnectionStore((s) => s.categoryParentMap);
  const savedTree = useStoreConnectionStore((s) => s.categoryTree);
  const saveCategoryScope = useStoreConnectionStore((s) => s.saveCategoryScope);

  // Only WooCommerce reports parent/child links; Shopify collections are flat.
  const hasHierarchy = platform !== "shopify";

  const [step, setStep] = React.useState<"scope" | "mapping">("scope");
  const [tree, setTree] = React.useState<MerchantTreeNode[]>(savedTree);
  const [parentMap, setParentMap] = React.useState<CategoryParentMap>(savedParentMap);
  const [previewTarget, setPreviewTarget] = React.useState<CategoryPreviewTarget | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [continuing, setContinuing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Which rows hold a guess rather than a decision. Session-only on purpose: once the merchant has
  // saved and come back, every mapping in the map is one they accepted by continuing past it.
  const [suggestedIds, setSuggestedIds] = React.useState<ReadonlySet<string>>(new Set());

  /** What the last auto-classify pass managed, so the button can say so. Null until it is pressed. */
  const [autoResult, setAutoResult] = React.useState<AutoClassifyResult | null>(null);
  const [classifying, setClassifying] = React.useState(false);

  /** Why the model answered as it did, per path. Session-only, like `suggestedIds`: a reason is
   *  scaffolding for a decision the merchant is making now, not a fact about the category. */
  const [pathNotes, setPathNotes] = React.useState<Record<string, PathNote>>({});

  const index = React.useMemo(() => buildCategoryIndex(categories), [categories]);

  /** WooCommerce holds term ids here; Shopify holds ids of leaves in the tree above. */
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() =>
    hasHierarchy
      ? new Set(savedSelectedIds)
      : new Set(
          merchantTreePaths(savedTree)
            .filter((path) => savedSelectedIds.includes(path.collectionId))
            .map((path) => path.leafId)
        )
  );

  const paths = React.useMemo(
    () =>
      hasHierarchy
        ? wooMappablePaths(categories, [...selected], index)
        : shopifyMappablePaths(tree, selected, categories),
    [hasHierarchy, categories, selected, index, tree]
  );

  const unmappedCount = paths.filter((path) => !isSizingGroup(parentMap[path.id])).length;

  // What a save would write, so "is anything unsaved" and "what do we send" cannot disagree.
  const outgoingIds = React.useMemo(
    () => (hasHierarchy ? [...selected] : selectedCollectionIds(tree, [...selected])),
    [hasHierarchy, selected, tree]
  );

  const isDirty =
    !sameIds(outgoingIds, savedSelectedIds) ||
    JSON.stringify(parentMap) !== JSON.stringify(savedParentMap) ||
    (!hasHierarchy && JSON.stringify(tree) !== JSON.stringify(savedTree));

  /**
   * Suggests a parent for every path the merchant has not answered, and marks those rows as guesses.
   *
   * Asks the model, which reads a live sample of each path's actual products, and falls back to the
   * offline keyword matcher if that call fails. The fallback is worth keeping for exactly the case
   * it is good at — a path whose name already names a garment — and it means a Gemini outage
   * degrades this button rather than breaking it.
   */
  async function autoClassify() {
    const pending = paths.filter((path) => !isSizingGroup(parentMap[path.id]));
    if (pending.length === 0) {
      setAutoResult({ filled: 0, declined: 0, mixed: 0 });
      return;
    }

    setClassifying(true);
    setAutoResult(null);

    try {
      const res = await fetch("/api/store-connection/categories/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: pending.map(({ id, path, productCount }) => ({ id, path, productCount })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not classify these categories");

      applyVerdicts(pending, data.verdicts ?? []);
    } catch {
      applyFallback(pending);
    } finally {
      setClassifying(false);
    }
  }

  /** Writes the model's answers onto the map, keeping its reasons and its "mixed" calls for the
   *  rows to show. Only a real parent is written; mixed and unsure rows stay unanswered. */
  function applyVerdicts(pending: readonly MappablePath[], verdicts: readonly ClassifiedPath[]) {
    const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]));
    const next = { ...parentMap };
    const guessed = new Set(suggestedIds);
    const notes: Record<string, PathNote> = { ...pathNotes };
    let filled = 0;
    let declined = 0;
    let mixed = 0;

    for (const path of pending) {
      const verdict = byId.get(path.id);
      if (verdict?.reason) notes[path.id] = { mixed: verdict.mixed, reason: verdict.reason };

      if (verdict?.mixed) mixed += 1;

      if (verdict?.parent && isSizingGroup(verdict.parent)) {
        next[path.id] = verdict.parent;
        guessed.add(path.id);
        filled += 1;
      } else {
        declined += 1;
      }
    }

    setParentMap(next);
    setSuggestedIds(guessed);
    setPathNotes(notes);
    setAutoResult({ filled, declined, mixed });
  }

  /** The old keyword matcher, used only when the model call could not be made. */
  function applyFallback(pending: readonly MappablePath[]) {
    const next = { ...parentMap };
    const guessed = new Set(suggestedIds);
    let filled = 0;
    let declined = 0;

    for (const path of pending) {
      const suggestion = suggestParentCategory(path.path);
      if (!suggestion) {
        declined += 1;
        continue;
      }
      next[path.id] = suggestion;
      guessed.add(path.id);
      filled += 1;
    }

    setParentMap(next);
    setSuggestedIds(guessed);
    setAutoResult({ filled, declined, mixed: 0, offline: true });
  }

  function updateParentMap(next: CategoryParentMap) {
    // Anything the merchant touches by hand stops being a suggestion, including a row they set to
    // the same value auto-classify had already guessed — reading it and agreeing is a decision.
    const stillGuessed = new Set(suggestedIds);
    for (const [id, group] of Object.entries(next)) {
      if (parentMap[id] !== group) stillGuessed.delete(id);
    }
    setSuggestedIds(stillGuessed);
    setParentMap(next);
  }

  async function persist(): Promise<boolean> {
    const ok = await saveCategoryScope({
      selectedCategoryIds: outgoingIds,
      categoryParentMap: parentMap,
      ...(hasHierarchy ? {} : { categoryTree: tree }),
    });
    if (!ok) setError("Could not save your categories. Check your connection and try again.");
    return ok;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    if (await persist()) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function handleConfirm() {
    setContinuing(true);
    setError(null);
    const ok = !isDirty || (await persist());
    setContinuing(false);
    if (ok) onContinueToSetup?.();
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Header: which of the two steps is live, and where the taxonomy came from. */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-elevated)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <StepPill
            active={step === "scope"}
            done={step === "mapping"}
            onClick={step === "mapping" ? () => setStep("scope") : undefined}
          >
            Step 1: {hasHierarchy ? "Select category scope" : "Build tree & select scope"}
            <StepCount>{paths.length}</StepCount>
          </StepPill>

          <ArrowRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />

          <StepPill active={step === "mapping"} done={false}>
            Step 2: Map to 5 parent categories
          </StepPill>
        </div>

        <div className="flex items-center gap-1.5 self-start text-xs font-semibold text-[var(--color-text-secondary)] sm:self-auto">
          {hasHierarchy ? (
            <FolderTree className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          ) : (
            <Store className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          )}
          <span>{PLATFORM_LABELS[platform]}</span>
          <span className="rounded-full border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-brand)]">
            {hasHierarchy ? "Native tree" : "Flat collections"}
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}

      {step === "scope" ? (
        <>
          <div className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <span className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-[var(--shadow-glow)]">
              <Layers className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--color-text-primary)]">
                {hasHierarchy ? "Choose what Persona sizes" : "Build your sizing hierarchy"}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {hasHierarchy
                  ? "Your store already publishes a category tree. Tick the paths you want sized — everything beneath a ticked path comes with it."
                  : "Shopify collections have no parent links, so drag them into a three-level tree that matches how your store is actually organised, then tick the paths you want sized."}
              </p>
            </div>
          </div>

          {hasHierarchy ? (
            <WooScopeTree
              categories={categories}
              selected={selected}
              onSelectedChange={setSelected}
              onPreview={setPreviewTarget}
            />
          ) : (
            <ShopifyTreeBuilder
              collections={categories}
              tree={tree}
              onTreeChange={setTree}
              selectedLeafIds={selected}
              onSelectedLeafIdsChange={setSelected}
              onPreview={setPreviewTarget}
            />
          )}
        </>
      ) : (
        <ParentMappingGrid
          paths={paths}
          parentMap={parentMap}
          onChange={updateParentMap}
          platform={platform}
          onAutoClassify={autoClassify}
          autoResult={autoResult}
          classifying={classifying}
          notes={pathNotes}
          suggested={suggestedIds}
          onBackToScope={() => setStep("scope")}
          onPreview={setPreviewTarget}
        />
      )}

      {/* Sticky footer action bar. */}
      <div className="sticky bottom-4 z-10 flex flex-col items-center justify-between gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sticky)] p-3.5 shadow-[var(--shadow-modal)] sm:flex-row">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={step === "mapping" ? () => setStep("scope") : onBackToConnection}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3 w-3" />
            {step === "mapping" ? "Back to category scope" : "Back to Connect Store"}
          </button>
          <span className="text-[var(--color-border-strong)]">|</span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            <strong className="text-[var(--color-text-primary)]">{paths.length.toLocaleString()}</strong>{" "}
            category {paths.length === 1 ? "path" : "paths"} selected for sizing
            {step === "mapping" && unmappedCount === 0 && paths.length > 0 && (
              <span className="text-[var(--color-success)]"> · all mapped</span>
            )}
            {isDirty && <span className="text-[var(--color-warning)]"> · unsaved changes</span>}
          </span>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          {step === "scope" ? (
            <>
              {paths.length === 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-warning)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Select at least 1 category path to continue
                </span>
              )}
              <Button size="sm" onClick={() => setStep("mapping")} disabled={paths.length === 0}>
                Continue to map to parent categories <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              {unmappedCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-warning)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {unmappedCount} {unmappedCount === 1 ? "path still needs" : "paths still need"} a parent
                </span>
              )}
              <Button variant="secondary" size="sm" loading={saving} onClick={handleSave} disabled={!isDirty}>
                {saved ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Saved
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                size="sm"
                loading={continuing}
                onClick={handleConfirm}
                disabled={unmappedCount > 0 || paths.length === 0}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm mappings &amp; continue to Setup
              </Button>
            </>
          )}
        </div>
      </div>

      <CategoryPreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}

const PLATFORM_LABELS: Record<StorePlatform, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  wordpress: "WooCommerce",
  custom: "Custom Store",
};

/**
 * The frontier of a WooCommerce selection, each with the breadcrumb its ancestors give it.
 *
 * Ids no longer present in `categories` are dropped rather than shown as a row with no name: a term
 * deleted in the store admin can linger in a saved selection, and asking the merchant to assign a
 * parent to something that no longer exists is a question with no useful answer.
 */
function wooMappablePaths(
  categories: readonly StoreCategory[],
  selectedIds: readonly string[],
  index: CategoryIndex
): MappablePath[] {
  const byId = new Map(categories.map((category) => [category.id, category]));

  return mappableCategoryIds(selectedIds, index).flatMap((id) => {
    const category = byId.get(id);
    if (!category) return [];

    const names: string[] = [];
    let cursor: string | null = id;
    let hops = 0;
    while (cursor !== null && hops <= categories.length) {
      const step = byId.get(cursor);
      if (!step) break;
      names.unshift(step.name);
      cursor = index.parentOf.get(cursor) ?? null;
      hops += 1;
    }

    return [
      {
        id,
        name: category.name,
        path: names.join(" > "),
        handle: category.handle,
        productCount: category.productCount,
      },
    ];
  });
}

/**
 * The selected leaves of a merchant-built tree, collapsed onto the collections behind them.
 *
 * Deduped by collection because one collection may legitimately hang off two departments — a shared
 * `T-Shirts` under both Women and Men is how plenty of Shopify stores are arranged — and the parent
 * mapping attaches to the collection, so asking about it twice would be asking the same question
 * twice with no way to reconcile two different answers.
 */
function shopifyMappablePaths(
  tree: readonly MerchantTreeNode[],
  selectedLeafIds: ReadonlySet<string>,
  collections: readonly StoreCategory[]
): MappablePath[] {
  const handles = new Map(collections.map((collection) => [collection.id, collection.handle]));
  const byCollection = new Map<string, MappablePath>();

  for (const leaf of merchantTreePaths(tree)) {
    if (!selectedLeafIds.has(leaf.leafId) || byCollection.has(leaf.collectionId)) continue;
    byCollection.set(leaf.collectionId, {
      id: leaf.collectionId,
      name: leaf.name,
      path: leaf.path,
      handle: handles.get(leaf.collectionId),
      productCount: leaf.productCount,
    });
  }

  return [...byCollection.values()];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

function StepPill({
  children,
  active,
  done,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  done: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      {done && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)]" />}
      {active && <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />}
      {children}
    </>
  );

  const className = cn(
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition-colors",
    active
      ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand)]"
      : "border-[var(--color-border)] text-[var(--color-text-secondary)]",
    onClick && "hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
  );

  if (!onClick) return <div className={className}>{content}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function StepCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-[var(--color-surface-base)] px-1.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
      {children}
    </span>
  );
}
