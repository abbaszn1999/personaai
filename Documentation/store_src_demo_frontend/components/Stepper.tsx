import { Check, ArrowRight, FastForward } from 'lucide-react';
import { StageNumber } from '../types';

interface StepperProps {
  currentStage: StageNumber;
  highestReachedStage: StageNumber;
  onSelectStage: (stage: StageNumber) => void;
  hasExistingSizeChart?: boolean;
}

interface StepMeta {
  stage: StageNumber;
  title: string;
  shortLabel: string;
  badge?: string;
}

const STEPS: StepMeta[] = [
  { stage: 1, title: 'Column Mapping', shortLabel: 'Mapping' },
  { stage: 2, title: 'Item Preview', shortLabel: 'Preview' },
  { stage: 3, title: 'Brand Discovery', shortLabel: 'Brands', badge: 'AI' },
  { stage: 4, title: 'Size Chart Research', shortLabel: 'Research', badge: 'AI' },
  { stage: 5, title: 'Chart Assignment', shortLabel: 'Assignment', badge: 'Rule' },
  { stage: 6, title: 'Active Overview', shortLabel: 'Active' },
];

export function Stepper({
  currentStage,
  highestReachedStage,
  onSelectStage,
  hasExistingSizeChart = false,
}: StepperProps) {
  return (
    <div className="w-full bg-white border-b border-slate-200/80 shadow-2xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between w-full gap-2">
            {STEPS.map((step, idx) => {
              const isSkipped = hasExistingSizeChart && [2, 3, 4, 5].includes(step.stage);
              const isCompleted = hasExistingSizeChart
                ? (currentStage === 6 && step.stage === 1)
                : currentStage > step.stage;
              const isCurrent = currentStage === step.stage;
              // If an existing size chart is attached, step 6 is accessible directly from step 1!
              const isAccessible = hasExistingSizeChart
                ? (step.stage === 1 || step.stage === 6)
                : step.stage <= highestReachedStage;

              return (
                <li key={step.stage} className="flex-1 flex items-center">
                  <div className="flex items-center w-full">
                    <button
                      type="button"
                      disabled={!isAccessible || isSkipped}
                      onClick={() => isAccessible && !isSkipped && onSelectStage(step.stage)}
                      title={
                        isSkipped
                          ? `Step ${step.stage} skipped: Existing store size chart attached in Step 1`
                          : undefined
                      }
                      className={`group flex items-center gap-2.5 text-left w-full transition-all duration-200 rounded-lg p-1.5 ${
                        isSkipped
                          ? 'cursor-not-allowed opacity-55'
                          : isAccessible
                          ? 'cursor-pointer hover:bg-slate-50'
                          : 'cursor-not-allowed opacity-60'
                      }`}
                    >
                      {/* Step Circle Indicator */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                          isSkipped
                            ? 'bg-slate-100 text-slate-400 border border-dashed border-slate-300'
                            : isCompleted
                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                            : isCurrent
                            ? 'bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-purple-500/25 ring-3 ring-purple-100 ring-offset-1 scale-105'
                            : hasExistingSizeChart && step.stage === 6
                            ? 'bg-indigo-50 text-indigo-700 border-2 border-indigo-400 font-extrabold ring-2 ring-indigo-100 hover:bg-indigo-100 animate-pulse'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 group-hover:border-slate-300'
                        }`}
                      >
                        {isSkipped ? (
                          <span className="text-[10px] font-mono text-slate-400">✕</span>
                        ) : isCompleted ? (
                          <Check className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          step.stage
                        )}
                      </div>

                      {/* Text Label */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-semibold truncate transition-colors ${
                              isSkipped
                                ? 'text-slate-400 line-through decoration-slate-300'
                                : isCurrent
                                ? 'text-purple-950 font-bold'
                                : isCompleted
                                ? 'text-slate-800'
                                : hasExistingSizeChart && step.stage === 6
                                ? 'text-indigo-900 font-bold'
                                : 'text-slate-500'
                            }`}
                          >
                            <span className="hidden xl:inline">{step.title}</span>
                            <span className="xl:hidden">{step.shortLabel}</span>
                          </span>

                          {isSkipped ? (
                            <span className="hidden lg:inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">
                              Skipped
                            </span>
                          ) : hasExistingSizeChart && step.stage === 6 && !isCurrent ? (
                            <span className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-700 uppercase tracking-wider border border-indigo-200">
                              <FastForward className="w-2.5 h-2.5" />
                              Direct
                            </span>
                          ) : step.badge ? (
                            <span className="hidden lg:inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100/80 text-purple-700 uppercase tracking-wider">
                              {step.badge}
                            </span>
                          ) : null}
                        </div>

                        <span className="hidden md:block text-[10px] text-slate-600 truncate">
                          {isSkipped
                            ? 'Skipped (Existing Chart)'
                            : isCompleted
                            ? 'Completed'
                            : isCurrent
                            ? 'Active Stage'
                            : hasExistingSizeChart && step.stage === 6
                            ? 'Click to Open Step 6'
                            : `Step ${step.stage}`}
                        </span>
                      </div>
                    </button>

                    {/* Step Divider Arrow */}
                    {idx < STEPS.length - 1 && (
                      <div className="hidden sm:flex items-center justify-center px-1 text-slate-300">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
