import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Layers,
  Check,
  Edit3,
  FolderTree,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { GapItem } from '../types';

interface Stage5Props {
  gapItems: GapItem[];
  onOpenGapModal: (item: GapItem) => void;
  onQuickCompleteAll: () => void;
  onPrev: () => void;
  onNext: () => void;
  stageLabel?: string;
  isSyncFlow?: boolean;
}

export function Stage5GapFilling({
  gapItems,
  onOpenGapModal,
  onQuickCompleteAll,
  onPrev,
  onNext,
  stageLabel = 'Stage 5 of 6',
  isSyncFlow,
}: Stage5Props) {
  const [filter, setFilter] = useState<'all' | 'setup_done' | 'delta_new'>('all');

  const completedCount = gapItems.filter((i) => i.status === 'complete').length;
  const totalGaps = gapItems.length;
  const progressPercent = Math.round((completedCount / totalGaps) * 100);

  const inheritedCount = gapItems.filter((i) => i.isInheritedFromSetup).length;
  const deltaCount = gapItems.filter((i) => !i.isInheritedFromSetup).length;
  const hasInherited = isSyncFlow || inheritedCount > 0;

  const filteredItems = useMemo(() => {
    if (filter === 'setup_done') {
      return gapItems.filter((i) => i.isInheritedFromSetup);
    }
    if (filter === 'delta_new') {
      return gapItems.filter((i) => !i.isInheritedFromSetup);
    }
    return gapItems;
  }, [gapItems, filter]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-pink-500" />
              {stageLabel}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-500">Catalog Completion</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Complete Your Size Data by Category Path
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Review and input size matrix parameters for unbranded catalog segments and private brands segmented by category path (e.g. Shoes vs Blazers vs T-Shirts).
          </p>
        </div>

        {/* Quick auto-fill button for demo convenience */}
        <button
          type="button"
          onClick={onQuickCompleteAll}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 hover:border-purple-300 shadow-xs transition-all self-start md:self-auto cursor-pointer flex-shrink-0 whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4 text-pink-500" />
          <span>Auto-fill All Templates</span>
        </button>
      </div>

      {/* Reused Setup Profiles Banner (Sync Flow) */}
      {hasInherited && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/70 to-indigo-50/60 border border-emerald-200/90 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">Setup Calibration Reused</h4>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
                  ⚡ Pre-filled &amp; Done
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                Templates completed during initial store setup are retained and marked as <strong>Done</strong>. You only need to fill templates for new delta categories or private brands added in this catalog sync.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-800 bg-white/90 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-2xs">
              ⚡ {inheritedCount} Reused (Done)
            </span>
            <span className="text-xs font-bold text-purple-800 bg-purple-100/90 px-3 py-1.5 rounded-lg border border-purple-200 shadow-2xs">
              ✨ {deltaCount} New Delta
            </span>
          </div>
        </div>
      )}

      {/* Progress Overview Card */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md shadow-purple-950/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-purple-300">
                Gap Completion Status
              </span>
              <h3 className="text-xl font-bold mt-0.5">
                {completedCount} of {totalGaps} Path-Specific Sizing Matrices Completed
              </h3>
            </div>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-pink-400">{progressPercent}%</span>
              <p className="text-xs text-purple-200">Total catalog coverage</p>
            </div>
          </div>

          <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-purple-400 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>

          <p className="text-xs text-purple-200/90">
            {completedCount === totalGaps
              ? '✨ All gaps are filled! Your catalog is 100% ready for Persona fit recommendations.'
              : 'Fill each template below or apply industry standard presets to unlock accurate sizing.'}
          </p>
        </div>
      </div>

      {/* Gap Checklist */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-sm text-slate-900">Required Size Matrices ({gapItems.length} Category Paths)</h3>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-400" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({gapItems.length})
            </button>
            {hasInherited && (
              <>
                <button
                  type="button"
                  onClick={() => setFilter('setup_done')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    filter === 'setup_done'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>⚡ Inherited (Done: {inheritedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('delta_new')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    filter === 'delta_new'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-pink-500" />
                  <span>✨ New Delta ({deltaCount})</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No size matrix templates found matching this filter.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isInherited = !!item.isInheritedFromSetup;
              const isComplete = item.status === 'complete';
              const isInProgress = item.status === 'in_progress';

              return (
                <div
                  key={item.id}
                  className={`p-6 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
                    isComplete ? 'bg-emerald-50/20' : 'hover:bg-slate-50/60'
                  }`}
                >
                  {/* Left details */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h4 className="text-base font-bold text-slate-900">{item.brandName}</h4>

                      {/* Category Path Tag */}
                      <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                        <FolderTree className="w-3 h-3 text-purple-600" />
                        {item.categoryPath}
                      </span>

                      {/* Status Pill */}
                      {isInherited && isComplete ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Done · Pre-filled in Setup
                        </span>
                      ) : isComplete ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Complete
                        </span>
                      ) : isInProgress ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          New Delta · Not Started
                        </span>
                      )}

                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                        {item.skuCount} SKUs
                      </span>
                    </div>

                    {/* Sample Product Thumbnails */}
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[11px] font-semibold text-slate-400">Sample Items:</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.sampleProducts.map((p) => (
                          <div key={p.sku} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-md p-1 pr-2">
                            <img
                              src={p.imageUrl}
                              alt={p.title}
                              referrerPolicy="no-referrer"
                              className="w-5 h-5 rounded object-cover"
                            />
                            <span className="text-[11px] font-medium text-slate-700 truncate max-w-[150px]" title={p.title}>
                              {p.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Action */}
                  <div className="flex items-center gap-3 self-end md:self-auto">
                    {isInherited ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Done (Setup)
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenGapModal(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Inspect / Edit</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenGapModal(item)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isComplete
                            ? 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 shadow-xs'
                            : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-95 shadow-sm active:scale-98'
                        }`}
                      >
                        {isComplete ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                            <span>Edit Template</span>
                          </>
                        ) : (
                          <>
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Fill Template</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Card Footer Bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={onPrev}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Size Charts
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onNext}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] hover:opacity-95 shadow-md shadow-purple-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <span>Confirm &amp; Activate Persona</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
