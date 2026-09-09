"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface RunPhase {
  id: string;
  label: string;
  description?: string;
}

export interface RunLogLine {
  /** Elapsed marker shown in the gutter, e.g. "1.7s". Display only. */
  time: string;
  text: string;
  phaseId: string;
}

interface RunProgressProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  phases: RunPhase[];
  logs: RunLogLine[];
  /** Total wall time of the simulated run. */
  durationMs?: number;
  /** Renders "n / total noun" under the percentage when set. */
  counter?: { total: number; noun: string };
  logFileName?: string;
  onComplete: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Optional right-hand column, e.g. a streaming payload preview. */
  renderAside?: (state: { percent: number; isFinished: boolean }) => React.ReactNode;
  className?: string;
}

const TICK_MS = 50;
/** Beat between hitting 100% and handing off, so the run doesn't vanish the instant it finishes. */
const SETTLE_MS = 600;

/**
 * The shared "an agent is working" screen behind brand discovery, chart research, and the JSON
 * extractor. Progress is time-driven rather than event-driven because none of the sizing agents
 * exist yet — when they do, the timer is the only part that changes; phases, logs, and layout are
 * already fed from props.
 */
export function RunProgress({
  title,
  subtitle,
  icon,
  phases,
  logs,
  durationMs = 4000,
  counter,
  logFileName = "agent_execution_stream.log",
  onComplete,
  onCancel,
  cancelLabel = "Cancel",
  renderAside,
  className,
}: RunProgressProps) {
  const [percent, setPercent] = React.useState(0);
  const [isFinished, setIsFinished] = React.useState(false);
  const logScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Held in a ref so a caller passing an inline arrow doesn't restart the run on every render.
  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    const totalSteps = Math.max(1, Math.round(durationMs / TICK_MS));
    let step = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      step += 1;
      setPercent(Math.min(100, Math.round((step / totalSteps) * 100)));
      if (step >= totalSteps) {
        clearInterval(interval);
        setIsFinished(true);
        settleTimer = setTimeout(() => onCompleteRef.current(), SETTLE_MS);
      }
    }, TICK_MS);

    return () => {
      clearInterval(interval);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [durationMs]);

  const activeLogIndex = logs.length
    ? Math.min(logs.length - 1, Math.floor((percent / 100) * logs.length))
    : -1;
  const activePhaseId = activeLogIndex >= 0 ? logs[activeLogIndex].phaseId : phases[0]?.id;
  const activePhaseIndex = phases.findIndex((phase) => phase.id === activePhaseId);

  React.useEffect(() => {
    const node = logScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [activeLogIndex]);

  function skip() {
    setPercent(100);
    setIsFinished(true);
    onCompleteRef.current();
  }

  const processed = counter ? Math.round((percent / 100) * counter.total) : 0;

  return (
    <div className={cn("space-y-5 animate-fade-in", className)}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className={cn("space-y-5", renderAside ? "lg:col-span-7" : "lg:col-span-12")}>
          <div className="card-base overflow-hidden p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                {icon && (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] gradient-brand text-white shadow-sm">
                    {icon}
                  </div>
                )}
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                    {title}
                    {isFinished && <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />}
                  </h3>
                  {subtitle && (
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-0">
                <span className="gradient-text-brand text-2xl font-bold tabular-nums">{percent}%</span>
                {counter && (
                  <p className="font-mono text-[11px] text-[var(--color-text-muted)]">
                    {processed.toLocaleString()} / {counter.total.toLocaleString()} {counter.noun}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-1.5">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-elevated)]">
                <div
                  className="h-full rounded-full gradient-brand transition-all duration-100 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[var(--color-text-muted)]">
                <span className="truncate">
                  {activeLogIndex >= 0 ? logs[activeLogIndex].text.split("...")[0] : ""}
                </span>
                <span className="shrink-0 pl-2">{isFinished ? "Ready" : "Working…"}</span>
              </div>
            </div>

            {phases.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {phases.map((phase, index) => {
                  const isPast = isFinished || index < activePhaseIndex;
                  const isCurrent = !isFinished && index === activePhaseIndex;
                  return (
                    <div
                      key={phase.id}
                      className={cn(
                        "rounded-[var(--radius-lg)] border p-2.5 text-center transition-all",
                        isPast &&
                          "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]",
                        isCurrent &&
                          "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]",
                        !isPast &&
                          !isCurrent &&
                          "border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-muted)]"
                      )}
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                        {isPast ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : isCurrent ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[var(--color-border)] text-[9px]">
                            {index + 1}
                          </span>
                        )}
                        <span className="truncate">{phase.label}</span>
                      </div>
                      {phase.description && (
                        <p className="mt-0.5 truncate text-[10px] opacity-80">{phase.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              {onCancel && (
                <Button variant="secondary" size="sm" onClick={onCancel}>
                  {cancelLabel}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={skip} disabled={isFinished}>
                Skip animation <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                {logFileName}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand-strong)]">
                <Zap className="h-2.5 w-2.5" /> Live agent
              </span>
            </div>
            <div
              ref={logScrollRef}
              className="max-h-52 space-y-2 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
            >
              {logs.slice(0, activeLogIndex + 1).map((log, index) => (
                <div key={`${log.time}-${index}`} className="flex items-start gap-2.5">
                  <span className="shrink-0 select-none font-semibold text-[var(--color-brand)]">
                    [{log.time}]
                  </span>
                  <span
                    className={
                      index === activeLogIndex
                        ? "font-semibold text-[var(--color-success)]"
                        : "text-[var(--color-text-secondary)]"
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))}
              {!isFinished && (
                <div className="flex animate-pulse items-center gap-2 pt-1 text-[var(--color-brand)]">
                  <span className="inline-block h-3 w-1.5 bg-[var(--color-brand)]" />
                  <span className="text-[11px]">Working…</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {renderAside && (
          <div className="lg:col-span-5">{renderAside({ percent, isFinished })}</div>
        )}
      </div>
    </div>
  );
}
