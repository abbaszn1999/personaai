"use client";

import * as React from "react";

export interface WearableBranding {
  agentName: string;
  logoUrl: string | null;
}

const DEFAULT_BRANDING: WearableBranding = {
  agentName: "Style Assistant",
  logoUrl: null,
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
  };
  return <WearableBrandingContext.Provider value={value}>{children}</WearableBrandingContext.Provider>;
}

export function useWearableBranding(): WearableBranding {
  return React.useContext(WearableBrandingContext);
}
