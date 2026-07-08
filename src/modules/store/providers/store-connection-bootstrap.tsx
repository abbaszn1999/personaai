"use client";

import * as React from "react";
import { useStoreConnectionStore } from "@/modules/store/store";

/**
 * Triggers a single store-connection fetch from the API on first dashboard mount.
 * Renders nothing — exists only to bridge the server layout into the Zustand store.
 */
export function StoreConnectionBootstrap() {
  const load = useStoreConnectionStore((s) => s.load);

  React.useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
