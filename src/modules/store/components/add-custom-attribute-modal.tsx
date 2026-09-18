"use client";

import * as React from "react";
import { Plus, Sliders } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { parseColumnKey, type CustomAttributeType } from "@/lib/catalog/acs-mapping";
import { sanitizeAttributeKeySegment } from "@/lib/catalog/option-groups";
import { toColumnOptions } from "@/modules/store/acs-rows";
import { useStoreConnectionStore } from "@/modules/store/store";
import type { CmsColumn } from "@/modules/store/types";
import { MappingSelect, type SelectOption } from "./mapping-select";

const TYPE_OPTIONS: SelectOption[] = [
  { key: "text", label: "text (String)" },
  { key: "number", label: "number (Decimal / Int)" },
  { key: "boolean", label: "boolean (True / False)" },
];

/**
 * Table 2's "Add Custom Attribute" dialog, laid out like
 * `Documentation/store_src_demo_frontend/components/AddCustomAttributeModal.tsx`'s two two-column
 * rows — Attribute Name beside ACS Key, Data Type beside the CMS mapping — on this app's tokens.
 *
 * One deliberate difference in what each field *does*, not in where it sits: the demo's ACS Key is
 * retyped free-hand and its "Sample Value" is whatever the merchant types. Neither is real data here.
 * The key is shown rather than asked, because it is a pure function of the name
 * (`sanitizeAttributeKeySegment`, the same one the mapper writes attributes with) — a second field
 * that could disagree with the first would just be a way to declare a key nothing will ever write to.
 * The sample is read from the column the merchant picks rather than typed, because a value neither of
 * us invented is worth more than one either of us could have made up.
 */
export function AddCustomAttributeModal({
  isOpen,
  onClose,
  columns,
}: {
  isOpen: boolean;
  onClose: () => void;
  columns: readonly CmsColumn[];
}) {
  const addCustomAttribute = useStoreConnectionStore((s) => s.addCustomAttribute);
  const isSaving = useStoreConnectionStore((s) => s.mapping.isAddingCustomAttribute);

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<CustomAttributeType>("text");
  const [sourceKey, setSourceKey] = React.useState("unmapped");
  const [error, setError] = React.useState<string | null>(null);

  const columnOptions = React.useMemo(() => toColumnOptions(columns), [columns]);
  const slug = sanitizeAttributeKeySegment(name);
  const acsKey = slug ? `attributes.${slug}` : "";
  const sample = columns.find((column) => column.key === sourceKey)?.sample ?? null;

  // Reset happens on close rather than in an effect keyed on `isOpen`: `Modal` unmounts its body while
  // closed, so there is nothing visibly stale to flash between one close and the next open — the only
  // requirement is that the fields are empty by then, which a plain handler guarantees without a
  // render-triggering effect.
  function handleClose() {
    setName("");
    setType("text");
    setSourceKey("unmapped");
    setError(null);
    onClose();
  }

  async function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (isSaving) return;
    if (!slug) {
      setError("Give the attribute a name with at least one letter or number");
      return;
    }
    const result = await addCustomAttribute({ name, type, source: parseColumnKey(sourceKey) });
    if (result) {
      setError(result);
      return;
    }
    handleClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Custom Attribute"
      description="Send a column ACS has no field of its own for"
      icon={<Sliders className="h-4 w-4" />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={isSaving || !slug}>
            <Plus className="h-3.5 w-3.5" />
            {isSaving ? "Adding…" : "Add to Table 2"}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-xs font-medium text-[var(--color-error)]">
            {error}
          </div>
        )}

        {/* Row 1: Attribute Name | ACS Key */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="custom-attr-name" className="mb-1 block text-xs font-bold text-[var(--color-text-primary)]">
              Attribute Name
            </label>
            <input
              id="custom-attr-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Closure Type, Rise, Fit"
              className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
            />
            <span className="mt-1 block text-[10px] text-[var(--color-text-muted)]">Human-readable option title</span>
          </div>

          <div>
            <label htmlFor="custom-attr-key" className="mb-1 block text-xs font-bold text-[var(--color-text-primary)]">
              ACS Key
            </label>
            <input
              id="custom-attr-key"
              type="text"
              readOnly
              value={acsKey}
              placeholder="attributes.<name>"
              title="Generated from the attribute name — the mapper writes this key, so it can't disagree with the name"
              className="w-full cursor-not-allowed rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2 font-mono text-sm text-[var(--color-brand-strong)] outline-none"
            />
            <span className="mt-1 block text-[10px] text-[var(--color-text-muted)]">Generated from the name</span>
          </div>
        </div>

        {/* Row 2: Data Type | Store column (map from) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-primary)]">Data Type</span>
            <MappingSelect
              options={TYPE_OPTIONS}
              label="Attribute value type"
              value={type}
              onChange={(next) => setType(next as CustomAttributeType)}
              className="w-full"
            />
          </div>

          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-primary)]">Store column (map from)</span>
            <MappingSelect
              options={columnOptions}
              label="Store column feeding this attribute"
              value={sourceKey}
              placeholder="Choose a column…"
              onChange={setSourceKey}
              className="w-full"
            />
          </div>
        </div>

        <p className="text-[10px] text-[var(--color-text-muted)]">
          {sample
            ? <>Sample value on your catalog: <span className="font-mono text-[var(--color-text-secondary)]">&quot;{sample}&quot;</span></>
            : "Searchable and facetable once it carries a real value. You can bind the column later."}
        </p>
      </form>
    </Modal>
  );
}
