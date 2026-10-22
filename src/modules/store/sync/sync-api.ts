import type { SizingRun } from "@/modules/store/sizing/server-types";
import type { SyncSummary } from "@/lib/sync/summary";

export type { PendingProductView, PendingProductState, SyncHistoryView, SyncSummary } from "@/lib/sync/summary";

/** What `/sync/run` says about the products a sync took. */
export interface SyncRunProducts {
  total: number;
  removed: number;
  published: number;
  newBrands: Array<{ key: string; name: string }>;
}

export interface SyncRunResponse {
  run: SizingRun | null;
  products: SyncRunProducts | null;
}

export class SyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/store-connection/sync/${path}`, { cache: "no-store", ...init });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; reason?: string };
  if (!response.ok) {
    throw new SyncApiError(body.error ?? "Could not reach the server.", response.status, body.reason ?? null);
  }
  return body;
}

export const syncApi = {
  summary(offset = 0, historyOffset = 0) {
    return request<SyncSummary>(`summary?offset=${offset}&historyOffset=${historyOffset}`);
  },
  check() {
    return request<{ checked: number; found: number; removed: number }>("check", { method: "POST" });
  },
  start() {
    return request<{ run: SizingRun; claimed?: number }>("start", { method: "POST" });
  },
  run() {
    return request<SyncRunResponse>("run");
  },
  continueRun() {
    return request<{ run: SizingRun }>("run/continue", { method: "POST" });
  },
  cancel() {
    return request<{ cancelled: string }>("run/cancel", { method: "POST" });
  },
  retry() {
    return request<{ run: SizingRun }>("run/retry", { method: "POST" });
  },
};
