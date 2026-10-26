"use client";

import * as React from "react";

export interface EmbedShopperSession {
  email: string;
  /** A one-time guest visit: no account, no saved profiles. */
  isGuest?: boolean;
  signOut: () => void;
}

export const EmbedShopperSessionContext = React.createContext<EmbedShopperSession | null>(null);

export function useEmbedShopperSession(): EmbedShopperSession | null {
  return React.useContext(EmbedShopperSessionContext);
}
