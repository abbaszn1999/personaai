"use client";

import * as React from "react";
import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Circle, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import {
  IDLE_SETUP_RESET,
  SETUP_RESET_CONFIRM_WORD,
  type SetupResetScope,
  type SetupResetState,
} from "@/lib/catalog/setup-reset-state";
import { storeSizingStage } from "../sizing/stage-storage";
import { resetSteps, type ResetStepState } from "./reset-steps";

const POLL_MS = 2000;
const RETRY_READ_MS = 5000;
/** A finished cleanup stays announced this long, so a merchant returning to the tab sees it ended. */
const DONE_VISIBLE_MS = 60 * 60_000;
/** Long enough to read that everything finished before the page moves to the first step. */
const DONE_REDIRECT_MS = 1500;

interface ResetStatusState {
  reset: SetupResetState;
  live: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  /** Resumes a failed cleanup. Returns the reason when it could not be restarted. */
  retry: () => Promise<string | null>;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** One read shared by the header button, the dialog and the Setup and Mapping gate, polled only while a cleanup runs. */
const useResetStatus = create<ResetStatusState>((set, get) => ({
  reset: IDLE_SETUP_RESET,
  live: false,
  loaded: false,
  load: async () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    let read = false;
    try {
      const res = await fetch("/api/store-connection/start-from-scratch", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { reset?: SetupResetState; live?: boolean };
        set({ reset: data.reset ?? IDLE_SETUP_RESET, live: data.live === true, loaded: true });
        read = true;
      } else if (res.status < 500) {
        // Signed out or no store: asking again will not change the answer.
        set({ loaded: true });
        return;
      }
    } catch {
      // Handled below with every other failed read.
    }
    // A failed read must not hold Setup and Mapping on a loading screen forever. They open on the
    // last state known, the server still refuses changes to a store being reset, and the read is
    // tried again until it lands.
    if (!read) set({ loaded: true });
    if (!read || get().reset.status === "running") {
      pollTimer = setTimeout(() => void get().load(), read ? POLL_MS : RETRY_READ_MS);
    }
  },
  retry: async () => {
    let problem: string | null = null;
    try {
      const res = await fetch("/api/store-connection/start-from-scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) problem = data.error ?? "Could not retry.";
    } catch {
      problem = "Could not reach the server.";
    }
    await get().load();
    return problem;
  },
}));

function useResetStatusLoaded() {
  const load = useResetStatus((s) => s.load);
  const loaded = useResetStatus((s) => s.loaded);
  React.useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);
}

function isPending(reset: SetupResetState): boolean {
  return reset.status === "running" || reset.status === "failed";
}

/**
 * "Start from scratch" in the Store header, on Setup and on Mapping.
 *
 * Setup's button keeps the category mapping and resets all five setup stages; Mapping's clears the
 * mapping as well. Either way the store's products are deleted from ACS, so the dialog spells out
 * what goes and what stays, warns when the store is live, and asks for the confirm word.
 */
export function StartFromScratchButton({
  scope,
  connectionId,
  storeName,
  returnHref,
}: {
  scope: SetupResetScope;
  connectionId: string;
  storeName: string;
  /** Where to land after the reset: the tab the merchant starts again from. */
  returnHref: string;
}) {
  useResetStatusLoaded();
  const reset = useResetStatus((s) => s.reset);
  const [open, setOpen] = React.useState(false);
  const pending = isPending(reset);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={pending}
        title={pending ? "The previous reset has not finished yet" : undefined}
        className="border-[var(--color-error)]/40 text-[var(--color-error)] hover:border-[var(--color-error)]"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Start from scratch
      </Button>
      {open && (
        <StartFromScratchDialog
          scope={scope}
          connectionId={connectionId}
          storeName={storeName}
          returnHref={returnHref}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function StartFromScratchDialog({
  scope,
  connectionId,
  storeName,
  returnHref,
  onClose,
}: {
  scope: SetupResetScope;
  connectionId: string;
  storeName: string;
  returnHref: string;
  onClose: () => void;
}) {
  const live = useResetStatus((s) => s.live);
  const reset = useResetStatus((s) => s.reset);
  const load = useResetStatus((s) => s.load);
  const [typed, setTyped] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const confirmed = typed.trim().toUpperCase() === SETUP_RESET_CONFIRM_WORD;
  const finished = started && reset.status === "done";

  // A full reload once everything is verified gone, not a state patch: every Setup and Mapping
  // store, and the module-level caches behind them, start from what the server now holds.
  React.useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => window.location.assign(returnHref), DONE_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [finished, returnHref]);

  // The shared poll only runs while the server says "running"; a first read that failed would leave
  // this dialog waiting on nothing, so it asks again until it hears how the reset stands.
  React.useEffect(() => {
    if (!started || reset.status !== "idle") return;
    const timer = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(timer);
  }, [started, reset, load]);

  const removed = [
    ...(scope === "mapping" ? ["Your category mapping and the What You Sell scope"] : []),
    "Column Mapping, its approval and the size type (Stage 1)",
    "The catalog scan, item corrections and brand discovery (Stages 2 and 3). Brands are classified again on the next scan",
    "Your brand mapping and every private size chart you filled by hand (Stage 4)",
    "Every product of this store in Persona's search (ACS) (Stage 5)",
  ];
  const kept =
    scope === "mapping"
      ? "Your store connection, the shared global brand charts and your Style Guide stay. Other stores and other accounts are never touched."
      : "Your category mapping stays as it is, so Setup starts again from Stage 1 on the same mapping. Other stores and other accounts are never touched.";

  async function submit() {
    if (!confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/store-connection/start-from-scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirm: typed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start from scratch.");
        setSubmitting(false);
        return;
      }
      storeSizingStage(connectionId, 1);
      // Read before showing progress: until then the store still holds the previous reset's state,
      // and a "done" left from that one would end this one before it began.
      await load();
      setStarted(true);
    } catch {
      setError("Could not reach the server.");
    }
    setSubmitting(false);
  }

  if (started) {
    const running = reset.status === "running";
    return (
      <Modal
        isOpen
        onClose={running || finished ? () => undefined : onClose}
        size="md"
        icon={<RotateCcw className="h-4 w-4" />}
        title={finished ? "Everything is reset" : "Resetting this store"}
        description={storeName}
        footer={
          finished ? (
            <Button size="sm" onClick={() => window.location.assign(returnHref)}>
              {scope === "mapping" ? "Start again from Mapping" : "Start again from Stage 1"}
            </Button>
          ) : reset.status === "failed" ? (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : undefined
        }
      >
        <ResetProgress reset={reset} />
        {running && (
          <p className="mt-4 text-[11px] text-[var(--color-text-muted)]">
            Keep this open or close the page; the reset carries on either way, and Setup and Mapping stay
            closed until it has finished.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={submitting ? () => undefined : onClose}
      size="md"
      icon={<RotateCcw className="h-4 w-4" />}
      title={scope === "mapping" ? "Start Mapping and Setup from scratch" : "Start Setup from scratch"}
      description={storeName}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={() => void submit()} disabled={!confirmed || submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Delete and start over
          </Button>
        </>
      }
    >
      {live && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-error)]" />
          <p className="text-xs text-[var(--color-text-primary)]">
            <strong>This store is live.</strong> Shoppers get no product or size recommendations from Persona
            until you finish Setup and publish again in Stage 5.
          </p>
        </div>
      )}

      <p className={cn("text-xs font-semibold text-[var(--color-text-primary)]", live && "mt-4")}>
        This permanently deletes, for this store only:
      </p>
      <ul className="mt-2 space-y-1.5">
        {removed.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
            <X className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-error)]" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success)]" />
        {kept}
      </p>
      <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
        Removing the products from ACS takes about a minute for every 1,000 products. This dialog shows each
        step until everything is confirmed gone, then takes you to the first step.
      </p>

      <label className="mt-4 block">
        <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">
          Type <code className="font-mono">{SETUP_RESET_CONFIRM_WORD}</code> to confirm
        </span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          autoFocus
          disabled={submitting}
          className="mt-1 w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-2.5 py-1.5 font-mono text-sm text-[var(--color-text-primary)] focus:border-[var(--color-error)] focus:outline-none"
        />
      </label>

      {error && (
        <p className="mt-3 rounded-[var(--radius-lg)] border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}
    </Modal>
  );
}

function ResetProgress({ reset }: { reset: SetupResetState }) {
  const retry = useResetStatus((s) => s.retry);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);

  async function runRetry() {
    setRetrying(true);
    setRetryError(null);
    setRetryError(await retry());
    setRetrying(false);
  }

  return (
    <div>
      <ol className="space-y-3">
        {resetSteps(reset).map((step) => (
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

      {reset.status === "failed" && (
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" onClick={() => void runRetry()} disabled={retrying}>
            {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Retry
          </Button>
          <p className="text-xs text-[var(--color-text-muted)]">Retry continues from where it stopped.</p>
        </div>
      )}
      {retryError && <p className="mt-2 text-xs font-semibold text-[var(--color-error)]">{retryError}</p>}
    </div>
  );
}

function StepIcon({ state }: { state: ResetStepState }) {
  if (state === "done") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />;
  if (state === "active") return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-brand)]" />;
  if (state === "failed") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-error)]" />;
  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />;
}

/**
 * Setup and Mapping, closed while a Start from scratch is unfinished. Nothing of either is shown, so
 * no screen can load or save half-reset data; the reset's progress stands in their place, with Retry
 * when it stopped. Once it is done the content returns, under a notice that it finished.
 */
export function SetupResetGate({ children }: { children: React.ReactNode }) {
  useResetStatusLoaded();
  const reset = useResetStatus((s) => s.reset);
  const loaded = useResetStatus((s) => s.loaded);
  const [dismissedAt, setDismissedAt] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-10 text-xs text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading
      </div>
    );
  }

  if (isPending(reset)) {
    return (
      <div className="mx-auto mt-6 max-w-xl rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-6 py-5">
        <p className="text-sm font-bold text-[var(--color-text-primary)]">
          {reset.status === "failed" ? "The reset stopped before it finished" : "Resetting this store"}
        </p>
        <p className="mb-4 mt-0.5 text-xs text-[var(--color-text-secondary)]">
          Setup and Mapping open again once everything is confirmed gone.
        </p>
        <ResetProgress reset={reset} />
      </div>
    );
  }

  const recentlyDone =
    reset.status === "done" &&
    reset.finishedAt !== null &&
    now - Date.parse(reset.finishedAt) < DONE_VISIBLE_MS &&
    dismissedAt !== reset.finishedAt;

  return (
    <>
      {recentlyDone && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-4 py-3 text-[var(--color-success)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--color-text-primary)]">Started from scratch</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {reset.deleted.toLocaleString()} old product{reset.deleted === 1 ? "" : "s"} removed from ACS, and
              nothing of the previous setup is left. Work through the steps and publish in Stage 5 when ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissedAt(reset.finishedAt)}
            aria-label="Dismiss"
            className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {children}
    </>
  );
}
