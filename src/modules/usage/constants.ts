import type { UsageTool } from "@/lib/billing/usage-report";

export const TOOL_META: Record<
  UsageTool,
  { label: string; color: string; quantity: string; unit: string }
> = {
  chat: { label: "Conversation", color: "#7c5cfc", quantity: "calls", unit: "session units" },
  search: { label: "Catalog search", color: "#3b82f6", quantity: "searches", unit: "session units" },
  try_on: { label: "Garment try-on", color: "#f76d01", quantity: "renders", unit: "garment units" },
  avatar: { label: "Avatar", color: "#14b8a6", quantity: "images", unit: "garment units" },
  live: { label: "Live try-on", color: "#e11d48", quantity: "sessions", unit: "seconds" },
};

export const RANGE_OPTIONS = [
  { id: "cycle", label: "This cycle" },
  { id: "previous", label: "Previous cycle" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "custom", label: "Custom" },
] as const;

export function formatBucketLabel(bucket: string, mode: "day" | "week"): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket;
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return mode === "week" ? `Week of ${label}` : label;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
