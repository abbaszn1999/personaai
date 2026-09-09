import { Sparkles, RotateCcw } from 'lucide-react';
import { MainAppTab } from './Sidebar';

interface TopHeaderProps {
  activeTab: MainAppTab;
  onReset: () => void;
}

export function TopHeader({ activeTab, onReset }: TopHeaderProps) {
  return (
    <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-2 min-w-0">
        {activeTab === 'connect_store' ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md whitespace-nowrap">
              Connect Store
            </span>
            <span className="text-xs text-slate-400 select-none">/</span>
            <span className="text-xs font-semibold text-slate-700 truncate">
              Platform Authentication &amp; Taxonomy Detection
            </span>
          </div>
        ) : activeTab === 'categories' ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md whitespace-nowrap">
              Categories
            </span>
            <span className="text-xs text-slate-400 select-none">/</span>
            <span className="text-xs font-semibold text-slate-700 truncate">
              Catalog Sizing Scope &amp; Leaf-Level Taxonomy
            </span>
          </div>
        ) : activeTab === 'setup' ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md whitespace-nowrap">
              Setup
            </span>
            <span className="text-xs text-slate-400 select-none">/</span>
            <span className="text-xs font-semibold text-slate-700 truncate">
              Store Sizing &amp; Catalog Calibration
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-pink-700 bg-pink-100/80 px-2 py-0.5 rounded-md whitespace-nowrap">
              Sync
            </span>
            <span className="text-xs text-slate-400 select-none">/</span>
            <span className="text-xs font-semibold text-slate-700 truncate">
              Real-Time Catalog Sync Engine
            </span>
          </div>
        )}
      </div>

      {/* Right status items */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100 whitespace-nowrap">
          <Sparkles className="w-3 h-3 text-pink-500" />
          <span>Interactive Prototype</span>
        </div>

        <button
          type="button"
          onClick={onReset}
          title="Reset onboarding walkthrough to stage 1"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset Demo</span>
        </button>
      </div>
    </header>
  );
}

