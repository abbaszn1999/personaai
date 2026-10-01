"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { isRunWorking } from "../server-types";
import { useSizingStore } from "../store";
import { StageFiveAcsTable } from "./stage-five-acs-table";

export function StageConfirmation() {
  const router = useRouter();
  const pathname = usePathname();
  const run = useSizingStore((state) => state.run);
  const loadRun = useSizingStore((state) => state.loadRun);
  const prevStage = useSizingStore((state) => state.prevStage);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const publishRunId = React.useRef<string | null>(null);
  const publishObservedWorking = React.useRef(false);

  React.useEffect(() => {
    void loadRun();
  }, [loadRun]);

  React.useEffect(() => {
    if (!isRunWorking(run)) return;
    const timer = window.setInterval(() => void loadRun(), 2_000);
    return () => window.clearInterval(timer);
  }, [loadRun, run]);

  React.useEffect(() => {
    if (!publishing || !publishObservedWorking.current || run?.id !== publishRunId.current) return;
    if (isRunWorking(run)) return;

    const timer = window.setTimeout(() => {
      setPublishing(false);
      publishRunId.current = null;
      publishObservedWorking.current = false;
      if (run.status === "complete") {
        setNotice("ACS products were republished successfully.");
      } else if (run.status === "failed") {
        setError(run.error ?? "Sizing publish failed.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [publishing, run]);

  async function startPublish() {
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/store-connection/sizing/publish", { method: "POST" });
      const body = await response.json() as {
        run?: NonNullable<typeof run>;
        error?: string;
        message?: string;
        rescanning?: boolean;
      };
      if (!response.ok) throw new Error(body.error ?? "Could not publish sizing");
      if (body.run) {
        publishRunId.current = body.run.id;
        publishObservedWorking.current = isRunWorking(body.run);
      }
      if (body.rescanning) setNotice(body.message ?? "A fresh catalog scan has started.");
      await loadRun();
    } catch (caught) {
      setPublishing(false);
      publishRunId.current = null;
      publishObservedWorking.current = false;
      setError(caught instanceof Error ? caught.message : "Could not publish sizing");
    }
  }

  const publishWorking = publishing || isRunWorking(run);
  const publishProgress =
    publishWorking && run?.phaseTotal && run.phaseDone !== null
      ? ` ${Math.min(run.phaseDone, run.phaseTotal).toLocaleString()}/${run.phaseTotal.toLocaleString()}`
      : "";
  const publishLabel = publishWorking
    ? run?.stage === "resolve"
      ? `Preparing sizing data…${publishProgress}`
      : run?.stage === "publish"
        ? `Publishing to ACS…${publishProgress}`
        : `Preparing catalog…${publishProgress}`
    : run?.publishedAt
      ? "Republish sizing"
      : "Finish & publish sizing";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-pink-50 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-violet-700">Stage 5 of 5 · ACS Catalog Mirror</span>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                ACS Product Preview &amp; Published Catalog
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Before publishing, this table generates the exact PRIMARY and VARIANT payload for approval; afterward, it reads the same columns directly from ACS.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Last sizing publish</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {run?.publishedAt ? new Date(run.publishedAt).toLocaleString() : "Not published"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">{notice}</div>}

      <StageFiveAcsTable refreshKey={run?.publishedAt} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={prevStage}
          disabled={publishWorking}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Size Chart Research
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {run?.publishedAt && !publishWorking && (
            <button
              type="button"
              onClick={() => router.push(`${pathname}?section=sizingtester`)}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-2.5 text-sm font-bold text-violet-700 shadow-sm"
            >
              Open Sizing Tester <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            disabled={publishWorking}
            aria-busy={publishWorking}
            onClick={() => void startPublish()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {publishLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
