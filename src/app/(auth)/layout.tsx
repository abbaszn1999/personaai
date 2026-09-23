import type { Metadata } from "next";
import { ThemeToggle } from "@/modules/theme/theme-toggle";

export const metadata: Metadata = {
  title: "Autommerce",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-theme relative min-h-screen content-panel flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
