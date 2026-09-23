"use client";

import * as React from "react";
import type { UsageReportPayload, UsageSessionsPayload } from "../types";

export function useUsageReport(apiQuery: string, page: number, ready: boolean) {
  const [report, setReport] = React.useState<UsageReportPayload | null>(null);
  const [sessions, setSessions] = React.useState<UsageSessionsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const sessionsQuery = new URLSearchParams(apiQuery);
    sessionsQuery.set("page", String(page));
    Promise.all([
      fetch(`/api/account/usage/report?${apiQuery}`, { cache: "no-store" }),
      fetch(`/api/account/usage/sessions?${sessionsQuery.toString()}`, { cache: "no-store" }),
    ])
      .then(async ([reportResponse, sessionsResponse]) => {
        const reportBody = await reportResponse.json().catch(() => ({}));
        const sessionsBody = await sessionsResponse.json().catch(() => ({}));
        if (!reportResponse.ok) throw new Error(reportBody.error || "Unable to load usage");
        if (!sessionsResponse.ok) throw new Error(sessionsBody.error || "Unable to load shoppers");
        return { reportBody, sessionsBody };
      })
      .then((payload) => {
        if (!active) return;
        setReport(payload.reportBody as UsageReportPayload);
        setSessions(payload.sessionsBody as UsageSessionsPayload);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load usage");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiQuery, page, ready]);

  return { report, sessions, loading, error };
}
