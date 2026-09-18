"use client";

import * as React from "react";
import { ChevronDown, Globe2, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SIZE_TYPES, SIZE_TYPE_EXAMPLES, SIZE_TYPE_LABELS, isSizeType, type SizeType } from "@/lib/sizing/size-types";
import { useStoreConnectionStore } from "@/modules/store/store";
import { MappingSelect, type SelectOption } from "./mapping-select";

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
  const storeSizeType = useStoreConnectionStore((s) => s.storeSizeSettings.default);
  const overrides = useStoreConnectionStore((s) => s.storeSizeSettings.overrides);
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
    async (next: Parameters<typeof saveSizeTypes>[0]) => {
      setSaving(true);
      await saveSizeTypes(next);
      setSaving(false);
    },
    [saveSizeTypes]
  );

  function addOverride() {
    if (!brandToAdd) return;
    void commit({ overrides: { ...overrides, [brandToAdd]: systemToAdd } });
    setBrandToAdd("");
  }

  function removeOverride(brandKey: string) {
    const next = { ...overrides };
    delete next[brandKey];
    void commit({ overrides: next });
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] px-2.5 py-1 text-xs font-semibold">
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />
          <span className="font-bold text-[var(--color-text-primary)]">Sizing type:</span>
          <SizeTypeSelect
            value={storeSizeType}
            onChange={(system) => void commit({ default: system })}
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
                      onChange={(next) => void commit({ overrides: { ...overrides, [brandKey]: next } })}
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

          {/* A picked brand, never a free-text box: exceptions are stored under a normalized brand
              key, so a typed name that is one character off saves cleanly and then silently matches
              no SKU. Empty only when the sampled products carry no brand at all. */}
          {brands.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Your store lists no brands, so there is nothing to attach an exception to. Point a field
              at <span className="font-semibold">Brand</span> above if your catalog keeps it somewhere
              unexpected.
            </p>
          ) : (
            unassigned.length > 0 && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <MappingSelect
                  compact
                  className="min-w-0 flex-1"
                  options={unassigned.map((brand) => ({ key: brand.brandKey, label: brand.name }))}
                  value={brandToAdd}
                  placeholder="Pick a brand…"
                  label="Brand to override"
                  onChange={setBrandToAdd}
                />

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

/** Each system with its own labels underneath, because "US sizing" and "UK sizing" are
 *  indistinguishable as names — the examples are what let a merchant recognize their own column. */
const SIZE_TYPE_OPTIONS: SelectOption[] = SIZE_TYPES.map((system) => ({
  key: system,
  label: SIZE_TYPE_LABELS[system],
  hint: SIZE_TYPE_EXAMPLES[system],
}));

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
    <MappingSelect
      compact
      options={SIZE_TYPE_OPTIONS}
      value={value}
      label={ariaLabel}
      onChange={(next) => {
        if (isSizeType(next)) onChange(next);
      }}
    />
  );
}
