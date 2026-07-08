"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plug,
  FolderOpen,
  Shirt,
  BotMessageSquare,
  BarChart2,
  Eye,
  SlidersHorizontal,
  Code2,
  RefreshCw,
  TrendingUp,
  Users,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentOrb } from "@/components/ui/agent-orb";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import type { Workspace } from "@/modules/workspaces/types";
import { WORKSPACE_MODE_LABELS } from "@/modules/workspaces/constants";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { useStoreConnectionStore } from "@/modules/store/store";
import { MOCK_WEARABLE_CATEGORIES, MOCK_UNWEARABLE_CATEGORIES } from "@/lib/mock-api/catalog";
import { cn } from "@/lib/utils/cn";

// ── Deterministic per-workspace mock stats ─────────────────────────────────
function wsStats(id: string) {
  const seed = id.charCodeAt(id.length - 1) % 4;
  const sessions      = [187, 312, 95,  248][seed];
  const conversions   = [28,  47,  12,  39][seed];
  const revenue       = [1840, 3210, 640, 2780][seed];
  const agentActions  = [156, 289, 71, 214][seed]; // try-ons or chat messages
  return {
    sessions,
    conversions,
    rate: ((conversions / sessions) * 100).toFixed(1),
    revenue,
    agentActions,
    avgDuration: ["2m 14s", "3m 08s", "1m 42s", "2m 51s"][seed],
  };
}

interface Props { workspace: Workspace }

export function WorkspaceOverview({ workspace }: Props) {
  const connection = useStoreConnectionStore((s) => s.connection);
  const selectedCategoryIds = useStoreConnectionStore((s) => s.selectedCategoryIds);
  const stats = wsStats(workspace.id);
  const [syncing, setSyncing] = React.useState(false);

  const categories = workspace.mode === "wearable" ? MOCK_WEARABLE_CATEGORIES : MOCK_UNWEARABLE_CATEGORIES;
  const activeCategories = categories.filter((c) => selectedCategoryIds.includes(c.id));

  const previewHref   = workspace.mode === "wearable"
    ? `/workspaces/${workspace.id}/try-on`
    : `/workspaces/${workspace.id}/assistant`;

  async function handleSync() {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSyncing(false);
  }

  const quickStats = [
    { label: "Sessions",      value: stats.sessions.toLocaleString(),       icon: <Users className="h-4 w-4" />,        color: "text-blue-500" },
    { label: "Conversions",   value: stats.conversions.toLocaleString(),     icon: <ShoppingCart className="h-4 w-4" />, color: "text-[var(--color-brand)]" },
    { label: "Revenue",       value: `$${stats.revenue.toLocaleString()}`,   icon: <TrendingUp className="h-4 w-4" />,   color: "text-emerald-500" },
    {
      label: workspace.mode === "wearable" ? "Try-Ons" : "Chat Messages",
      value: stats.agentActions.toLocaleString(),
      icon: workspace.mode === "wearable"
        ? <Shirt className="h-4 w-4" />
        : <BotMessageSquare className="h-4 w-4" />,
      color: workspace.mode === "wearable" ? "text-[var(--color-accent)]" : "text-[var(--color-brand)]",
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header card ──────────────────────────────────────────── */}
      <Card elevated>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4">
            <AgentOrb mode={workspace.mode} size="lg" animated={workspace.status === "active"} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{workspace.name}</h2>
                <StatusPill status={workspace.status} />
                <Badge variant={workspace.mode === "wearable" ? "wearable" : "unwearable"}>
                  {WORKSPACE_MODE_LABELS[workspace.mode]}
                </Badge>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {workspace.mode === "wearable"
                  ? "Virtual Try-On Agent — customers preview outfits with AI-generated photos"
                  : "Shopping Assistant Agent — AI chat to guide customers through your catalog"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {workspace.mode === "wearable"
                ? <Shirt className="h-6 w-6 text-[var(--color-accent)]" />
                : <BotMessageSquare className="h-6 w-6 text-[var(--color-brand)]" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Quick stats ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className={cn("mb-2", s.color)}>{s.icon}</div>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{s.value}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.label}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">Last 30 days</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Store connection ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Store Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {connection?.status === "connected" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {connection.storeName}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {PLATFORM_LABELS[connection.platform]} · {connection.storeUrl}
                    </p>
                  </div>
                  <StatusPill status="connected" />
                </div>
                <Button size="sm" variant="secondary" loading={syncing} onClick={handleSync} className="w-full gap-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync Products
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-[var(--color-text-muted)]">No store connected</p>
                <Link href="/store">
                  <Button size="sm">
                    <Plug className="h-3.5 w-3.5" />
                    Connect Store
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Active categories ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Active Categories
              </CardTitle>
              <Link href={`/workspaces/${workspace.id}/settings`}>
                <Button variant="ghost" size="sm" className="text-xs">Edit</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeCategories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeCategories.map((cat) => (
                  <span
                    key={cat.id}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-secondary)]"
                  >
                    {cat.name}
                    <span className="text-[var(--color-text-muted)]">({cat.productCount})</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)] py-2">No categories selected</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick action grid ─────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "View Analytics",  href: `/workspaces/${workspace.id}/analytics`, icon: <BarChart2 className="h-5 w-5" />,          color: "text-[var(--color-brand)]",  bg: "bg-[var(--color-brand-light)]" },
            { label: "Open Preview",    href: previewHref,                              icon: <Eye className="h-5 w-5" />,               color: "text-[var(--color-accent)]", bg: "bg-[var(--color-accent-light)]" },
            { label: "Edit Settings",   href: `/workspaces/${workspace.id}/settings`,  icon: <SlidersHorizontal className="h-5 w-5" />, color: "text-slate-500",             bg: "bg-slate-100" },
            { label: "Branding & Embed", href: `/workspaces/${workspace.id}/branding`, icon: <Code2 className="h-5 w-5" />,             color: "text-[var(--color-brand-red)]", bg: "bg-[var(--color-brand-light)]" },
          ].map((action) => (
            <Link key={action.label} href={action.href}>
              <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] px-4 py-5 text-center hover:border-[var(--color-brand)]/40 hover:shadow-[var(--shadow-elevated)] transition-all cursor-pointer group">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", action.bg)}>
                  <span className={action.color}>{action.icon}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand)] transition-colors">{action.label}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-brand)] transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
