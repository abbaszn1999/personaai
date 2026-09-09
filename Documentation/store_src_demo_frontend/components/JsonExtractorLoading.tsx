import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Code2,
  Cpu,
  Layers,
  Database,
  ShieldCheck,
  Zap,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface JsonExtractorLoadingProps {
  onComplete: () => void;
  onCancel?: () => void;
}

const EXTRACTION_LOGS = [
  { time: '0.2s', text: 'Initializing Gemini JSON Extraction & Schema Synthesis engine...', stage: 1 },
  { time: '0.6s', text: 'Ingesting 12,480 catalog items across 50 verified brand profiles...', stage: 1 },
  { time: '1.1s', text: 'Normalizing dimension matrices (chest, waist, hips, inseam, foot length to cm)...', stage: 2 },
  { time: '1.7s', text: 'Resolving category paths (Shoes, Tops, Bottoms, Outerwear, Accessories)...', stage: 2 },
  { time: '2.3s', text: 'Synthesizing individual SKU-level JSON size specifications...', stage: 3 },
  { time: '2.9s', text: 'Structuring nested sizing tables, tolerances, and regional standard mappings...', stage: 3 },
  { time: '3.4s', text: 'Verifying JSON schema compliance & Persona fit vector calibration...', stage: 4 },
  { time: '3.8s', text: 'JSON Extraction complete: 12,480 catalog items structured and validated!', stage: 4 },
];

const CODE_PREVIEWS = [
  `{\n  "status": "initializing_extractor",\n  "model": "gemini-size-synthesizer-v2",\n  "batch_size": 12480\n}`,
  `{\n  "brand": "Nike",\n  "category": "Footwear",\n  "region": "US/EU Standard",\n  "units": "cm",\n  "normalizing": true\n}`,
  `{\n  "sku": "NK-8821-M",\n  "product_title": "Nike Air Zoom Alphafly",\n  "category": "Footwear",\n  "size_chart": [\n    { "US Size": "8.5", "EUR Size": "42.0", "Foot Length (cm)": "26.5" },\n    { "US Size": "9.5", "EUR Size": "43.0", "Foot Length (cm)": "27.5" }\n  ]\n}`,
  `{\n  "sku": "ZR-4412-L",\n  "brand": "Zara",\n  "category": "Outerwear",\n  "size_chart": [\n    { "Size": "40R / M", "Chest (cm)": "98-104", "Waist (cm)": "82-88" },\n    { "Size": "42R / L", "Chest (cm)": "104-110", "Waist (cm)": "88-94" }\n  ],\n  "schema_status": "VALIDATED"\n}`,
  `{\n  "pipeline_status": "COMPLETED",\n  "total_items_extracted": 12480,\n  "schema_integrity": "100%",\n  "persona_ready": true\n}`
];

export function JsonExtractorLoading({ onComplete, onCancel }: JsonExtractorLoadingProps) {
  const [progressPercent, setProgressPercent] = useState(0);
  const [activeLogIndex, setActiveLogIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentPipelineStage, setCurrentPipelineStage] = useState(1);
  const [codeSnippetIndex, setCodeSnippetIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const totalDuration = 4000; // 4 seconds of rich animated loading
    const intervalTick = 50;
    const totalSteps = totalDuration / intervalTick;
    let step = 0;

    intervalRef.current = setInterval(() => {
      step++;
      const pct = Math.min(100, Math.round((step / totalSteps) * 100));
      setProgressPercent(pct);
      setProcessedCount(Math.min(12480, Math.round((pct / 100) * 12480)));

      // Step log index
      const logIdx = Math.min(
        EXTRACTION_LOGS.length - 1,
        Math.floor((pct / 100) * EXTRACTION_LOGS.length)
      );
      setActiveLogIndex(logIdx);
      setCurrentPipelineStage(EXTRACTION_LOGS[logIdx].stage);

      // Code snippet rotation
      const snippetIdx = Math.min(
        CODE_PREVIEWS.length - 1,
        Math.floor((pct / 100) * CODE_PREVIEWS.length)
      );
      setCodeSnippetIndex(snippetIdx);

      if (step >= totalSteps) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsFinished(true);
        // Auto transition after brief completion celebration
        setTimeout(() => {
          onComplete();
        }, 600);
      }
    }, intervalTick);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onComplete]);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeLogIndex]);

  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgressPercent(100);
    setProcessedCount(12480);
    setIsFinished(true);
    setTimeout(() => {
      onComplete();
    }, 150);
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Top Banner Card */}
      <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-purple-100/60 via-pink-50/40 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-pink-500 animate-spin" />
                AI JSON Extractor in Progress
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-semibold text-slate-600">
                Stage Transition (5 → 6)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Extracting Structured JSON Size Schemas
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Synthesizing brand measurement guides and category gap templates into unified, machine-readable JSON schemas for every catalog SKU.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Back to Gap Fill
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 shadow-xs transition-all cursor-pointer"
            >
              <span>Skip Animation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Extractor Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Progress & Pipeline Stages (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Progress Card */}
          <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-purple-950/20 relative overflow-hidden border border-purple-800/40">
            <div className="relative z-10 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center flex-shrink-0">
                    <Code2 className="w-6 h-6 text-pink-300 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>JSON Schema Synthesis Engine</span>
                      {isFinished && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </h3>
                    <p className="text-xs text-purple-200/80">
                      Standardizing dimensions across 12,480 store products
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-200 to-indigo-200">
                    {progressPercent}%
                  </span>
                  <p className="text-[11px] text-purple-300 font-mono">
                    {processedCount.toLocaleString()} / 12,480 SKUs
                  </p>
                </div>
              </div>

              {/* Glowing Progress Bar */}
              <div className="space-y-1.5">
                <div className="h-3.5 w-full bg-white/10 rounded-full overflow-hidden p-0.5 backdrop-blur-xs border border-white/10 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-100 ease-out shadow-sm"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[11px] font-mono text-purple-300/80">
                  <span>Phase: {EXTRACTION_LOGS[activeLogIndex]?.text.split('...')[0]}</span>
                  <span>{isFinished ? 'Ready' : 'Extracting...'}</span>
                </div>
              </div>

              {/* 4 Pipeline Step Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                {[
                  { stage: 1, label: 'Ingestion', desc: 'Raw Charts' },
                  { stage: 2, label: 'Normalize', desc: 'Metric Units' },
                  { stage: 3, label: 'JSON Synthesize', desc: 'SKU Schemas' },
                  { stage: 4, label: 'Validation', desc: 'Integrity Check' },
                ].map((st) => {
                  const isPast = currentPipelineStage > st.stage || isFinished;
                  const isCurrent = currentPipelineStage === st.stage && !isFinished;
                  return (
                    <div
                      key={st.stage}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        isPast
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : isCurrent
                          ? 'bg-purple-600/30 border-purple-400 text-white shadow-xs'
                          : 'bg-white/5 border-white/10 text-purple-300/50'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-bold">
                        {isPast ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : isCurrent ? (
                          <RefreshCw className="w-3 h-3 text-pink-300 animate-spin" />
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-white/20 text-[9px] flex items-center justify-center">
                            {st.stage}
                          </span>
                        )}
                        <span>{st.label}</span>
                      </div>
                      <p className="text-[10px] mt-0.5 opacity-80 truncate">{st.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Terminal Logs Window */}
          <div className="bg-[#0b0f19] rounded-3xl border border-slate-800 shadow-xl overflow-hidden text-xs font-mono">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                </div>
                <span className="text-slate-400 text-[11px] ml-2 font-medium">
                  extractor_execution_stream.log
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] text-pink-400 bg-pink-950/40 px-2 py-0.5 rounded border border-pink-900/40">
                <Zap className="w-2.5 h-2.5" />
                Live Agent
              </span>
            </div>

            <div
              ref={logContainerRef}
              className="p-4 space-y-2 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700"
            >
              {EXTRACTION_LOGS.slice(0, activeLogIndex + 1).map((log, i) => (
                <div key={i} className="flex items-start gap-2.5 text-slate-300 leading-relaxed">
                  <span className="text-purple-400 font-bold select-none text-[11px]">
                    [{log.time}]
                  </span>
                  <span className={i === activeLogIndex ? 'text-emerald-300 font-semibold' : 'text-slate-300'}>
                    {log.text}
                  </span>
                </div>
              ))}
              {!isFinished && (
                <div className="flex items-center gap-2 text-pink-400 animate-pulse pt-1">
                  <span className="inline-block w-1.5 h-3 bg-pink-400"></span>
                  <span className="text-[11px]">Generating JSON payloads...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live JSON Preview & Quick Stats (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Code Preview Stream */}
          <div className="bg-[#0b0f19] rounded-3xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-full min-h-[380px]">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-pink-300 font-mono font-semibold">
                <Code2 className="w-3.5 h-3.5 text-purple-400" />
                <span>live_extracted_schema.json</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">application/json</span>
            </div>

            <div className="p-4 flex-1 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed bg-[#0b0f19] relative">
              <div className="absolute top-3 right-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-200 border border-purple-700">
                  <Sparkles className="w-2.5 h-2.5 text-pink-400 animate-spin" />
                  Streaming
                </span>
              </div>
              <pre className="text-xs font-mono text-emerald-300">
                <code>{CODE_PREVIEWS[codeSnippetIndex]}</code>
              </pre>
            </div>

            {/* Bottom mini-metrics in code card */}
            <div className="px-4 py-3 bg-slate-900/90 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Extraction Rate</span>
                <span className="font-mono font-bold text-slate-200">3,420 SKUs/sec</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Schema Integrity</span>
                <span className="font-mono font-bold text-emerald-400">100% Passed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
