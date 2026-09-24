import { Info } from "lucide-react";

/** How a sale gets counted, so the numbers above can be checked against the store. */
export function AttributionNote() {
  return (
    <div className="card-base p-5 flex gap-3">
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
      <div className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">How Persona counts a sale</p>
        <p>
          A product line counts only when that product was added to cart from the widget: either the cart line carries
          Persona&apos;s tag, or the same device added that product within 7 days before the order. Other lines in the
          same order don&apos;t count. Line values are after discounts and before tax.
        </p>
        <p>
          Amounts are in USD at the order&apos;s daily rate, and refunds are subtracted on the day they happen. Days
          follow UTC. Order conversion is attributed orders per 100 widget sessions. Return on Persona is net sales divided
          by what the account paid Persona in the same range.
        </p>
      </div>
    </div>
  );
}
