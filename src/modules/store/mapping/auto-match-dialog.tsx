"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import {
  AUTO_MATCH_DEADLINE_GRACE_MS,
  AUTO_MATCH_DEADLINE_MS,
  IDLE_AUTO_MATCH,
  type AutoMatchJobState,
} from "@/lib/catalog/auto-match-state";
import { autoMatchSteps, formatElapsed, type AutoMatchStepState } from "./auto-match-steps";

const AUTO_MATCH_URL = "/api/store-connection/persona-mapping/auto-match";
const POLL_MS = 2000;
const RETRY_READ_MS = 4000;
/** Long enough to read that it finished before the dialog closes on the updated mapping. */
const DONE_CLOSE_MS = 1800;
/**
 * The page stops following a run this long after it started. The server stops it at the deadline and
 * reports that itself, so this only matters when the page cannot reach the server at all.
 */
const GIVE_UP_MS = AUTO_MATCH_DEADLINE_MS + AUTO_MATCH_DEADLINE_GRACE_MS + 60_000;

/** The state of a run the page just started, until its first read from the server. */
export function startedAutoMatch(jobId: string, total: number): AutoMatchJobState {
  const now = new Date().toISOString();
  return {
    ...IDLE_AUTO_MATCH,
    status: "running",
    jobId,
    phase: "sampling",
    startedAt: now,
    heartbeatAt: now,
    total,
  };
}

export async function readAutoMatch(): Promise<AutoMatchJobState | null> {
  try {
    const res = await fetch(AUTO_MATCH_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { autoMatch?: AutoMatchJobState }).autoMatch ?? null;
  } catch {
    return null;
  }
}

/**
 * Follows a run on the server until it finishes. `onDone` loads the saved result into the page; the
 * dialog then closes by itself. Polling stops with the dialog, and a page opened later picks the run
 * up again from the mapping read.
 */
export function useAutoMatchTracker(onDone: (job: AutoMatchJobState) => Promise<void>) {
  const [job, setJob] = React.useState<AutoMatchJobState | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [readFailures, setReadFailures] = React.useState(0);
  const onDoneRef = React.useRef(onDone);
  const appliedJobRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  React.useEffect(() => {
    if (!job || job.status !== "running") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const read = await readAutoMatch();
      if (cancelled) return;
      const startedAt = job.startedAt ? Date.parse(job.startedAt) : Date.now();
      if (!read) {
        if (Date.now() - startedAt > GIVE_UP_MS) {
          setJob({ ...job, status: "failed", error: "The page could not reach the server to follow AI matching. Refresh to check on it." });
        } else {
          setReadFailures((count) => count + 1);
        }
        return;
      }
      setReadFailures(0);
      if (read.status === "idle") {
        setJob({ ...job, status: "failed", error: "AI matching was cleared before it finished." });
      } else {
        setJob(read);
      }
    }, readFailures > 0 ? RETRY_READ_MS : POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job, readFailures]);

  React.useEffect(() => {
    if (!job || job.status !== "done" || !job.jobId || appliedJobRef.current === job.jobId) return;
    appliedJobRef.current = job.jobId;
    const finished = job;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      setApplying(true);
      try {
        await onDoneRef.current(finished);
      } finally {
        setApplying(false);
        closeTimer = setTimeout(() => setJob((current) => (current === finished ? null : current)), DONE_CLOSE_MS);
      }
    })();
    return () => {
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [job]);

  const track = React.useCallback((next: AutoMatchJobState) => {
    setReadFailures(0);
    setJob(next);
  }, []);
  const close = React.useCallback(() => setJob(null), []);

  return { job, applying, track, close };
}

export function AutoMatchDialog({
  job,
  applying,
  storeName,
  onClose,
}: {
  job: AutoMatchJobState;
  applying: boolean;
  storeName: string;
  onClose: () => void;
}) {
  const running = job.status === "running";
  const done = job.status === "done";
  const failed = job.status === "failed";
  const locked = running || applying;
  const ignoreClose = React.useCallback(() => undefined, []);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const startedAt = job.startedAt ? Date.parse(job.startedAt) : now;
  const endedAt = !running && job.finishedAt ? Date.parse(job.finishedAt) : now;
  const elapsed = formatElapsed(Math.max(0, endedAt - startedAt));

  return (
    <Modal
      isOpen
      onClose={locked ? ignoreClose : onClose}
      size="sm"
      icon={<Sparkles className="h-4 w-4" />}
      title={done ? "AI matching is done" : failed ? "AI matching stopped" : "AI matching your categories"}
      description={storeName}
      footer={
        failed ? (
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : undefined
      }
    >
      <ol className="space-y-3">
        {autoMatchSteps(job).map((step) => (
          <li key={step.label} className="flex items-start gap-2.5">
            <StepIcon state={step.state} />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.state === "waiting" ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-primary)]",
                )}
              >
                {step.label}
              </p>
              {step.detail && (
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    step.state === "failed" ? "text-[var(--color-error)]" : "text-[var(--color-text-secondary)]",
                  )}
                >
                  {step.detail}
                </p>
              )}
              {step.percent !== undefined && step.state === "active" && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-brand)]/15">
                  <div
                    className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-500"
                    style={{ width: `${step.percent}%` }}
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[11px] font-semibold text-[var(--color-text-secondary)]">
        {running ? `Elapsed ${elapsed} of at most ${formatElapsed(AUTO_MATCH_DEADLINE_MS)}` : `Took ${elapsed}`}
      </p>
      {running && (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
          Matching runs on the server and saves itself. You can refresh or leave this page; the results appear on
          the Mapping tab when it is done.
        </p>
      )}
      {done && (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
          {applying ? "Loading the matches into your mapping…" : "Your mapping is updated. Review the matches before continuing to Setup."}
        </p>
      )}
      {failed && job.finishedAt && (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
          Nothing was saved. Close this and press Auto-Match to try again.
        </p>
      )}
    </Modal>
  );
}

function StepIcon({ state }: { state: AutoMatchStepState }) {
  if (state === "done") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />;
  if (state === "active") return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-brand)]" />;
  if (state === "failed") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-error)]" />;
  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />;
}
