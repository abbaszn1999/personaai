import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Autommerce",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-theme min-h-screen content-panel flex items-center justify-center p-4">
      {children}
    </div>
  );
}
