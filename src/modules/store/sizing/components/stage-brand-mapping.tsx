"use client";

import * as React from "react";
import { Check, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import { MappingSelect, type SelectOption } from "@/modules/store/components/mapping-select";
import { useSizingStore } from "../store";
import type {
  BrandMappingResponse,
  BrandMappingStatus,
  CanonicalBrandGroup,
} from "../server-types";
import { StageHeaderBanner } from "./stage-header-banner";

function assignmentsFromGroups(groups: readonly CanonicalBrandGroup[]): Record<string, string> {
  return Object.fromEntries(
    groups.flatMap((group) => group.rawKeys.map((rawKey) => [rawKey, group.canonicalName])),
  );
}

function groupsFromAssignments(
  assignments: Record<string, string>,
  targets: BrandMappingResponse["targets"],
): CanonicalBrandGroup[] {
  const targetByKey = new Map(targets.map((target) => [target.canonicalKey, target]));
  const groups = new Map<string, CanonicalBrandGroup>();

  for (const [rawKey, value] of Object.entries(assignments)) {
    const canonicalName = value.trim().replace(/\s+/g, " ");
    const canonicalKey = normalizeBrandKey(canonicalName);
    if (!canonicalKey || !canonicalName) continue;
    const target = targetByKey.get(canonicalKey);
    const current = groups.get(canonicalKey);
    if (current) current.rawKeys.push(rawKey);
    else {
      groups.set(canonicalKey, {
        canonicalKey,
        canonicalName: target?.canonicalName ?? canonicalName,
        rawKeys: [rawKey],
        shared: target?.shared ?? false,
      });
    }
  }

  return [...groups.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

export function StageBrandMapping() {
  const mapping = useSizingStore((state) => state.brandMapping);
  const status = useSizingStore((state) => state.brandMappingStatus);
  const loading = useSizingStore((state) => state.brandMappingLoading);
  const error = useSizingStore((state) => state.brandMappingError);
  const load = useSizingStore((state) => state.loadBrandMapping);

  React.useEffect(() => {
    void load();
  }, [load]);

  if ((loading || !mapping) && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading store brands…
      </div>
    );
  }

  if (!mapping) {
    return (
      <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--color-error-border)] bg-[var(--color-error-light)] p-5">
        <p className="text-sm text-[var(--color-error)]">{error ?? "Could not load canonical brand mapping."}</p>
        <Button variant="secondary" size="sm" onClick={() => void load({ force: true })}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <BrandMappingEditor
      key={`${mapping.sourceFingerprint}:${mapping.confirmedAt ?? "unconfirmed"}`}
      mapping={mapping}
      status={status}
    />
  );
}

function BrandMappingEditor({
  mapping,
  status,
}: {
  mapping: BrandMappingResponse;
  status: BrandMappingStatus;
}) {
  const saving = useSizingStore((state) => state.brandMappingSaving);
  const error = useSizingStore((state) => state.brandMappingError);
  const editing = useSizingStore((state) => state.brandMappingEditing);
  const save = useSizingStore((state) => state.saveBrandMapping);
  const closeEditor = useSizingStore((state) => state.closeBrandMappingEditor);
  const suggestedAssignments = React.useMemo(
    () => assignmentsFromGroups(mapping.groups),
    [mapping.groups],
  );
  const [assignments, setAssignments] = React.useState<Record<string, string>>(
    () => suggestedAssignments,
  );
  const privateBrands = React.useMemo(() => mapping.privateBrands ?? [], [mapping.privateBrands]);
  const suggestedPrivate = React.useMemo(
    () => assignmentsFromGroups(mapping.privateGroups ?? []),
    [mapping.privateGroups],
  );
  const [privateAssignments, setPrivateAssignments] = React.useState<Record<string, string>>(
    () => suggestedPrivate,
  );
  const [query, setQuery] = React.useState("");

  const groups = React.useMemo(
    () => groupsFromAssignments(assignments, mapping.targets),
    [assignments, mapping.targets],
  );
  // A private label is its own chart brand unless the merchant groups it, so every label is an
  // option for every other, plus whatever group names were already saved.
  const privateTargets = React.useMemo<BrandMappingResponse["targets"]>(() => {
    const targets = new Map<string, BrandMappingResponse["targets"][number]>();
    for (const brand of privateBrands) {
      targets.set(brand.rawKey, {
        canonicalKey: brand.rawKey,
        canonicalName: brand.labels[0] ?? brand.rawKey,
        shared: false,
      });
    }
    for (const group of mapping.privateGroups ?? []) {
      if (!targets.has(group.canonicalKey)) {
        targets.set(group.canonicalKey, { ...group, shared: false });
      }
    }
    return [...targets.values()];
  }, [privateBrands, mapping.privateGroups]);
  const privateGroups = React.useMemo(
    () =>
      groupsFromAssignments(
        Object.fromEntries(
          privateBrands.map((brand) => [
            brand.rawKey,
            privateAssignments[brand.rawKey]?.trim() || (brand.labels[0] ?? brand.rawKey),
          ]),
        ),
        privateTargets,
      ),
    [privateAssignments, privateBrands, privateTargets],
  );
  const privateOptions = React.useMemo<SelectOption[]>(
    () =>
      privateTargets
        .map((target) => ({
          key: target.canonicalKey,
          label: target.canonicalName,
          hint: "Your own label",
          group: "Your brands",
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [privateTargets],
  );
  const complete = mapping.brands.every((brand) => assignments[brand.rawKey]?.trim());
  const canonicalCount = new Set(
    Object.values(assignments).map(normalizeBrandKey).filter(Boolean),
  ).size;
  const consolidated = Math.max(0, mapping.brands.length - canonicalCount);
  const canonicalOptions = React.useMemo<SelectOption[]>(() => {
    const options = new Map<string, SelectOption>();
    for (const target of mapping.targets) {
      options.set(target.canonicalKey, {
        key: target.canonicalKey,
        label: target.canonicalName,
        hint: target.shared ? "Shared charts available" : "Brand found in this store",
        group: target.shared ? "Shared chart registry" : "Store brands",
      });
    }
    for (const group of mapping.groups) {
      if (options.has(group.canonicalKey)) continue;
      options.set(group.canonicalKey, {
        key: group.canonicalKey,
        label: group.canonicalName,
        hint: "Suggested canonical brand",
        group: "Suggested brands",
      });
    }
    return [...options.values()].sort(
      (a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label),
    );
  }, [mapping.groups, mapping.targets]);
  const targetByKey = new Map(mapping.targets.map((target) => [target.canonicalKey, target]));
  const optionByKey = new Map(canonicalOptions.map((option) => [option.key, option]));
  const filteredBrands = mapping.brands.filter((brand) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [
      ...brand.labels,
      brand.rawKey,
      assignments[brand.rawKey] ?? "",
      ...brand.sizingCategories,
    ].some((value) => value.toLocaleLowerCase().includes(needle));
  });

  const resetSuggestions = () => {
    setAssignments({ ...suggestedAssignments });
    setPrivateAssignments({ ...suggestedPrivate });
  };
  const setCanonicalKey = (rawKey: string, canonicalKey: string) => {
    const option = optionByKey.get(canonicalKey);
    if (!option) return;
    setAssignments((current) => ({ ...current, [rawKey]: option.label }));
  };
  const privateOptionByKey = new Map(privateOptions.map((option) => [option.key, option]));
  const setPrivateCanonicalKey = (rawKey: string, canonicalKey: string) => {
    const option = privateOptionByKey.get(canonicalKey);
    if (!option) return;
    setPrivateAssignments((current) => ({ ...current, [rawKey]: option.label }));
  };
  const needle = query.trim().toLocaleLowerCase();
  const filteredPrivate = privateBrands.filter((brand) =>
    !needle ||
    [...brand.labels, brand.rawKey, privateAssignments[brand.rawKey] ?? "", ...brand.sizingCategories]
      .some((value) => value.toLocaleLowerCase().includes(needle)),
  );
  const privateGroupCount = privateGroups.length;

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={4}
        eyebrow="Canonical brand mapping"
        title="Confirm which store labels are the same brand"
        description="These aliases only route chart lookup in Phase 4 and later. Your products, original brand labels, classifications, and earlier-stage data remain unchanged."
        actions={
          <>
            {editing && status === "ready" && (
              <Button variant="ghost" size="sm" onClick={closeEditor} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={resetSuggestions} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset suggestions
            </Button>
            <Button
              size="sm"
              onClick={() => void save(groups, privateBrands.length > 0 ? privateGroups : undefined)}
              disabled={!complete || saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save mapping
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-error-border)] bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      {mapping.brands.length === 0 ? (
        <div className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-sm text-[var(--color-text-secondary)]">
          No global brand labels need grouping. Save the empty mapping to continue.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-[var(--color-surface-base)] px-2.5 py-1 font-semibold text-[var(--color-text-secondary)]">
                {mapping.brands.length} store labels
              </span>
              <span className="text-[var(--color-text-muted)]">→</span>
              <span className="rounded-full bg-[var(--color-brand-light)] px-2.5 py-1 font-semibold text-[var(--color-brand)]">
                {canonicalCount} canonical brands
              </span>
              {consolidated > 0 && (
                <span className="text-[var(--color-text-muted)]">
                  {consolidated} duplicate label{consolidated === 1 ? "" : "s"} consolidated
                </span>
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search store or canonical brand…"
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-2 pl-8 pr-3 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
              />
            </div>
          </div>

          <div className="max-h-[min(62vh,42rem)] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface-sticky)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                <tr>
                  <th className="w-[30%] px-4 py-3 font-semibold">Store brand label</th>
                  <th className="w-[12%] px-4 py-3 font-semibold">Products</th>
                  <th className="w-[25%] px-4 py-3 font-semibold">Sizing categories</th>
                  <th className="w-[33%] px-4 py-3 font-semibold">Use charts from</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredBrands.map((brand) => {
                  const canonicalName = assignments[brand.rawKey] ?? "";
                  const target = targetByKey.get(normalizeBrandKey(canonicalName));
                  const isAlias = normalizeBrandKey(canonicalName) !== brand.rawKey;
                  return (
                    <tr key={brand.rawKey} className="align-middle transition-colors hover:bg-[var(--color-brand-light)]/15">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {brand.labels[0] ?? brand.rawKey}
                        </p>
                        {brand.labels.length > 1 && (
                          <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                            Also seen as: {brand.labels.slice(1).join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--color-text-secondary)]">
                        {brand.skuCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {brand.sizingCategories.slice(0, 3).map((category) => (
                            <span
                              key={category}
                              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
                            >
                              {category}
                            </span>
                          ))}
                          {brand.sizingCategories.length > 3 && (
                            <span className="px-1 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                              +{brand.sizingCategories.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <MappingSelect
                          options={canonicalOptions}
                          value={normalizeBrandKey(canonicalName)}
                          onChange={(canonicalKey) => setCanonicalKey(brand.rawKey, canonicalKey)}
                          label={`Canonical brand for ${brand.labels[0] ?? brand.rawKey}`}
                          placeholder="Choose canonical brand…"
                          disabled={saving}
                          className="w-full py-2 text-sm"
                        />
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                          {target?.shared
                            ? "Shared chart registry match"
                            : isAlias
                              ? `Mapped to ${canonicalName || "—"}`
                              : "Keeps its own chart identity"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredBrands.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                No brands match your search.
              </div>
            )}
          </div>
        </div>
      )}

      {privateBrands.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3 text-xs">
            <span className="font-semibold text-[var(--color-text-primary)]">Your own brands</span>
            <span className="rounded-full bg-[var(--color-surface-base)] px-2.5 py-1 font-semibold text-[var(--color-text-secondary)]">
              {privateBrands.length} store labels
            </span>
            <span className="text-[var(--color-text-muted)]">→</span>
            <span className="rounded-full bg-[var(--color-warning-light)] px-2.5 py-1 font-semibold text-[var(--color-warning)]">
              {privateGroupCount} chart brand{privateGroupCount === 1 ? "" : "s"}
            </span>
            <span className="text-[var(--color-text-muted)]">
              Labels grouped here share the size charts you enter by hand.
            </span>
          </div>
          <div className="max-h-[min(50vh,32rem)] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface-sticky)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                <tr>
                  <th className="w-[30%] px-4 py-3 font-semibold">Store brand label</th>
                  <th className="w-[12%] px-4 py-3 font-semibold">Products</th>
                  <th className="w-[25%] px-4 py-3 font-semibold">Sizing categories</th>
                  <th className="w-[33%] px-4 py-3 font-semibold">Share charts with</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredPrivate.map((brand) => {
                  const ownName = brand.labels[0] ?? brand.rawKey;
                  const canonicalName = privateAssignments[brand.rawKey]?.trim() || ownName;
                  const isAlias = normalizeBrandKey(canonicalName) !== brand.rawKey;
                  return (
                    <tr key={brand.rawKey} className="align-middle transition-colors hover:bg-[var(--color-warning-light)]/15">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{ownName}</p>
                        {brand.labels.length > 1 && (
                          <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                            Also seen as: {brand.labels.slice(1).join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--color-text-secondary)]">
                        {brand.skuCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {brand.sizingCategories.slice(0, 3).map((category) => (
                            <span
                              key={category}
                              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
                            >
                              {category}
                            </span>
                          ))}
                          {brand.sizingCategories.length > 3 && (
                            <span className="px-1 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                              +{brand.sizingCategories.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <MappingSelect
                          options={privateOptions}
                          value={normalizeBrandKey(canonicalName)}
                          onChange={(canonicalKey) => setPrivateCanonicalKey(brand.rawKey, canonicalKey)}
                          label={`Chart brand for ${ownName}`}
                          placeholder="Keep its own charts"
                          disabled={saving}
                          className="w-full py-2 text-sm"
                        />
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                          {isAlias ? `Uses ${canonicalName}'s charts` : "Keeps its own charts"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredPrivate.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                No brands match your search.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
