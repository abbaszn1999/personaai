"use client";

import * as React from "react";
import { ArrowRight, Check, ChevronDown, Database, GitBranch, Loader2, Plus, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { columnKey, parseColumnKey, type CustomAttributeType } from "@/lib/catalog/acs-mapping";
import { SIZE_TYPE_LABELS } from "@/lib/sizing/size-types";
import { buildAcsRows, countMapped, isDefaultChoice, isUnmapped, toColumnOptions } from "@/modules/store/acs-rows";
import { useStoreConnectionStore } from "@/modules/store/store";
import type { CmsColumn } from "@/modules/store/types";
import { MappingSelect, type SelectOption } from "./mapping-select";
import { SizeTypePanel, type OverridableBrand } from "./size-type-panel";
import { AddCustomAttributeModal } from "./add-custom-attribute-modal";

const TYPE_OPTIONS: SelectOption[] = [
  { key: "text", label: "text" },
  { key: "number", label: "number" },
  { key: "boolean", label: "boolean" },
];

/** Which of the demo-style groups a binding came from, for the line under each dropdown — the
 *  demo's "{platform} field" caption, said accurately for the full 8-group schema. */
const GROUP_CAPTION: Record<CmsColumn["group"], string> = {
  identifiers: "product field",
  pricing_inventory: "product field",
  media_urls: "product field",
  taxonomy: "product field",
  variant_options: "variant option",
  product_custom: "custom field",
  variant_custom: "variant custom field",
  advanced: "product field",
};

/** One extra word in the caption when the bound column describes a single SKU rather than the
 *  whole product — the "Variant" badge the plan calls for, said inline rather than as a separate
 *  cell so the existing row layout doesn't have to grow a column for it. */
function scopeCaption(column: CmsColumn): string {
  return column.scope === "variant" ? `variant · ${GROUP_CAPTION[column.group]}` : GROUP_CAPTION[column.group];
}

/** The full-width band naming a group of rows, as its own table row so it spans every column. */
function SectionRow({ label, note, noteTone }: { label: string; note?: string; noteTone?: "info" | "accent" }) {
  return (
    <tr className="border-y border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
      <td colSpan={3} className="px-6 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {label}
          </span>
          {note && (
            <span
              className={cn(
                "rounded border px-2 py-0.5 text-[10px] font-semibold",
                noteTone === "accent"
                  ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-info)]/30 bg-[var(--color-info-light)] text-[var(--color-info)]"
              )}
            >
              {note}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

/** A pill in a table's header banner. */
function HeaderPill({ tone, children }: { tone: "brand" | "info" | "accent" | "success"; children: React.ReactNode }) {
  const tones = {
    brand: "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]",
    info: "border-[var(--color-info)]/30 bg-[var(--color-info-light)] text-[var(--color-info)]",
    accent: "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-accent)]",
    success: "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]",
  }[tone];

  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", tones)}>
      {children}
    </span>
  );
}

/** The mono badge every sample value sits in. */
function Sample({ value, title }: { value: string; title?: string }) {
  return (
    <span
      className="inline-block max-w-xs truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2 py-1 font-mono text-xs text-[var(--color-text-secondary)]"
      title={title ?? value}
    >
      {value}
    </span>
  );
}

/**
 * Setup Stage 1 — which of the merchant's columns feeds each field of the search index.
 *
 * A structural copy of `Documentation/store_src_demo_frontend/components/Stage1ColumnMapping.tsx`:
 * two collapsible tables with the same banners, section bands, column layout and bottom confirmation
 * bar, recolored onto this app's tokens (the demo's purple is our brand orange, its emerald our
 * success green, its indigo our accent purple) and driven by real discovered columns rather than the
 * demo's fixtures.
 *
 * Every row reads the same direction as the demo's: the ACS field is fixed on the left and the choice
 * is which of the merchant's columns arrives there. That is the inverse of what this screen used to
 * ask, and it matters beyond presentation — a merchant knows their own columns and has no reason to
 * know ACS's schema, so the fixed half belongs on the left and the question on the right.
 */
export function StageColumnMapping({
  brands = [],
  approved = false,
  onApproveAndContinue,
  actionPending = false,
  actionLabel,
}: {
  brands?: readonly OverridableBrand[];
  approved?: boolean;
  onApproveAndContinue: () => void;
  actionPending?: boolean;
  actionLabel: string;
}) {
  const platform = useStoreConnectionStore((s) => s.connection?.platform ?? "shopify");
  const columns = useStoreConnectionStore((s) => s.mapping.columns);
  const mapping = useStoreConnectionStore((s) => s.mapping.document);
  const sampled = useStoreConnectionStore((s) => s.mapping.sampled);
  const categoriesSample = useStoreConnectionStore((s) => s.mapping.categoriesSample);
  const discoveryStatus = useStoreConnectionStore((s) => s.mapping.discoveryStatus);
  const discoveryScanned = useStoreConnectionStore((s) => s.mapping.discoveryScanned);
  const savingKey = useStoreConnectionStore((s) => s.mapping.savingKey);
  const isResetting = useStoreConnectionStore((s) => s.mapping.isResetting);
  const setAcsSource = useStoreConnectionStore((s) => s.setAcsSource);
  const updateCustomAttribute = useStoreConnectionStore((s) => s.updateCustomAttribute);
  const removeCustomAttribute = useStoreConnectionStore((s) => s.removeCustomAttribute);
  const resetFieldMappings = useStoreConnectionStore((s) => s.resetFieldMappings);
  const refreshColumnCoverage = useStoreConnectionStore((s) => s.refreshColumnCoverage);
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeSettings.default);
  const overrideCount = Object.keys(useStoreConnectionStore((s) => s.storeSizeSettings.overrides)).length;

  const [isTable1Open, setIsTable1Open] = React.useState(true);
  const [isTable2Open, setIsTable2Open] = React.useState(true);
  const [isAddOpen, setIsAddOpen] = React.useState(false);

  const optionGroups = React.useMemo(
    () => columns.filter((column) => column.group === "variant_options").map((column) => column.label),
    [columns]
  );
  const rows = React.useMemo(() => buildAcsRows(mapping, optionGroups), [mapping, optionGroups]);
  const columnOptions = React.useMemo(() => toColumnOptions(columns), [columns]);
  const byKey = React.useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);

  const coreRows = rows.filter((row) => row.section === "core");
  const nativeRows = rows.filter((row) => row.section === "native");
  const stats = countMapped(rows);

  const bind = React.useCallback(
    (acsKey: string, chosen: string) => {
      // Choosing what auto-mapping already picked clears the binding rather than storing a no-op, so
      // the row stops claiming the merchant changed something.
      if (isDefaultChoice(mapping, acsKey, optionGroups, chosen)) void setAcsSource(acsKey, null);
      else void setAcsSource(acsKey, parseColumnKey(chosen));
    },
    [mapping, optionGroups, setAcsSource]
  );

  async function handleReset() {
    if (isResetting) return;
    const confirmed = window.confirm(
      "Put every ACS field back on auto-mapping and remove your custom attributes? Your saved choices will be discarded."
    );
    if (confirmed) await resetFieldMappings();
  }

  /** One ACS field's three cells. Shared by all of Table 1's sections, which differ only in accent and
   *  in what hangs off the row — the sizing panel on `sizes`, the skip callout on the chart row. */
  function acsRowCells(row: (typeof rows)[number], tone: "brand" | "info" | "accent") {
    const selectedKey = columnKey(row.ref);
    const column = byKey.get(selectedKey);
    const unmapped = isUnmapped(row);

    const fieldTone = {
      brand:
        "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]",
      info: "border-[var(--color-info)]/30 bg-[var(--color-info-light)] text-[var(--color-info)]",
      accent: "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-accent)]",
    }[tone];

    return (
      <>
        <td className="px-6 py-3.5 align-top">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-block rounded border px-2 py-0.5 font-mono text-sm font-bold", fieldTone)}>
                {row.acsPath}
              </span>
              {row.required && (
                <span className="rounded border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-error)]">
                  req
                </span>
              )}
              {row.section === "native" && (
                <span className="rounded bg-[var(--color-info-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-info)]">
                  Native
                </span>
              )}
            </div>
            <p className="max-w-xs text-[11px] leading-snug text-[var(--color-text-muted)]">{row.description}</p>
            {row.key === "sizes" && <SizeTypePanel brands={brands} />}
          </div>
        </td>

        <td className="px-6 py-3.5 align-top">
          <div className="max-w-xs space-y-1.5">
            {row.personaSourced ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-accent)]">
                  <GitBranch className="h-3.5 w-3.5" />
                  Persona Taxonomy
                </span>
                <span className="block text-[10px] italic leading-tight text-[var(--color-text-muted)]">
                  Resolved from your Categories mapping page, not a CMS column — nothing to choose here.
                </span>
              </>
            ) : (
              <>
                <MappingSelect
                  options={columnOptions}
                  label={`Store column for ${row.label}`}
                  value={selectedKey}
                  saving={savingKey === row.key}
                  placeholder="Choose a column…"
                  onChange={(chosen) => bind(row.key, chosen)}
                  className="w-full"
                />
                {unmapped ? (
                  <span className="block text-[10px] italic leading-tight text-[var(--color-text-muted)]">
                    {row.required
                      ? "Required by ACS — bind a column before indexing"
                      : "Nothing sent to search"}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                      <Check className="h-2.5 w-2.5" />
                      <span>Mapped to CMS</span>
                    </span>
                    <span className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                      {row.explicit ? "your choice" : "auto"} · {column ? scopeCaption(column) : `${platform} field`}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </td>

        <td className="px-6 py-3.5 align-top">
          <div className="space-y-1">
            {row.personaSourced ? (
              <Sample
                value={categoriesSample ? `Path: ${categoriesSample}` : "No category resolved yet"}
                title={categoriesSample ?? "Nothing in the sample maps to a Persona category yet"}
              />
            ) : (
              <Sample value={column?.sample ?? "—"} title={column?.sample ?? "nothing on the sampled products"} />
            )}
            {row.key === "sizes" && column && (
              <div className="mt-1 rounded-[var(--radius-lg)] border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] p-2 text-[11px] text-[var(--color-brand-strong)]">
                <span className="font-semibold">Read as {SIZE_TYPE_LABELS[storeSizeType]}</span>
                <div className="mt-0.5 font-mono text-[10px]">
                  {column.presence} of {sampled} sampled products carry it
                </div>
              </div>
            )}
          </div>
        </td>
      </>
    );
  }

  return (
    <div className="space-y-8 pb-6">
      {/* Minimal top sub-bar: quick expand/collapse controls. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--color-text-primary)]">ACS schema mappings</span>
          <span className="text-[var(--color-border-strong)]">·</span>
          <span>
            Google Cloud Retail (ACS) ingestion, read from{" "}
            {discoveryStatus === "done" ? "your whole catalog" : `${sampled} of your products`}
          </span>
          {approved && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-success)]">
              <Check className="h-2.5 w-2.5" /> Approved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={discoveryStatus === "running"}
            onClick={() => void refreshColumnCoverage()}
            title="Walk every product (not just the 25-sample) for real coverage numbers on every column"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-light)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {discoveryStatus === "running" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Scanning… {discoveryScanned} products</span>
              </>
            ) : (
              <>
                <ScanSearch className="h-3.5 w-3.5" />
                <span>{discoveryStatus === "done" ? "Rescan full catalog" : "Scan full catalog"}</span>
              </>
            )}
          </button>
          <span className="text-[var(--color-border-strong)]">|</span>
          <button
            type="button"
            onClick={() => {
              setIsTable1Open(true);
              setIsTable2Open(true);
            }}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-light)]"
          >
            Expand All
          </button>
          <span className="text-[var(--color-border-strong)]">|</span>
          <button
            type="button"
            onClick={() => {
              setIsTable1Open(false);
              setIsTable2Open(false);
            }}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          TABLE 1 — Main attributes (core fields + native attributes)
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isTable1Open}
          onClick={() => setIsTable1Open(!isTable1Open)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsTable1Open(!isTable1Open);
            }
          }}
          className={cn(
            "flex cursor-pointer select-none flex-col gap-3 bg-gradient-to-r from-[var(--color-brand-light)] via-[var(--color-surface-card)] to-[var(--color-surface-base)] px-6 py-4 transition-colors hover:brightness-[0.99] sm:flex-row sm:items-center sm:justify-between",
            isTable1Open && "border-b border-[var(--color-border)]"
          )}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand)] text-xs font-bold text-[var(--color-text-inverse)]">
                1
              </div>
              <h2 className="text-base font-bold tracking-tight text-[var(--color-text-primary)] sm:text-lg">
                Table 1 — Main attributes
              </h2>
              <HeaderPill tone="brand">{coreRows.length} Core fields</HeaderPill>
              <HeaderPill tone="info">{nativeRows.length} Native attributes</HeaderPill>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Google&apos;s own product schema. Each row is a field of the search index; you choose which of your
              columns arrives there.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2.5 py-1 text-xs font-semibold text-[var(--color-success)]">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
              {stats.mapped} of {stats.total} mapped
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              <span>{isTable1Open ? "Collapse" : "Expand"}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200",
                  isTable1Open && "rotate-180"
                )}
              />
            </div>
          </div>
        </div>

        {isTable1Open && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="select-none border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="w-1/3 px-6 py-3">ACS field</th>
                  <th className="w-5/12 px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-[var(--color-brand)]" />
                      <span>CMS Column (Map From)</span>
                      <span className="rounded bg-[var(--color-brand-light)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-brand-strong)]">
                        Dropdown selector
                      </span>
                    </div>
                  </th>
                  <th className="w-1/4 px-6 py-3">Sample</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] text-xs">
                <SectionRow label={`Core fields (${coreRows.length})`} />
                {coreRows.map((row) => (
                  <tr key={row.key} className="group transition-colors hover:bg-[var(--color-brand-light)]/30">
                    {acsRowCells(row, "brand")}
                  </tr>
                ))}

                <SectionRow
                  label={`Native attributes (${nativeRows.length}) — option-name resolver`}
                  note="Synonym routing active"
                  noteTone="info"
                />
                {nativeRows.map((row) => (
                  <tr
                    key={row.key}
                    className={cn(
                      "group transition-colors",
                      row.key === "sizes" ? "bg-[var(--color-brand-light)]/30" : "hover:bg-[var(--color-info-light)]/30"
                    )}
                  >
                    {acsRowCells(row, "info")}
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          TABLE 2 — Custom attributes
          ─────────────────────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] shadow-[var(--shadow-elevated)]">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isTable2Open}
          onClick={() => setIsTable2Open(!isTable2Open)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsTable2Open(!isTable2Open);
            }
          }}
          className={cn(
            "flex cursor-pointer select-none flex-col gap-3 bg-gradient-to-r from-[var(--color-success-light)] via-[var(--color-surface-card)] to-[var(--color-surface-base)] px-6 py-4 transition-colors hover:brightness-[0.99] sm:flex-row sm:items-center sm:justify-between",
            isTable2Open && "border-b border-[var(--color-border)]"
          )}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-success)] text-xs font-bold text-[var(--color-text-inverse)]">
                2
              </div>
              <h2 className="text-base font-bold tracking-tight text-[var(--color-text-primary)] sm:text-lg">
                Table 2 — Custom attributes
              </h2>
              <HeaderPill tone="success">{mapping.customAttributes.length} Defined</HeaderPill>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">
              Anything ACS has no field of its own for becomes{" "}
              <code className="rounded bg-[var(--color-success-light)] px-1 py-0.5 font-mono font-semibold text-[var(--color-success)]">
                attributes.&lt;slug&gt;
              </code>
              , searchable and facetable in its own right.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsTable2Open(true);
                setIsAddOpen(true);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-3.5 py-1.5 text-xs font-bold text-[var(--color-success)] transition-all hover:bg-[var(--color-success)]/20"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Custom Attribute</span>
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
              <span>{isTable2Open ? "Collapse" : "Expand"}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200",
                  isTable2Open && "rotate-180"
                )}
              />
            </div>
          </div>
        </div>

        {isTable2Open && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="select-none border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                    <th className="w-1/4 px-6 py-3">ACS key</th>
                    <th className="w-28 px-4 py-3">Type</th>
                    <th className="w-5/12 px-6 py-3">
                      <div className="flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-[var(--color-success)]" />
                        <span>CMS Column (Map From)</span>
                        <span className="rounded bg-[var(--color-success-light)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-success)]">
                          Dropdown
                        </span>
                      </div>
                    </th>
                    <th className="w-1/3 px-6 py-3 text-left">Sample</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-xs">
                  {mapping.customAttributes.map((attribute) => {
                    const selectedKey = columnKey(attribute.source);
                    const column = byKey.get(selectedKey);

                    return (
                      <tr
                        key={attribute.key}
                        className="group transition-colors hover:bg-[var(--color-success-light)]/30"
                      >
                        <td className="px-6 py-3.5 align-middle">
                          <div className="space-y-1">
                            <span className="inline-block rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2.5 py-1 font-mono text-sm font-bold text-[var(--color-success)]">
                              attributes.{attribute.key}
                            </span>
                            <p className="truncate text-[11px] text-[var(--color-text-muted)]">{attribute.name}</p>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-middle">
                          <MappingSelect
                            options={TYPE_OPTIONS}
                            label={`Type for ${attribute.name}`}
                            value={attribute.type}
                            compact
                            saving={savingKey === attribute.key}
                            onChange={(next) =>
                              void updateCustomAttribute(attribute.key, { type: next as CustomAttributeType })
                            }
                          />
                        </td>

                        <td className="px-6 py-3.5 align-middle">
                          <div className="max-w-sm space-y-1.5">
                            <MappingSelect
                              options={columnOptions}
                              label={`Store column for ${attribute.name}`}
                              value={selectedKey}
                              saving={savingKey === attribute.key}
                              placeholder="Choose a column…"
                              onChange={(chosen) =>
                                void updateCustomAttribute(attribute.key, { source: parseColumnKey(chosen) })
                              }
                              className="w-full"
                            />
                            {column ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                                  <Check className="h-2.5 w-2.5" />
                                  <span>Mapped to CMS</span>
                                </span>
                                <span className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                                  {scopeCaption(column)}
                                </span>
                              </div>
                            ) : (
                              <span className="block text-[10px] italic text-[var(--color-text-muted)]">
                                Nothing bound — the attribute is declared but empty
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-3.5 align-middle">
                          <div className="flex max-w-xs items-center gap-2">
                            <span
                              className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-secondary)]"
                              title={column?.sample ?? "nothing on the sampled products"}
                            >
                              {column?.sample ?? "—"}
                            </span>
                            <button
                              type="button"
                              onClick={() => void removeCustomAttribute(attribute.key)}
                              title={`Delete attributes.${attribute.key}`}
                              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {mapping.customAttributes.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="bg-[var(--color-surface-base)]/50 py-6 text-center text-xs italic text-[var(--color-text-muted)]"
                      >
                        No custom attributes defined. Click &quot;+ Add Custom Attribute&quot; to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-3 text-xs text-[var(--color-text-muted)]">
              <span>
                Custom attributes append to the product payload under{" "}
                <code className="font-mono text-[var(--color-success)]">attributes.&lt;slug&gt;</code>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsTable2Open(true);
                  setIsAddOpen(true);
                }}
                className="cursor-pointer font-bold text-[var(--color-success)] underline transition-opacity hover:opacity-80"
              >
                + Add New Custom Attribute
              </button>
            </div>
          </>
        )}
      </section>

      {/* Global bottom confirmation bar. */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-6 shadow-[var(--shadow-elevated)] sm:flex-row">
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-success)]" />
            <span className="text-sm font-bold text-[var(--color-text-primary)]">
              {stats.mapped} of {stats.total} ACS fields mapped + {mapping.customAttributes.length} custom attributes
              aligned
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Default sizing system:{" "}
            <strong className="text-[var(--color-brand)]">{SIZE_TYPE_LABELS[storeSizeType]}</strong>
            {overrideCount > 0 && ` (${overrideCount} brand ${overrideCount === 1 ? "exception" : "exceptions"})`} ·
            Schema ready for catalog item ingestion
          </p>
        </div>

        <div className="flex w-full items-center gap-2.5 sm:w-auto">
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={isResetting}
            title="Put every field back on auto-mapping"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3.5 py-3 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-[var(--color-text-muted)]", isResetting && "animate-spin")} />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={onApproveAndContinue}
            disabled={actionPending}
            className="gradient-brand inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--shadow-glow)] transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-initial"
          >
            {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{actionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AddCustomAttributeModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} columns={columns} />
    </div>
  );
}
