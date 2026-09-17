"use client";

import * as React from "react";

export interface EmbedShopperSession {
  email: string;
  signOut: () => void;
}

export const EmbedShopperSessionContext = React.createContext<EmbedShopperSession | null>(null);

export function useEmbedShopperSession(): EmbedShopperSession | null {
  return React.useContext(EmbedShopperSessionContext);
}
