"use client";

import * as React from "react";
import Image from "next/image";
import { PencilLine, Check, Plus, Trash2, ImageOff, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import { useSizingStore } from "../store";
import type { GapItem } from "../types";

/**
 * Hand-fills the size chart for stock nothing could research — a store's own label, or products
 * with no brand at all.
 *
 * The grid opens pre-filled with a plausible baseline for the category rather than blank. A
 * merchant correcting numbers against a garment they have on hand will finish; one facing an empty
 * table abandons setup, and abandoned setup means the fit filter has nothing to work with.
 */
export function GapFillModal({
  onSave,
}: {
  /** The Sync tab keeps its delta gaps in local state rather than the pipeline store. */
  onSave?: (item: GapItem) => void;
} = {}) {
  const item = useSizingStore((s) => s.gapModalItem);

  if (!item) return null;

  // Keyed on the gap so opening a different one remounts with fresh rows. Seeding through an
  // effect instead would leave one render showing the previous gap's numbers.
  return <GapFillForm key={item.id} item={item} onSave={onSave} />;
}

function GapFillForm({
  item,
  onSave,
}: {
  item: GapItem;
  onSave?: (item: GapItem) => void;
}) {
  const close = useSizingStore((s) => s.closeGapModal);
  const saveToStore = useSizingStore((s) => s.saveGapItem);

  // Edits are discarded on close, matching the Cancel button rather than quietly keeping
  // half-finished numbers around.
  const [rows, setRows] = React.useState<Record<string, string>[]>(() =>
    item.rows.map((row) => ({ ...row }))
  );

  const [sizeColumn, ...measurementColumns] = item.columns;

  function updateCell(rowIndex: number, column: string, value: string) {
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row))
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      Object.fromEntries(item.columns.map((column) => [column, ""])),
    ]);
  }

  function removeRow(rowIndex: number) {
    setRows((current) => current.filter((_, index) => index !== rowIndex));
  }

  function handleSave() {
    const filled: GapItem = { ...item, rows, status: "complete" };
    if (onSave) onSave(filled);
    else saveToStore(filled);
    close();
  }

  // A row with a label but no measurements is worse than no row: it would resolve a size to an
  // empty range, which silently matches nobody.
  const hasEmptyMeasurement = rows.some((row) =>
    measurementColumns.some((column) => !row[column]?.trim())
  );

  return (
    <Modal
      isOpen
      onClose={close}
      size="xl"
      icon={<PencilLine className="h-4 w-4" />}
      title={item.title}
      description={`${item.categoryPath} · ${item.skuCount.toLocaleString()} items depend on this chart`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={rows.length === 0 || hasEmptyMeasurement}>
            <Check className="h-3.5 w-3.5" /> Save chart
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.type === "brand" ? "warning" : "neutral"}>
          {item.type === "brand" ? "Private label" : "Unbranded"}
        </Badge>
        <Badge variant="neutral">{item.brandName}</Badge>
        {item.isInheritedFromSetup && (
          <Badge variant="info">
            {item.inheritedFromSetupLabel ?? "Reused from setup"}
            {item.inheritedSetupDate && ` · ${item.inheritedSetupDate}`}
          </Badge>
        )}
      </div>

      {item.sampleProducts.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Items in this group
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.sampleProducts.map((product) => (
              <SampleChip key={product.sku} {...product} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <p className="text-xs text-[var(--color-text-muted)]">
          Enter the <strong>body measurements</strong> each size is meant to fit, in centimetres —
          not the garment&apos;s own measurements. Ranges like <code>96-104</code> work, and are
          better than a single number.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--color-surface-elevated)]">
              {item.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                >
                  {column}
                </th>
              ))}
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {item.columns.map((column) => (
                  <td key={column} className="px-2 py-1.5">
                    <input
                      value={row[column] ?? ""}
                      onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                      placeholder={column === sizeColumn ? "M" : "96-104"}
                      className={cn(
                        "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-base)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none",
                        column === sizeColumn ? "font-semibold" : "font-mono",
                        !row[column]?.trim() && column !== sizeColumn
                          ? "border-[var(--color-warning)]/50"
                          : "border-[var(--color-border)] focus:border-[var(--color-brand)]"
                      )}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => removeRow(rowIndex)}
                    aria-label="Remove size"
                    className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-error)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add a size
        </Button>
        {hasEmptyMeasurement && (
          <p className="text-xs text-[var(--color-warning)]">
            Every size needs all its measurements — a blank one matches nobody.
          </p>
        )}
      </div>
    </Modal>
  );
}

function SampleChip({
  sku,
  title,
  imageUrl,
  price,
}: {
  sku: string;
  title: string;
  imageUrl: string;
  price: string;
}) {
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1.5 pr-3">
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-[var(--color-surface-elevated)]">
        {failed ? (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-3 w-3 text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="32px"
            className="object-cover"
            onError={() => setFailed(true)}
            unoptimized
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="max-w-[12rem] truncate text-xs text-[var(--color-text-primary)]">{title}</p>
        <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
          {sku} · {price}
        </p>
      </div>
    </div>
  );
}
