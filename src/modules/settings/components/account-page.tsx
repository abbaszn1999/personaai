"use client";

import { LogOut } from "lucide-react";
import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
import { Button } from "@/components/ui/button";
import { SettingsProfileProvider } from "../context/settings-profile-context";
import { DeleteAccountCard } from "./delete-account-card";
import { ProfileCard } from "./profile-card";
import { SignInCard } from "./sign-in-card";

export function AccountPage() {
  return (
    <SettingsProfileProvider>
      <DashboardPageHeader title="Account" description="Your profile and how you sign in" />
      <div className="p-6 space-y-6">
        <ProfileCard />
        <SignInCard />
        <div className="flex justify-end">
          <Button variant="secondary" className="gap-2 text-[var(--color-error)]" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
        <DeleteAccountCard />
      </div>
    </SettingsProfileProvider>
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/sign-in";
}
