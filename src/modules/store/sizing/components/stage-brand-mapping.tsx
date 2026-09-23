"use client";

import * as React from "react";
import { ArrowRightLeft, Check, Loader2, Plus, RotateCcw, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeBrandKey } from "@/lib/sizing/keys";
import { useSizingStore } from "../store";
import type {
  BrandMappingResponse,
  BrandMappingStatus,
  CanonicalBrandGroup,
} from "../server-types";
import { StageHeaderBanner } from "./stage-header-banner";

function cloneGroups(groups: readonly CanonicalBrandGroup[]): CanonicalBrandGroup[] {
  return groups.map((group) => ({ ...group, rawKeys: [...group.rawKeys] }));
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

  if (status === "rescanning") {
    return (
      <div className="space-y-4">
        <StageHeaderBanner
          stageNumber={4}
          eyebrow="Canonical brand mapping"
          title="Applying your brand mapping"
          description="The catalog is being rescanned under the canonical brand keys. Chart research will appear here when coverage is rebuilt."
        />
        <div className="flex items-center justify-center gap-3 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-10 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Merging aliases and rebuilding chart coverage…
        </div>
      </div>
    );
  }

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
  const [groups, setGroups] = React.useState<CanonicalBrandGroup[]>(() => cloneGroups(mapping.groups));

  const brandByKey = new Map(mapping.brands.map((brand) => [brand.rawKey, brand]));

  const renameGroup = (index: number, canonicalName: string) => {
    setGroups((current) =>
      current.map((group, groupIndex) =>
        groupIndex === index
          ? { ...group, canonicalName, canonicalKey: normalizeBrandKey(canonicalName), shared: false }
          : group,
      ),
    );
  };

  const selectTarget = (index: number, canonicalKey: string) => {
    const target = mapping?.targets.find((item) => item.canonicalKey === canonicalKey);
    if (!target) return;
    setGroups((current) =>
      current.map((group, groupIndex) =>
        groupIndex === index
          ? { ...group, canonicalKey: target.canonicalKey, canonicalName: target.canonicalName, shared: target.shared }
          : group,
      ),
    );
  };

  const moveAlias = (rawKey: string, targetIndex: number) => {
    setGroups((current) =>
      current
        .map((group, index) => ({
          ...group,
          rawKeys: index === targetIndex
            ? [...new Set([...group.rawKeys, rawKey])]
            : group.rawKeys.filter((key) => key !== rawKey),
        }))
        .filter((group) => group.rawKeys.length > 0),
    );
  };

  const splitAlias = (rawKey: string) => {
    const brand = brandByKey.get(rawKey);
    const canonicalName = brand?.labels[0] ?? rawKey;
    setGroups((current) => [
      ...current
        .map((group) => ({ ...group, rawKeys: group.rawKeys.filter((key) => key !== rawKey) }))
        .filter((group) => group.rawKeys.length > 0),
      {
        canonicalKey: rawKey,
        canonicalName,
        rawKeys: [rawKey],
        shared: false,
      },
    ]);
  };

  const addGroup = () => {
    const unassigned = mapping?.brands.find((brand) => !groups.some((group) => group.rawKeys.includes(brand.rawKey)));
    if (!unassigned) return;
    setGroups((current) => [
      ...current,
      {
        canonicalKey: unassigned.rawKey,
        canonicalName: unassigned.labels[0] ?? unassigned.rawKey,
        rawKeys: [unassigned.rawKey],
        shared: false,
      },
    ]);
  };

  const assigned = new Set(groups.flatMap((group) => group.rawKeys));
  const complete =
    mapping !== null &&
    mapping.brands.every((brand) => assigned.has(brand.rawKey)) &&
    groups.every((group) => group.rawKeys.length > 0 && group.canonicalKey && group.canonicalName.trim());

  return (
    <div className="space-y-4">
      <StageHeaderBanner
        stageNumber={4}
        eyebrow="Canonical brand mapping"
        title="Confirm which store labels are the same brand"
        description="These decisions are saved only for this store. Every product will be rescanned under the selected canonical chart key before research becomes available."
        actions={
          <>
            {editing && status === "ready" && (
              <Button variant="ghost" size="sm" onClick={closeEditor} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => mapping && setGroups(cloneGroups(mapping.groups))} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset suggestions
            </Button>
            <Button size="sm" onClick={() => void save(groups)} disabled={!complete || saving}>
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

      {groups.length === 0 ? (
        <div className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 text-sm text-[var(--color-text-secondary)]">
          No global brand labels need grouping. Save the empty mapping to continue.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group, groupIndex) => (
            <section
              key={`${group.canonicalKey}-${groupIndex}`}
              className="space-y-4 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card)]"
            >
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--color-text-muted)]">Canonical brand</label>
                <input
                  value={group.canonicalName}
                  onChange={(event) => renameGroup(groupIndex, event.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                />
                {mapping && mapping.targets.length > 0 && (
                  <select
                    value={mapping.targets.some((target) => target.canonicalKey === group.canonicalKey) ? group.canonicalKey : ""}
                    onChange={(event) => selectTarget(groupIndex, event.target.value)}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 text-xs text-[var(--color-text-secondary)]"
                  >
                    <option value="">New canonical brand</option>
                    {mapping.targets.map((target) => (
                      <option key={target.canonicalKey} value={target.canonicalKey}>
                        {target.canonicalName}{target.shared ? " — shared chart registry" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                {group.rawKeys.map((rawKey) => {
                  const brand = brandByKey.get(rawKey);
                  return (
                    <div key={rawKey} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {brand?.labels.join(" / ") ?? rawKey}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {(brand?.skuCount ?? 0).toLocaleString()} items
                            {brand?.sizingCategories.length ? ` · ${brand.sizingCategories.join(", ")}` : ""}
                          </p>
                        </div>
                        {group.rawKeys.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => splitAlias(rawKey)}>
                            <Split className="h-3.5 w-3.5" /> Separate
                          </Button>
                        )}
                      </div>
                      {groups.length > 1 && (
                        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          Move to
                          <select
                            value={groupIndex}
                            onChange={(event) => moveAlias(rawKey, Number(event.target.value))}
                            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-1.5 text-xs"
                          >
                            {groups.map((target, targetIndex) => (
                              <option key={`${target.canonicalKey}-${targetIndex}`} value={targetIndex}>
                                {target.canonicalName}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {mapping && assigned.size < mapping.brands.length && (
        <Button variant="secondary" size="sm" onClick={addGroup}>
          <Plus className="h-3.5 w-3.5" /> Add unassigned brand group
        </Button>
      )}
    </div>
  );
}
