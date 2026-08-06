"use client";

import * as React from "react";

export type WearableTheme = "dark" | "light";

const WearableThemeContext = React.createContext<WearableTheme>("dark");

export function WearableThemeProvider({
  theme,
  children,
}: {
  theme: WearableTheme;
  children: React.ReactNode;
}) {
  return <WearableThemeContext.Provider value={theme}>{children}</WearableThemeContext.Provider>;
}

/** Reads the active wearable-agent theme ("dark" | "light"), set by the branding config for
 *  the embed widget / public embed page. Defaults to "dark" everywhere else (dashboard). */
export function useWearableTheme(): WearableTheme {
  return React.useContext(WearableThemeContext);
}
