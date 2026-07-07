import type { UsagePoint } from "../types";

function makeUsageHistory(days: number, baseDaily: number): UsagePoint[] {
  const data: UsagePoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const jitter = 0.5 + Math.random() * 0.9;
    const weekendDip = [0, 6].includes(d.getDay()) ? 0.7 : 1;
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      renders: Math.round(baseDaily * jitter * weekendDip),
    });
  }
  return data;
}

export const USAGE_HISTORY: UsagePoint[] = makeUsageHistory(30, 95);

export const RENDERS_USED_THIS_CYCLE = USAGE_HISTORY.reduce((sum, p) => sum + p.renders, 0);
