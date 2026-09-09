import {
  Sparkles,
  RotateCcw,
  Store,
  Sliders,
  RefreshCw,
  Layers,
  Database,
  CheckCircle2,
  Cpu,
  ChevronRight,
  SlidersHorizontal,
  Lock,
  Tag,
  Plug,
} from 'lucide-react';
import { StageNumber, StoreConnectionInfo } from '../types';

export type MainAppTab = 'connect_store' | 'categories' | 'setup' | 'sync';

interface SidebarProps {
  activeTab: MainAppTab;
  onSelectTab: (tab: MainAppTab) => void;
  currentStage: StageNumber;
  highestReachedStage: StageNumber;
  syncStage?: StageNumber;
  onReset: () => void;
  storeConnection: StoreConnectionInfo;
  selectedLeafCount: number;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  currentStage,
  highestReachedStage,
  syncStage = 1,
  onReset,
  storeConnection,
  selectedLeafCount,
}: SidebarProps) {
  const isStoreConnected = storeConnection.isConnected;
  const isCategoriesUnlocked = isStoreConnected;
  const isSetupUnlocked = isStoreConnected && selectedLeafCount > 0;

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200/90 flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header - Compact */}
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] flex items-center justify-center shadow-xs shadow-purple-500/20 text-white font-bold text-sm flex-shrink-0">
            P
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-slate-900 text-sm tracking-tight">Persona</span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-purple-100 text-purple-700">
                Fit
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Sizing Engine</p>
          </div>
        </div>

        <span
          className={`w-2 h-2 rounded-full ${
            isStoreConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
          }`}
          title={isStoreConnected ? 'Store Connected' : 'Connection Required'}
        ></span>
      </div>

      {/* Main Navigation Menu */}
      <div className="p-3 flex-1 flex flex-col justify-between overflow-y-auto space-y-4">
        <div className="space-y-1">
          <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Pipeline Navigation
          </div>

          {/* Tab 1: Connect Your Store */}
          <button
            type="button"
            onClick={() => onSelectTab('connect_store')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
              activeTab === 'connect_store'
                ? 'bg-purple-50 text-purple-950 border border-purple-200/90 shadow-2xs font-semibold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent font-medium'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activeTab === 'connect_store'
                    ? 'bg-purple-600 text-white shadow-2xs shadow-purple-600/30'
                    : isStoreConnected
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">1. Connect Store</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {isStoreConnected ? `${storeConnection.platform.toUpperCase()} Linked` : 'Auth Required'}
                </span>
              </div>
            </div>

            {activeTab === 'connect_store' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 flex-shrink-0"></span>
            ) : isStoreConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            ) : null}
          </button>

          {/* Tab 2: Categories */}
          <button
            type="button"
            onClick={() => {
              if (isCategoriesUnlocked) {
                onSelectTab('categories');
              }
            }}
            disabled={!isCategoriesUnlocked}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
              !isCategoriesUnlocked
                ? 'opacity-50 cursor-not-allowed text-slate-400'
                : activeTab === 'categories'
                ? 'bg-purple-50 text-purple-950 border border-purple-200/90 shadow-2xs font-semibold cursor-pointer'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent font-medium cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activeTab === 'categories'
                    ? 'bg-purple-600 text-white shadow-2xs shadow-purple-600/30'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">2. Categories</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {selectedLeafCount > 0 ? `${selectedLeafCount} Leaf Paths` : 'Scope Ingest'}
                </span>
              </div>
            </div>

            {activeTab === 'categories' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 flex-shrink-0"></span>
            ) : !isCategoriesUnlocked ? (
              <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
            ) : null}
          </button>

          {/* Tab 3: Setup */}
          <button
            type="button"
            onClick={() => {
              if (isSetupUnlocked) {
                onSelectTab('setup');
              }
            }}
            disabled={!isSetupUnlocked}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
              !isSetupUnlocked
                ? 'opacity-50 cursor-not-allowed text-slate-400'
                : activeTab === 'setup'
                ? 'bg-purple-50 text-purple-950 border border-purple-200/90 shadow-2xs font-semibold cursor-pointer'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent font-medium cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activeTab === 'setup'
                    ? 'bg-purple-600 text-white shadow-2xs shadow-purple-600/30'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">3. Setup</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  Stage {currentStage}/6
                </span>
              </div>
            </div>

            {activeTab === 'setup' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 flex-shrink-0"></span>
            ) : !isSetupUnlocked ? (
              <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
            ) : null}
          </button>

          {/* Tab 4: Sync */}
          <button
            type="button"
            onClick={() => onSelectTab('sync')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
              activeTab === 'sync'
                ? 'bg-purple-50 text-purple-950 border border-purple-200/90 shadow-2xs font-semibold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent font-medium'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activeTab === 'sync'
                    ? 'bg-purple-600 text-white shadow-2xs shadow-purple-600/30'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold block truncate">4. Sync</span>
                  <span className="px-1 py-0.2 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-700">
                    48
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block truncate">
                  Delta Engine
                </span>
              </div>
            </div>

            {activeTab === 'sync' && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 flex-shrink-0"></span>
            )}
          </button>
        </div>

        {/* Bottom Sidebar Info & Reset */}
        <div className="space-y-2 pt-3 border-t border-slate-100">
          {/* Connected Store Mini Badge */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[10px] space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                <Store className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                <span className="truncate">{storeConnection.storeName}</span>
              </div>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                  isStoreConnected
                    ? 'text-emerald-700 bg-emerald-100/80'
                    : 'text-amber-700 bg-amber-100/80'
                }`}
              >
                {isStoreConnected ? 'Active' : 'Unlinked'}
              </span>
            </div>
            <div className="text-slate-400 font-mono text-[9px] flex justify-between">
              <span>Scoped SKUs:</span>
              <span className="font-semibold text-slate-600">
                {isStoreConnected ? '12,480' : '0'}
              </span>
            </div>
          </div>

          {/* Reset Walkthrough Action */}
          <button
            type="button"
            onClick={onReset}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

