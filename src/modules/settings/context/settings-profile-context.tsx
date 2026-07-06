"use client";

import * as React from "react";
import { useUser } from "@/modules/auth/context/user-context";

export interface SettingsProfile {
  firstName: string | null;
  lastName: string | null;
  email: string;
  provider: string;
  profileImageUrl: string | null;
  googleId: string | null;
  hasPassword: boolean;
}

interface SettingsProfileContextValue {
  profile: SettingsProfile | null;
  loading: boolean;
  updateLocal: (patch: Partial<SettingsProfile>) => void;
}

const SettingsProfileContext = React.createContext<SettingsProfileContextValue | null>(null);

export function SettingsProfileProvider({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const [patch, setPatch] = React.useState<Partial<SettingsProfile>>({});

  const profile = React.useMemo<SettingsProfile | null>(() => {
    if (!user) return null;
    return {
      firstName: patch.firstName ?? user.firstName,
      lastName: patch.lastName ?? user.lastName,
      email: user.email,
      provider: user.provider,
      profileImageUrl: patch.profileImageUrl ?? user.profileImageUrl,
      googleId: user.googleId,
      hasPassword: patch.hasPassword ?? user.hasPassword,
    };
  }, [user, patch]);

  const updateLocal = React.useCallback((next: Partial<SettingsProfile>) => {
    setPatch((prev) => ({ ...prev, ...next }));
  }, []);

  const value = React.useMemo(
    () => ({ profile, loading: !user, updateLocal }),
    [profile, user, updateLocal]
  );

  return (
    <SettingsProfileContext.Provider value={value}>
      {children}
    </SettingsProfileContext.Provider>
  );
}

export function useSettingsProfile() {
  const ctx = React.useContext(SettingsProfileContext);
  if (!ctx) {
    throw new Error("useSettingsProfile must be used within SettingsProfileProvider");
  }
  return ctx;
}
