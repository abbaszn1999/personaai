"use client";

import * as React from "react";
import { parseOnboardingAudiences } from "../audiences";
import type { TryOnAudience } from "../types";

/**
 * The audiences the merchant's dashboard preview should offer, mirroring what shoppers get from
 * the public embed config. `undefined` while loading or on any failure — which the audience
 * step treats as "show every choice", so the preview never blocks on this lookup.
 */
export function useOnboardingAudiences(): TryOnAudience[] | undefined {
  const [audiences, setAudiences] = React.useState<TryOnAudience[] | undefined>(undefined);

  React.useEffect(() => {
    let active = true;
    fetch("/api/store-connection/onboarding-audiences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { audiences?: unknown } | null) => {
        if (active) setAudiences(parseOnboardingAudiences(data?.audiences));
      })
      .catch(() => {
        // Keep the full list; the preview is still usable without the filter.
      });
    return () => {
      active = false;
    };
  }, []);

  return audiences;
}
