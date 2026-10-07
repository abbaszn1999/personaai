"use client";

import * as React from "react";
import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
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

const POLL_MS = 3000;
/** A finished cleanup stays announced this long, so a merchant returning to the tab sees it ended. */
const DONE_VISIBLE_MS = 60 * 60_000;

interface ResetStatusState {
  reset: SetupResetState;
  live: boolean;
  loaded: boolean;
  load: () => Promise<void>;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** One read shared by the header button and the banner, polled only while a cleanup runs. */
const useResetStatus = create<ResetStatusState>((set, get) => ({
  reset: IDLE_SETUP_RESET,
  live: false,
  loaded: false,
  load: async () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    try {
      const res = await fetch("/api/store-connection/start-from-scratch", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { reset?: SetupResetState; live?: boolean };
        set({ reset: data.reset ?? IDLE_SETUP_RESET, live: data.live === true, loaded: true });
      }
    } catch {
      // The next poll or page load reads it again; a banner one beat late misleads nobody.
    }
    if (get().reset.status === "running") pollTimer = setTimeout(() => void get().load(), POLL_MS);
  },
}));

function useResetStatusLoaded() {
  const load = useResetStatus((s) => s.load);
  const loaded = useResetStatus((s) => s.loaded);
  React.useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);
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
  const running = reset.status === "running";

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={running}
        title={running ? "The previous reset is still removing products from ACS" : undefined}
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
  const [typed, setTyped] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const confirmed = typed.trim().toUpperCase() === SETUP_RESET_CONFIRM_WORD;

  const removed = [
    ...(scope === "mapping" ? ["Your category mapping and the What You Sell scope"] : []),
    "Column Mapping, its approval and the size type (Stage 1)",
    "The catalog scan, item corrections and brand discovery (Stages 2 and 3). Brands are classified again on the next scan",
    "Your brand mapping and every private size chart you filled by hand (Stage 4)",
    "Every product of this store in Persona's search (ACS) (Stage 5)",
  ];
  const kept =
    scope === "mapping"
      ? "Your store connection, the shared global brand charts and your Style Guide stay."
      : "Your category mapping stays as it is, so Setup starts again from Stage 1 on the same mapping.";

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
      // A full reload, not a state patch: every Setup and Mapping store, and the module-level caches
      // behind them, start from what the server now holds.
      window.location.assign(returnHref);
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
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
        This permanently deletes:
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
        Removing the products from ACS takes a few minutes and runs in the background. You can start
        again right away; publishing waits until it has finished.
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

/**
 * Where the background ACS cleanup stands, above Setup and Mapping: removing (with a running count),
 * failed (with Retry), or finished. Nothing shows when no reset has run recently.
 */
export function SetupResetBanner() {
  useResetStatusLoaded();
  const reset = useResetStatus((s) => s.reset);
  const load = useResetStatus((s) => s.load);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/store-connection/start-from-scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setRetryError(data.error ?? "Could not retry.");
    } catch {
      setRetryError("Could not reach the server.");
    }
    setRetrying(false);
    await load();
  }

  if (reset.status === "running") {
    return (
      <Banner tone="info" icon={<Loader2 className="h-4 w-4 animate-spin" />}>
        <p className="text-sm font-bold text-[var(--color-text-primary)]">Removing this store&apos;s old products from ACS</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
          {reset.deleted > 0 ? `${reset.deleted.toLocaleString()} removed so far. ` : ""}
          You can work through Setup meanwhile; publishing in Stage 5 waits until this finishes.
        </p>
      </Banner>
    );
  }

  if (reset.status === "failed") {
    return (
      <Banner
        tone="error"
        icon={<AlertTriangle className="h-4 w-4" />}
        action={
          <Button size="sm" variant="secondary" onClick={() => void retry()} disabled={retrying}>
            {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Retry
          </Button>
        }
      >
        <p className="text-sm font-bold text-[var(--color-text-primary)]">The old products were not all removed from ACS</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
          {reset.error ?? "The cleanup stopped before it finished."}
          {reset.deleted > 0 ? ` ${reset.deleted.toLocaleString()} were removed before it stopped.` : ""} Publishing
          stays possible, but retry first so no old product is left behind.
        </p>
        {retryError && <p className="mt-1 text-xs font-semibold text-[var(--color-error)]">{retryError}</p>}
      </Banner>
    );
  }

  const recentlyDone =
    reset.status === "done" &&
    reset.finishedAt !== null &&
    now - Date.parse(reset.finishedAt) < DONE_VISIBLE_MS &&
    dismissedAt !== reset.finishedAt;
  if (recentlyDone) {
    return (
      <Banner
        tone="success"
        icon={<CheckCircle2 className="h-4 w-4" />}
        action={
          <button
            type="button"
            onClick={() => setDismissedAt(reset.finishedAt)}
            aria-label="Dismiss"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        }
      >
        <p className="text-sm font-bold text-[var(--color-text-primary)]">Started from scratch</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
          {reset.deleted.toLocaleString()} old product{reset.deleted === 1 ? "" : "s"} removed from ACS. Nothing of the
          previous setup is left; work through the steps and publish in Stage 5 when ready.
        </p>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  action,
  children,
}: {
  tone: "info" | "error" | "success";
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)] text-[var(--color-error)]"
      : tone === "success"
        ? "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
        : "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]";
  return (
    <div className={cn("mb-4 flex items-start gap-2.5 rounded-[var(--radius-lg)] border px-4 py-3", toneClass)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
