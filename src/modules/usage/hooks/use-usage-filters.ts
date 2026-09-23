"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

export interface UsageFilters {
  range: string;
  source: string;
  tool: string;
  bucket: string;
  view: "usd" | "units";
  from: string;
  to: string;
  page: number;
  shopper: string;
}

const DEFAULTS: Record<string, string> = {
  range: "cycle",
  source: "all",
  tool: "all",
  bucket: "day",
  view: "usd",
};

export function useUsageFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = React.useMemo<UsageFilters>(() => {
    const page = Number.parseInt(params.get("page") ?? "0", 10);
    return {
      range: params.get("range") || "cycle",
      source: params.get("source") || "all",
      tool: params.get("tool") || "all",
      bucket: params.get("bucket") === "week" ? "week" : "day",
      view: params.get("view") === "units" ? "units" : "usd",
      from: params.get("from") || "",
      to: params.get("to") || "",
      page: Number.isFinite(page) && page > 0 ? page : 0,
      shopper: params.get("shopper") || "",
    };
  }, [params]);

  const update = React.useCallback(
    (patch: Partial<UsageFilters>) => {
      const next = new URLSearchParams(params.toString());
      const resetsPage = Object.keys(patch).some((key) => key !== "page" && key !== "shopper" && key !== "view");
      if (resetsPage && patch.page === undefined) next.delete("page");
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "" || value === 0 || value === DEFAULTS[key]) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const apiQuery = React.useMemo(() => {
    const query = new URLSearchParams();
    query.set("range", filters.range);
    query.set("source", filters.source);
    query.set("tool", filters.tool);
    query.set("bucket", filters.bucket);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone) query.set("tz", timeZone);
    return query.toString();
  }, [filters.range, filters.source, filters.tool, filters.bucket, filters.from, filters.to]);

  const ready = filters.range !== "custom" || Boolean(filters.from && filters.to);

  return { filters, update, apiQuery, ready };
}
