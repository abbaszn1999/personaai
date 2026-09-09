"use client";

import * as React from "react";
import { ArrowRight, Layers, ListTree, Loader2, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { buildFieldRows, type MappingFieldRow } from "@/modules/store/mapping-fields";
import { useStoreConnectionStore } from "@/modules/store/store";
import { SIZE_TYPE_LABELS } from "@/lib/sizing/size-types";
import { SizeTypePanel, type OverridableBrand } from "./size-type-panel";
import type { MappingPreviewSample, OptionGroupInfo, OptionRole, VariantRole } from "@/modules/store/types";

/** Exposed so Stage 1's header banner can show the same "N of M fields mapped" stat the table
 *  footer does, without either place recomputing `buildFieldRows` on its own. */
export function countMappedFields(rows: MappingFieldRow[]): { mapped: number; total: number } {
  return { mapped: rows.filter((row) => !row.notSent).length, total: rows.length };
}

const ROLE_LABELS: Record<OptionRole, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  pattern: "Pattern",
  gender: "Gender",
  age_group: "Age group",
  brand: "Brand",
  ignore: "Don't send",
  custom: "Custom attribute",
};

const SELECTABLE_ROLES: VariantRole[] = [
  "color",
  "size",
  "material",
  "pattern",
  "gender",
  "age_group",
  "brand",
  "ignore",
];

function sampleTabLabel(sample: MappingPreviewSample, index: number): string {
  const title = sample.raw.title;
  return typeof title === "string" && title.length > 0 ? title : `Product ${index + 1}`;
}

/**
 * One row per `variantOptions` group the merchant's own catalog uses, each with a destination they
 * can change.
 *
 * Lives here rather than in a table of its own so a merchant sees their choice and its consequence
 * in one place: pointing "Talla" at `size` makes the Size row above start showing Talla's values,
 * which is the only way to confirm the reassignment took without reading the index back.
 *
 * Every discovered group is listed, including ones already resolving to a real ACS field — the
 * select cannot live on the field rows above, because a group that resolves to `size` stops being a
 * leftover row and would take its own control with it, leaving no way to change the choice back.
 */
function OptionGroupSection({
  groups,
  optionRoles,
  savingGroup,
  onRoleChange,
  brands,
}: {
  groups: OptionGroupInfo[];
  optionRoles: Record<string, VariantRole>;
  savingGroup: string | null;
  onRoleChange: (normalized: string, role: VariantRole | null) => void;
  brands: readonly OverridableBrand[];
}) {
  if (groups.length === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-y border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        <span className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-[var(--color-brand)]" />
          Your store&apos;s option groups
        </span>
        <span className="text-[10px] font-normal normal-case text-[var(--color-text-muted)]">
          Change where a group is sent
        </span>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {groups.map((group) => {
          const override = optionRoles[group.normalized];
          const isOverridden = override !== undefined && override !== group.defaultRole;
          const isSaving = savingGroup === group.normalized;
          // Doc Part 2 hangs off whichever group actually carries the sizes, so it follows a
          // reassignment: point "Talla" at Size and the sizing-system question moves with it.
          const isSizeGroup = (override ?? group.defaultRole) === "size";

          return (
            <div
              key={group.normalized}
              className={cn(
                "grid grid-cols-1 gap-4 px-6 py-4 transition-colors md:grid-cols-12",
                isSizeGroup ? "items-start bg-[var(--color-brand-light)]/20" : "items-center hover:bg-[var(--color-brand-light)]/30"
              )}
            >
              <div className="space-y-1 md:col-span-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-[var(--color-text-primary)]">{group.name}</span>
                  {isOverridden && (
                    <Badge variant="default" className="px-1.5 py-0 text-[9px]">
                      Changed
                    </Badge>
                  )}
                </div>
                <p className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                  <Sparkles className="h-2.5 w-2.5" />
                  Auto-detected as {ROLE_LABELS[group.defaultRole]}
                </p>

                {isSizeGroup && <SizeTypePanel brands={brands} />}
              </div>

              <div className="hidden justify-center text-[var(--color-text-muted)] md:col-span-1 md:flex">
                <ArrowRight className="h-4 w-4" />
              </div>

              <div className="relative md:col-span-6">
                <select
                  value={override ?? "auto"}
                  disabled={isSaving}
                  onChange={(event) =>
                    onRoleChange(
                      group.normalized,
                      event.target.value === "auto" ? null : (event.target.value as VariantRole)
                    )
                  }
                  className={cn(
                    "w-full appearance-none rounded-[var(--radius-lg)] border px-3.5 py-2.5 pr-10 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-[var(--color-brand)]/35 disabled:opacity-60",
                    isOverridden
                      ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-light)] text-[var(--color-text-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
                  )}
                >
                  <option value="auto">Auto-detect ({ROLE_LABELS[group.defaultRole]})</option>
                  {SELECTABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--color-text-muted)]">
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Field-by-field view of how a real product from the merchant's store maps onto AI Commerce Search:
 * store field and sample value on the left, arrow, destination on the right.
 *
 * The destination cells are locked pills because they are the *consequence* of the mapping, not the
 * mapping itself — the one genuine per-store choice is which option group means which ACS field,
 * and that is made in the section beneath. Scalar fields (title, price, images) come from a single
 * well-defined store property with nothing to disambiguate.
 */
export function MappingFieldTable({
  samples,
  brands = [],
}: {
  samples: MappingPreviewSample[];
  /** Discovered brands, for the Part 2 per-brand sizing exceptions. Empty before the scan has run,
   *  which the panel says rather than offering a list it cannot populate. */
  brands?: readonly OverridableBrand[];
}) {
  const [selected, setSelected] = React.useState(0);
  const groups = useStoreConnectionStore((s) => s.mapping.groups);
  const optionRoles = useStoreConnectionStore((s) => s.mapping.optionRoles);
  const savingGroup = useStoreConnectionStore((s) => s.mapping.savingGroup);
  const setOptionRole = useStoreConnectionStore((s) => s.setOptionRole);
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeType);
  const overrideCount = Object.keys(useStoreConnectionStore((s) => s.storeSizeTypeOverrides)).length;

  // Clamp rather than reset: a re-fetch that returns fewer samples (say, after narrowing the
  // category selection) shouldn't yank the merchant back to product 1 mid-review.
  const activeIndex = Math.min(selected, Math.max(samples.length - 1, 0));
  const activeSample = samples[activeIndex];

  if (!activeSample) return null;

  const rows = buildFieldRows(activeSample, optionRoles);
  const { mapped: mappedCount } = countMappedFields(rows);

  return (
    <div className="space-y-3">
      {samples.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {samples.map((sample, index) => (
            <button
              key={index}
              onClick={() => setSelected(index)}
              title={sampleTabLabel(sample, index)}
              className={cn(
                "max-w-[10rem] truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                index === activeIndex
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
              )}
            >
              {sampleTabLabel(sample, index)}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        {/* Column headers */}
        <div className="grid grid-cols-1 gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] md:grid-cols-12">
          <div className="flex items-center gap-2 md:col-span-5">
            <Layers className="h-4 w-4 text-[var(--color-brand)]" />
            Your Store Field
          </div>
          <div className="hidden md:col-span-1 md:flex" />
          <div className="flex items-center justify-between md:col-span-6">
            <span>Sent to Search (ACS)</span>
            <span className="flex items-center gap-1 text-[10px] font-normal normal-case text-[var(--color-text-muted)]">
              <Lock className="h-3 w-3" /> Destination schema
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "grid grid-cols-1 items-center gap-4 px-6 py-4 transition-colors md:grid-cols-12",
                row.notSent ? "bg-[var(--color-surface-base)]/50 opacity-70" : "hover:bg-[var(--color-brand-light)]/30"
              )}
            >
              {/* Left: your store field + sample value */}
              <div className="space-y-1 md:col-span-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-[var(--color-text-primary)]">{row.label}</span>
                  {row.internal && (
                    <Badge variant="neutral" className="px-1.5 py-0 text-[9px]">
                      Internal
                    </Badge>
                  )}
                  {!row.internal && !row.notSent && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                      <Sparkles className="h-2.5 w-2.5" /> Auto-mapped
                    </span>
                  )}
                </div>
                <div className="inline-block max-w-full truncate rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1 font-mono text-xs text-[var(--color-text-muted)]">
                  <span className="mr-1.5 text-[10px] text-[var(--color-text-muted)]">Sample:</span>
                  <span className="text-[var(--color-text-secondary)]">{row.storeValue}</span>
                </div>
                {row.storePath && (
                  <p className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">{row.storePath}</p>
                )}
              </div>

              {/* Center: arrow */}
              <div className="hidden justify-center text-[var(--color-text-muted)] md:col-span-1 md:flex">
                <ArrowRight className="h-4 w-4" />
              </div>

              {/* Right: locked destination pill */}
              <div className="md:col-span-6">
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-3.5 py-2.5",
                    row.notSent
                      ? "border-[var(--color-border)] bg-[var(--color-surface-base)]"
                      : "border-[var(--color-brand)]/25 bg-[var(--color-brand-light)]"
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold",
                        row.notSent ? "italic text-[var(--color-text-muted)]" : "text-[var(--color-text-primary)]"
                      )}
                    >
                      {row.acsValue}
                    </p>
                    {!row.notSent && (
                      <p className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">{row.acsPath}</p>
                    )}
                  </div>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <OptionGroupSection
          groups={groups}
          optionRoles={optionRoles}
          savingGroup={savingGroup}
          onRoleChange={(normalized, role) => void setOptionRole(normalized, role)}
          brands={brands}
        />

        {/* Footer bar */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
            <span>
              <strong className="font-semibold text-[var(--color-text-primary)]">
                {mappedCount} of {rows.length}
              </strong>{" "}
              fields mapped to destination schema.
              <span className="ml-1.5 font-semibold text-[var(--color-brand)]">
                Sizes read as {SIZE_TYPE_LABELS[storeSizeType]}
                {overrideCount > 0 &&
                  `, ${overrideCount} brand ${overrideCount === 1 ? "exception" : "exceptions"}`}
                .
              </span>
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Rows marked{" "}
            <Badge variant="neutral" className="px-1.5 py-0 text-[9px]">
              Internal
            </Badge>{" "}
            keep your catalog isolated in search — they are not fields your store sends.
          </p>
        </div>
      </div>
    </div>
  );
}
