import { Sparkles, RotateCcw, Store, Sliders, RefreshCw } from 'lucide-react';

export type MainAppTab = 'setup' | 'sync';

interface NavbarProps {
  activeTab: MainAppTab;
  onSelectTab: (tab: MainAppTab) => void;
  onReset: () => void;
}

export function Navbar({ activeTab, onSelectTab, onReset }: NavbarProps) {
  return (
    <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] flex items-center justify-center shadow-md shadow-purple-500/20 text-white font-bold text-lg">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-lg tracking-tight">Persona</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 border border-purple-200/60">
                Fit Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">AI-Powered Catalog Sizing & Recommendation</p>
          </div>
        </div>

        {/* Primary App Navigation Tabs: Setup & Sync */}
        <nav className="flex items-center p-1 rounded-2xl bg-slate-100/90 border border-slate-200 shadow-inner">
          <button
            type="button"
            onClick={() => onSelectTab('setup')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'setup'
                ? 'bg-white text-purple-900 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Sliders className={`w-3.5 h-3.5 ${activeTab === 'setup' ? 'text-purple-600' : 'text-slate-500'}`} />
            <span>Setup</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('sync')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sync'
                ? 'bg-white text-purple-900 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeTab === 'sync' ? 'text-purple-600' : 'text-slate-500'}`} />
            <span>Sync</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200/60 leading-none">
              Coming Soon
            </span>
          </button>
        </nav>

        {/* Store Connection status & Sandbox badge */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <Store className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-900">Nordic Outfitters</span>
            <span className="text-slate-400">·</span>
            <span className="text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Shopify Connected
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100">
            <Sparkles className="w-3 h-3 text-pink-500" />
            <span>Interactive Demo</span>
          </div>

          <button
            onClick={onReset}
            title="Reset onboarding walkthrough to stage 1"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        </div>
      </div>
    </header>
  );
}

