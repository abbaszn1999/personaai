"use client";

import { DashboardPageHeader } from "@/components/layout/dashboard-header-context";
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
        <DeleteAccountCard />
      </div>
    </SettingsProfileProvider>
  );
}
