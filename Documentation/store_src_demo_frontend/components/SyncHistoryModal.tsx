import { CheckCircle2, History, X, Store, ShieldCheck, Zap } from 'lucide-react';
import { SYNC_HISTORY_DATA, SyncHistoryEntry } from '../data/syncData';

interface SyncHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SyncHistoryModal({ isOpen, onClose }: SyncHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold flex-shrink-0">
              <History className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Catalog &amp; Size Sync History
              </h2>
              <p className="text-xs text-slate-500">
                Historical webhook logs &amp; automated cron ingestion audit trail
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100 text-xs">
            <div className="flex items-center gap-2 text-purple-900 font-semibold">
              <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <span>Total Synced to Date: <strong>12,480 SKUs</strong> across 4 sync runs</span>
            </div>
            <span className="text-[11px] font-bold text-purple-700 bg-white px-2.5 py-0.5 rounded-full border border-purple-200">
              Shopify Connected
            </span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {SYNC_HISTORY_DATA.map((entry) => (
              <div
                key={entry.id}
                className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-slate-900">
                      {entry.timestamp}
                    </span>
                    <span className="text-slate-400 font-medium text-[11px]">
                      ({entry.relativeTime})
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      {entry.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {entry.triggerType}
                    </span>
                  </div>

                  <p className="text-slate-600 leading-relaxed">
                    {entry.notes}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-slate-500">Sample SKUs:</span>
                    {entry.sampleItems.map((item, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70 text-right shrink-0">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400">SKUs Synced</div>
                    <div className="text-sm font-extrabold text-purple-900">
                      +{entry.itemsCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="h-6 w-px bg-slate-200"></div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400">Latency</div>
                    <div className="text-xs font-semibold text-slate-700">
                      {entry.durationSec}s
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            Close Audit Log
          </button>
        </div>
      </div>
    </div>
  );
}
