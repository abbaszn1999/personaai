import { Check, ArrowRight } from 'lucide-react';
import { StageNumber } from '../types';

interface StepperProps {
  currentStage: StageNumber;
  highestReachedStage: StageNumber;
  onSelectStage: (stage: StageNumber) => void;
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
}: StepperProps) {
  return (
    <div className="w-full bg-white border-b border-slate-200/80 shadow-2xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between w-full gap-2">
            {STEPS.map((step, idx) => {
              const isCompleted = currentStage > step.stage;
              const isCurrent = currentStage === step.stage;
              const isAccessible = step.stage <= highestReachedStage;

              return (
                <li key={step.stage} className="flex-1 flex items-center">
                  <div className="flex items-center w-full">
                    <button
                      type="button"
                      disabled={!isAccessible}
                      onClick={() => isAccessible && onSelectStage(step.stage)}
                      className={`group flex items-center gap-2.5 text-left w-full transition-all duration-200 rounded-lg p-1.5 ${
                        isAccessible
                          ? 'cursor-pointer hover:bg-slate-50'
                          : 'cursor-not-allowed opacity-60'
                      }`}
                    >
                      {/* Step Circle Indicator */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                          isCompleted
                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                            : isCurrent
                            ? 'bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] text-white shadow-md shadow-purple-500/25 ring-3 ring-purple-100 ring-offset-1 scale-105'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 group-hover:border-slate-300'
                        }`}
                      >
                        {isCompleted ? (
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
                              isCurrent
                                ? 'text-purple-950 font-bold'
                                : isCompleted
                                ? 'text-slate-800'
                                : 'text-slate-500'
                            }`}
                          >
                            <span className="hidden xl:inline">{step.title}</span>
                            <span className="xl:hidden">{step.shortLabel}</span>
                          </span>

                          {step.badge ? (
                            <span className="hidden lg:inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100/80 text-purple-700 uppercase tracking-wider">
                              {step.badge}
                            </span>
                          ) : null}
                        </div>

                        <span className="hidden md:block text-[10px] text-slate-600 truncate">
                          {isCompleted
                            ? 'Completed'
                            : isCurrent
                            ? 'Active Stage'
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
