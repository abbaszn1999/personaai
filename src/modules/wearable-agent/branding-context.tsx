"use client";

import * as React from "react";

export interface WearableBranding {
  agentName: string;
  logoUrl: string | null;
  /** When false, the Image/Live camera switch is hidden. Default on. */
  liveTryOnEnabled: boolean;
}

const DEFAULT_BRANDING: WearableBranding = {
  agentName: "Style Assistant",
  logoUrl: null,
  liveTryOnEnabled: true,
};

const WearableBrandingContext = React.createContext<WearableBranding>(DEFAULT_BRANDING);

export function WearableBrandingProvider({
  branding,
  children,
}: {
  branding?: Partial<WearableBranding>;
  children: React.ReactNode;
}) {
  const value: WearableBranding = {
    agentName: branding?.agentName || DEFAULT_BRANDING.agentName,
    logoUrl: branding?.logoUrl ?? DEFAULT_BRANDING.logoUrl,
    liveTryOnEnabled: branding?.liveTryOnEnabled !== false,
  };
  return <WearableBrandingContext.Provider value={value}>{children}</WearableBrandingContext.Provider>;
}

export function useWearableBranding(): WearableBranding {
  return React.useContext(WearableBrandingContext);
}
