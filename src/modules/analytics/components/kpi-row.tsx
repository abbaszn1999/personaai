import * as React from "react";
import { DollarSign, ShoppingBag, TrendingUp, Users, Percent } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import type { DateRange } from "../mocks/analytics-data";
import { ANALYTICS_SUMMARY } from "../mocks/analytics-data";

interface KpiRowProps {
  range: DateRange;
}

function formatRevenue(v: number) {
  return v >= 1000
    ? `$${(v / 1000).toFixed(1)}k`
    : `$${v.toLocaleString()}`;
}

export function KpiRow({ range }: KpiRowProps) {
  const s = ANALYTICS_SUMMARY[range];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard
        label="Tool Revenue"
        value={formatRevenue(s.revenue)}
        sub="Attributed to Persona AI"
        icon={<DollarSign className="h-4 w-4" />}
        accent="brand"
        trend={{ value: s.trends.revenue, label: "vs prior period" }}
      />
      <MetricCard
        label="Orders"
        value={s.orders.toLocaleString()}
        sub="Tool-assisted purchases"
        icon={<ShoppingBag className="h-4 w-4" />}
        accent="unwearable"
        trend={{ value: s.trends.orders, label: "vs prior period" }}
      />
      <MetricCard
        label="Avg. Order Value"
        value={`$${s.aov.toFixed(2)}`}
        sub="Per tool-assisted order"
        icon={<TrendingUp className="h-4 w-4" />}
        accent="success"
        trend={{ value: s.trends.aov, label: "vs prior period" }}
      />
      <MetricCard
        label="Shopper Sessions"
        value={s.sessions.toLocaleString()}
        sub="Widget interactions"
        icon={<Users className="h-4 w-4" />}
        accent="wearable"
        trend={{ value: s.trends.sessions, label: "vs prior period" }}
      />
      <MetricCard
        label="Conversion Rate"
        value={`${s.conversionRate}%`}
        sub="Sessions → purchases"
        icon={<Percent className="h-4 w-4" />}
        accent="brand"
        trend={{ value: s.trends.conversionRate, label: "vs prior period" }}
      />
    </div>
  );
}
