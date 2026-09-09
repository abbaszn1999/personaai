"use client";

import * as React from "react";
import { ChevronDown, Globe2, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  SIZE_TYPES,
  SIZE_TYPE_EXAMPLES,
  SIZE_TYPE_LABELS,
  isSizeType,
  type SizeType,
  type SizeTypeOverrides,
} from "@/lib/sizing/size-types";
import { useStoreConnectionStore } from "@/modules/store/store";

/** A brand the scan discovered, as this panel needs it: a stable key to store the override against
 *  and a name to show. */
export interface OverridableBrand {
  brandKey: string;
  name: string;
}

/**
 * Doc Part 2 — the merchant declares which sizing system their own size labels are written in.
 *
 * Attached to the option group that resolves to `size` rather than given a section of its own,
 * because the question only makes sense next to the actual labels: "is `38` an EU size or a waist
 * measurement" is unanswerable in the abstract and obvious while looking at the column.
 *
 * Deliberately not a conversion setting. The doc drops the old requirement to generate US, UK and EU
 * charts simultaneously, so choosing EU here does not synthesise the other two — it says which
 * column of a brand's published guide this catalog's labels line up with.
 */
export function SizeTypePanel({ brands }: { brands: readonly OverridableBrand[] }) {
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeType);
  const overrides = useStoreConnectionStore((s) => s.storeSizeTypeOverrides);
  const saveSizeTypes = useStoreConnectionStore((s) => s.saveSizeTypes);

  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [brandToAdd, setBrandToAdd] = React.useState("");
  const [systemToAdd, setSystemToAdd] = React.useState<SizeType>("EU");

  const nameFor = React.useCallback(
    (brandKey: string) => brands.find((b) => b.brandKey === brandKey)?.name ?? brandKey,
    [brands]
  );

  const active = Object.entries(overrides).filter(([, system]) => isSizeType(system)) as [
    string,
    SizeType,
  ][];
  const unassigned = brands.filter((brand) => !(brand.brandKey in overrides));

  const commit = React.useCallback(
    async (next: { storeSizeType?: SizeType; storeSizeTypeOverrides?: SizeTypeOverrides }) => {
      setSaving(true);
      await saveSizeTypes(next);
      setSaving(false);
    },
    [saveSizeTypes]
  );

  function addOverride() {
    if (!brandToAdd) return;
    void commit({ storeSizeTypeOverrides: { ...overrides, [brandToAdd]: systemToAdd } });
    setBrandToAdd("");
  }

  function removeOverride(brandKey: string) {
    const next = { ...overrides };
    delete next[brandKey];
    void commit({ storeSizeTypeOverrides: next });
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2.5 py-1 text-xs font-semibold">
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />
          <span className="font-bold text-[var(--color-text-primary)]">Sizing type:</span>
          <SizeTypeSelect
            value={storeSizeType}
            onChange={(system) => void commit({ storeSizeType: system })}
            ariaLabel="The sizing system this store's size labels use"
          />
          {saving && <Loader2 className="h-3 w-3 animate-spin text-[var(--color-text-muted)]" />}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
            active.length > 0 || open
              ? "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-text-primary)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
          )}
        >
          <Settings2 className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          Brand exceptions
          <span className="text-[10px] font-normal text-[var(--color-text-muted)]">(optional)</span>
          {active.length > 0 && (
            <span className="rounded-full bg-[var(--color-brand)] px-1.5 text-[10px] font-bold text-[var(--color-text-inverse)]">
              {active.length}
            </span>
          )}
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        {SIZE_TYPE_EXAMPLES[storeSizeType]}. Persona matches this column of each brand&apos;s guide —
        it does not convert your labels into other systems.
      </p>

      {open && (
        <div className="space-y-2 rounded-xl border border-[var(--color-brand)]/25 bg-[var(--color-surface-base)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">
              Brands labelled differently
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              Only for brands that don&apos;t use {SIZE_TYPE_LABELS[storeSizeType]}
            </span>
          </div>

          {active.length > 0 ? (
            <div className="space-y-1.5">
              {active.map(([brandKey, system]) => (
                <div
                  key={brandKey}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate font-bold text-[var(--color-text-primary)]">
                    {nameFor(brandKey)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <SizeTypeSelect
                      value={system}
                      onChange={(next) =>
                        void commit({ storeSizeTypeOverrides: { ...overrides, [brandKey]: next } })
                      }
                      ariaLabel={`Sizing system for ${nameFor(brandKey)}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeOverride(brandKey)}
                      title={`Put ${nameFor(brandKey)} back on the store default`}
                      aria-label={`Remove the sizing override for ${nameFor(brandKey)}`}
                      className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-error)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-card)] py-2 text-center text-[11px] italic text-[var(--color-text-muted)]">
              No exceptions. Every brand is read as {SIZE_TYPE_LABELS[storeSizeType]}.
            </p>
          )}

          {/* Brands come from the scan, so before it runs there is nothing honest to list — offering
              a free-text brand box here would invite a typo that silently never matches a SKU. */}
          {brands.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Your brands appear here once the catalog has been read in Stage 2.
            </p>
          ) : (
            unassigned.length > 0 && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <select
                  value={brandToAdd}
                  onChange={(event) => setBrandToAdd(event.target.value)}
                  aria-label="Brand to override"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
                >
                  <option value="">Pick a brand…</option>
                  {unassigned.map((brand) => (
                    <option key={brand.brandKey} value={brand.brandKey}>
                      {brand.name}
                    </option>
                  ))}
                </select>

                <SizeTypeSelect
                  value={systemToAdd}
                  onChange={setSystemToAdd}
                  ariaLabel="Sizing system for the brand being added"
                />

                <button
                  type="button"
                  disabled={!brandToAdd}
                  onClick={addOverride}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-brand)] px-3 py-1 text-xs font-bold text-[var(--color-text-inverse)] transition-transform hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Five options with no icons and no per-option color, so a plain select is the right control here —
 *  unlike the parent-category picker, whose options carry meaning a native list cannot render. */
function SizeTypeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: SizeType;
  onChange: (value: SizeType) => void;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value as SizeType)}
      className="cursor-pointer rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-card)] px-2 py-0.5 text-xs font-bold text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
    >
      {SIZE_TYPES.map((system) => (
        <option key={system} value={system}>
          {SIZE_TYPE_LABELS[system]}
        </option>
      ))}
    </select>
  );
}
