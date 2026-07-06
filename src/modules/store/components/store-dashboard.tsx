"use client";

import * as React from "react";
import {
  Plug,
  FolderOpen,
  Plus,
  Store,
  RefreshCw,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { PanelNav, type PanelNavItem } from "@/components/layout/panel-nav";
import { SettingsSection } from "@/components/ui/settings-section";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { ConnectionCard } from "./connection-card";
import { ConnectStoreForm } from "./connect-store-form";
import { CatalogSyncPanel } from "./catalog-sync-panel";
import { useStoreConnect } from "../hooks/use-store-connect";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { cn } from "@/lib/utils/cn";

type StoreTab = "overview" | "connect" | "catalog";

export function StoreDashboard() {
  const store = useStoreConnect();
  const connection = store.connection;
  const [activeTab, setActiveTab] = React.useState<StoreTab>(connection ? "overview" : "connect");

  // Auto-switch to overview once connected
  const prevConnected = React.useRef(!!connection);
  React.useEffect(() => {
    if (!prevConnected.current && connection) {
      setActiveTab("overview");
    }
    prevConnected.current = !!connection;
  }, [connection]);

  const NAV_ITEMS: PanelNavItem[] = [
    {
      id: "overview",
      label: "Connection",
      description: connection ? PLATFORM_LABELS[connection.platform] : "Not connected",
      icon: <Plug className="h-4 w-4" />,
    },
    {
      id: "connect",
      label: connection ? "Replace Store" : "Connect Store",
      description: "Add or change platform",
      icon: <Plus className="h-4 w-4" />,
    },
    {
      id: "catalog",
      label: "Catalog Sync",
      description: connection ? `${store.productCount} products` : "Connect first",
      icon: <FolderOpen className="h-4 w-4" />,
      disabled: !connection,
    },
  ];

  return (
    <>
      <DashboardPageHeader
        title="Store"
        description="Connect and manage your e-commerce platform"
      />
      <div className="flex gap-6 min-h-[calc(100vh-140px)] p-6 pt-4">

        {/* ── Left Panel ── */}
        <aside className="w-64 shrink-0 flex flex-col gap-4">

          {/* Connection status card */}
          <div className="card-base p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shrink-0">
                <Store className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                  {connection ? connection.storeName : "No Store"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {connection ? connection.storeUrl : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <StatusPill
                status={connection?.status === "connected" ? "connected" : "disconnected"}
              />
              {connection && (
                <button
                  onClick={store.syncNow}
                  disabled={store.isSyncing}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", store.isSyncing && "animate-spin-slow")} />
                  {store.isSyncing ? "Syncing" : "Sync"}
                </button>
              )}
            </div>
          </div>

          {/* Nav */}
          <PanelNav
            title="Store"
            items={NAV_ITEMS}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as StoreTab)}
          />
        </aside>

        {/* ── Right Content ── */}
        <div className="flex-1 min-w-0 animate-fade-in">
          {activeTab === "overview" && (
            <SettingsSection
              title="Connected Store"
              description="Your active e-commerce platform integration"
              icon={<Plug className="h-4 w-4" />}
              accent="brand"
            >
              {connection ? (
                <div className="space-y-4">
                  <ConnectionCard
                    connection={connection}
                    productCount={store.productCount}
                    categoryCount={store.categoryCount}
                    isSyncing={store.isSyncing}
                    syncedAt={store.syncedAt}
                    onDisconnect={store.disconnect}
                    onSync={store.syncNow}
                  />
                  <button
                    onClick={() => setActiveTab("connect")}
                    className="flex items-center gap-2 text-sm text-[var(--color-brand)] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Replace with a different store
                  </button>
                </div>
              ) : (
                <EmptyState
                  icon={<Plug className="h-6 w-6" />}
                  title="No store connected"
                  description="Connect your e-commerce platform to let the AI agent access your products and categories."
                  action={{ label: "Connect a Store", onClick: () => setActiveTab("connect") }}
                />
              )}
            </SettingsSection>
          )}

          {activeTab === "connect" && (
            <SettingsSection
              title={connection ? "Replace Connection" : "Connect a Store"}
              description="Choose your platform and enter your API credentials"
              icon={<Plug className="h-4 w-4" />}
              accent="brand"
            >
              <ConnectStoreForm
                platform={store.form.platform}
                storeUrl={store.form.storeUrl}
                apiKey={store.form.apiKey}
                isConnecting={store.isConnecting}
                canConnect={store.canConnect}
                onChange={store.updateForm}
                onConnect={store.connect}
              />
            </SettingsSection>
          )}

          {activeTab === "catalog" && connection && (
            <SettingsSection
              title="Catalog Sync"
              description="Products and categories synced from your store"
              icon={<FolderOpen className="h-4 w-4" />}
              accent="unwearable"
            >
              <CatalogSyncPanel
                productCount={store.productCount}
                categoryCount={store.categoryCount}
                isSyncing={store.isSyncing}
                syncedAt={store.syncedAt}
                mode={store.workspace?.mode ?? "unwearable"}
                onSync={store.syncNow}
              />
            </SettingsSection>
          )}
        </div>
      </div>
    </>
  );
}
