import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Layers,
  ArrowRight,
  Zap,
  FileSpreadsheet,
  Check,
} from 'lucide-react';

interface MappingToPreviewLoadingProps {
  onComplete: () => void;
  onCancel?: () => void;
}

const MAPPING_LOGS = [
  { time: '0.2s', text: 'Reading store export attributes (title, sku, vendor, category, sizes)...', stage: 1 },
  { time: '0.8s', text: 'Validating Google Commerce Search schema alignment across 10 mapped columns...', stage: 2 },
  { time: '1.4s', text: 'Standardizing 12,480 catalog items to unified target schema...', stage: 2 },
  { time: '2.0s', text: 'Classifying brand entities into Global, Private, and Null segments...', stage: 3 },
  { time: '2.6s', text: 'Transformation validated! Generating interactive item catalog preview...', stage: 4 },
];

const SCHEMA_TRANSFORM_PREVIEWS = [
  `// Ingesting Raw Store Export...\n{\n  "source": "Shopify Store Export v3.2",\n  "total_records": 12480,\n  "raw_fields": ["Title", "Variant SKU", "Vendor", "Type", "Option1 Value"]\n}`,
  `// Aligning Column Mappings...\n{\n  "Title" -> "google:title",\n  "Variant SKU" -> "google:id",\n  "Vendor" -> "google:brand",\n  "Type" -> "google:product_type",\n  "Option1 Value" -> "google:size"\n}`,
  `// Normalizing 12,480 Catalog Records...\n[\n  {\n    "id": "NK-8821-M",\n    "title": "Nike Air Zoom Alphafly Next% 3",\n    "brand": "Nike (Global)",\n    "category": "Footwear",\n    "status": "VALIDATED"\n  },\n  ...\n]`,
  `// Schema Ready for Preview...\n{\n  "schema_status": "OK",\n  "mapped_attributes": 10,\n  "preview_ready": true\n}`
];

export function MappingToPreviewLoading({ onComplete, onCancel }: MappingToPreviewLoadingProps) {
  const [progressPercent, setProgressPercent] = useState(0);
  const [activeLogIndex, setActiveLogIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentPipelineStage, setCurrentPipelineStage] = useState(1);
  const [codeSnippetIndex, setCodeSnippetIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const totalDuration = 2800; // ~2.8s smooth transition
    const intervalTick = 40;
    const totalSteps = totalDuration / intervalTick;
    let step = 0;

    intervalRef.current = setInterval(() => {
      step++;
      const pct = Math.min(100, Math.round((step / totalSteps) * 100));
      setProgressPercent(pct);
      setProcessedCount(Math.min(12480, Math.round((pct / 100) * 12480)));

      // Step log index
      const logIdx = Math.min(
        MAPPING_LOGS.length - 1,
        Math.floor((pct / 100) * MAPPING_LOGS.length)
      );
      setActiveLogIndex(logIdx);
      setCurrentPipelineStage(MAPPING_LOGS[logIdx].stage);

      // Code snippet rotation
      const snippetIdx = Math.min(
        SCHEMA_TRANSFORM_PREVIEWS.length - 1,
        Math.floor((pct / 100) * SCHEMA_TRANSFORM_PREVIEWS.length)
      );
      setCodeSnippetIndex(snippetIdx);

      if (step >= totalSteps) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsFinished(true);
        // Auto transition after brief completion
        setTimeout(() => {
          onComplete();
        }, 500);
      }
    }, intervalTick);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onComplete]);

  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onComplete();
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Main Container Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 text-pink-300 border border-white/15 backdrop-blur-xs">
                <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
                <span>Applying Schema Mappings · Stage 1 → 2</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Standardizing Store Catalog Items
              </h2>
              <p className="text-sm text-purple-200 max-w-xl">
                Transforming 12,480 products into Google Commerce Search schema and preparing catalog preview.
              </p>
            </div>

            {/* Live Status Pill */}
            <div className="flex-shrink-0 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-right">
              <div className="text-[10px] uppercase font-bold text-purple-200 tracking-wider">Processed Records</div>
              <div className="text-xl font-extrabold text-white font-mono flex items-center justify-end gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                {processedCount.toLocaleString()} / 12,480
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar & Status */}
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
              <span>{MAPPING_LOGS[activeLogIndex]?.text || 'Processing catalog...'}</span>
            </span>
            <span className="text-purple-700 text-sm font-mono font-extrabold">{progressPercent}%</span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 w-full bg-slate-200/80 rounded-full overflow-hidden p-0.5 border border-slate-300/60 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-purple-600 via-pink-500 to-emerald-500 rounded-full transition-all duration-75 ease-out shadow-sm"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>

          {/* 4 Pipeline Micro-Steps */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[
              { num: 1, title: 'Read Export', desc: 'Shopify CSV / API' },
              { num: 2, title: 'Validate Schema', desc: '10 Mapped Columns' },
              { num: 3, title: 'Classify Brands', desc: 'Global, Private, Null' },
              { num: 4, title: 'Build Preview', desc: 'Interactive Catalog' },
            ].map((st) => {
              const isStepDone = currentPipelineStage > st.num || isFinished;
              const isStepActive = currentPipelineStage === st.num && !isFinished;

              return (
                <div
                  key={st.num}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isStepDone
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : isStepActive
                      ? 'bg-purple-50 border-purple-300 text-purple-950 ring-2 ring-purple-400/30'
                      : 'bg-white border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Step 0{st.num}</span>
                    {isStepDone ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                    ) : isStepActive ? (
                      <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
                    ) : null}
                  </div>
                  <div className="text-xs font-bold">{st.title}</div>
                  <div className="text-[10px] text-slate-500 font-medium truncate">{st.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Transformation Stream & Logs */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Execution Logs */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-600" />
                Schema Mapping Pipeline Logs
              </span>
              <span className="text-[10px] font-mono text-slate-400">Live Telemetry</span>
            </div>

            <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[11px] text-slate-300 space-y-2 border border-slate-800 shadow-inner h-[190px] overflow-y-auto">
              {MAPPING_LOGS.map((log, idx) => {
                const isExecuted = idx <= activeLogIndex;
                const isCurrent = idx === activeLogIndex;

                if (!isExecuted) return null;

                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 transition-all duration-150 ${
                      isCurrent ? 'text-pink-300 font-semibold' : 'text-slate-400 opacity-80'
                    }`}
                  >
                    <span className="text-slate-600 font-mono text-[10px] flex-shrink-0 mt-0.5">{log.time}</span>
                    <span className="text-purple-400 flex-shrink-0">➜</span>
                    <span className="leading-snug">{log.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Real-time Transformed Schema Object */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-pink-500" />
                Live Schema Transformation
              </span>
              <span className="text-[10px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                JSON Standard
              </span>
            </div>

            <div className="bg-slate-950 rounded-2xl p-4 font-mono text-[11px] text-emerald-400 border border-slate-800/80 shadow-inner h-[190px] overflow-hidden relative">
              <div className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-bold text-slate-500">
                Live Buffer
              </div>
              <pre className="text-slate-300 whitespace-pre font-mono leading-tight">
                {SCHEMA_TRANSFORM_PREVIEWS[codeSnippetIndex]}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer / Controls */}
        <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              Cancel &amp; Edit Mappings
            </button>
          ) : (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Standardizing column structures</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSkip}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-purple-700 hover:text-purple-900 hover:bg-purple-50 border border-purple-200 transition-all cursor-pointer shadow-2xs"
          >
            <span>Skip to Preview</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
