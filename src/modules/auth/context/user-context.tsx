"use client";

import { createContext, useContext } from "react";
import type { UserProfile } from "../lib/get-user";

const UserContext = createContext<UserProfile | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: UserProfile | null;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): UserProfile | null {
  return useContext(UserContext);
}
