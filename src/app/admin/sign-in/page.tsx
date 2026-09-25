import { AdminSignInForm } from "@/modules/admin/admin-sign-in-form";

export default function AdminSignInPage() {
  return (
    <div className="dashboard-theme flex min-h-screen items-center justify-center bg-[var(--color-app-frame)] p-6">
      <AdminSignInForm />
    </div>
  );
}
