"use client";

import * as React from "react";
import {
  Plug,
  FolderOpen,
  Store,
  RefreshCw,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { PanelNav, type PanelNavItem } from "@/components/layout/panel-nav";
import { SettingsSection } from "@/components/ui/settings-section";
import { StatusPill } from "@/components/ui/status-pill";
import { ConnectionCard } from "./connection-card";
import { ConnectStoreForm } from "./connect-store-form";
import { CatalogSyncPanel } from "./catalog-sync-panel";
import { useStoreConnect } from "../hooks/use-store-connect";
import { PLATFORM_LABELS } from "@/modules/store/constants";
import { cn } from "@/lib/utils/cn";

type StoreTab = "connection" | "catalog";

export function StoreDashboard() {
  const store = useStoreConnect();
  const connection = store.connection;
  const [activeTab, setActiveTab] = React.useState<StoreTab>("connection");

  async function handleConnect() {
    const connected = await store.connect();
    if (connected) setActiveTab("catalog");
  }

  const NAV_ITEMS: PanelNavItem[] = [
    {
      id: "connection",
      label: "Connection",
      description: connection ? PLATFORM_LABELS[connection.platform] : "Not connected",
      icon: <Plug className="h-4 w-4" />,
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
            {store.syncError && (
              <p className="text-xs text-[var(--color-error)]">{store.syncError}</p>
            )}
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
          {activeTab === "connection" && (
            <SettingsSection
              title={connection ? "Connected Store" : "Connect a Store"}
              description={
                connection
                  ? "Your active e-commerce platform integration"
                  : "Choose your platform and enter your API credentials"
              }
              icon={<Plug className="h-4 w-4" />}
              accent="brand"
            >
              {connection ? (
                <ConnectionCard
                  connection={connection}
                  productCount={store.productCount}
                  categoryCount={store.categoryCount}
                  isSyncing={store.isSyncing}
                  syncedAt={store.syncedAt}
                  onDisconnect={store.disconnect}
                  onSync={store.syncNow}
                />
              ) : (
                <ConnectStoreForm
                  platform={store.form.platform}
                  storeUrl={store.form.storeUrl}
                  apiKey={store.form.apiKey}
                  clientId={store.form.clientId}
                  clientSecret={store.form.clientSecret}
                  wpUsername={store.form.wpUsername}
                  wpAppPassword={store.form.wpAppPassword}
                  isConnecting={store.isConnecting}
                  canConnect={store.canConnect}
                  error={store.connectError}
                  onChange={store.updateForm}
                  onConnect={handleConnect}
                />
              )}
            </SettingsSection>
          )}

          {activeTab === "catalog" && connection && (
            <SettingsSection
              title="Catalog Sync"
              description="Products and categories synced from your store — choose which are active for your agent"
              icon={<FolderOpen className="h-4 w-4" />}
              accent="unwearable"
            >
              <CatalogSyncPanel
                productCount={store.productCount}
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
