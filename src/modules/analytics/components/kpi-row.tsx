import * as React from "react";
import { ShoppingBag, DollarSign, Users, Percent, Tag } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import type { WorkspaceAnalyticsPayload } from "../types";

interface KpiRowProps {
  payload: WorkspaceAnalyticsPayload | null;
  loading: boolean;
}

function formatCurrency(v: number, currency: string) {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return v >= 1000 ? `${symbol}${(v / 1000).toFixed(1)}k` : `${symbol}${v.toLocaleString()}`;
}

/** 5 Persona-attributed cards — everything the widget itself directly caused. No Tool
 *  Revenue/Orders/AOV/session→purchase Conversion Rate: those need store-wide WooCommerce
 *  order data, which this page deliberately never touches (see analytics.ts). */
export function KpiRow({ payload, loading }: KpiRowProps) {
  const s = payload?.kpis;
  const currency = s?.currency ?? "USD";
  const placeholder = loading ? "…" : "—";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard
        label="Persona Sessions"
        value={s ? s.sessions.toLocaleString() : placeholder}
        sub="Widget opens via Persona"
        icon={<Users className="h-4 w-4" />}
        accent="brand"
        trend={s ? { value: s.trends.sessions, label: "vs prior period" } : undefined}
      />
      <MetricCard
        label="Items Added to Cart"
        value={s ? s.cartItemsAdded.toLocaleString() : placeholder}
        sub="Via Persona add-to-cart"
        icon={<ShoppingBag className="h-4 w-4" />}
        accent="unwearable"
        trend={s ? { value: s.trends.cartItemsAdded, label: "vs prior period" } : undefined}
      />
      <MetricCard
        label="Cart Value Added"
        value={s ? formatCurrency(s.cartValueAdded, currency) : placeholder}
        sub="Cart value added via Persona"
        icon={<DollarSign className="h-4 w-4" />}
        accent="success"
        trend={s ? { value: s.trends.cartValueAdded, label: "vs prior period" } : undefined}
      />
      <MetricCard
        label="Add-to-Cart Rate"
        value={s ? `${s.addToCartRate}%` : placeholder}
        sub="Sessions with a Persona add-to-cart"
        icon={<Percent className="h-4 w-4" />}
        accent="wearable"
        trend={s ? { value: s.trends.addToCartRate, label: "vs prior period" } : undefined}
      />
      <MetricCard
        label="Avg. Cart Item Value"
        value={s ? formatCurrency(s.avgCartItemValue, currency) : placeholder}
        sub="Per item added via Persona"
        icon={<Tag className="h-4 w-4" />}
        accent="brand"
      />
    </div>
  );
}
