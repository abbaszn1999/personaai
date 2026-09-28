"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/sign-in");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col rounded-[var(--radius-2xl)] sidebar-panel p-4">
      <div className="px-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Persona AI</p>
        <p className="font-display text-lg font-extrabold text-[var(--color-text-primary)]">Owner</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {LINKS.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[var(--color-brand-light)] text-[var(--color-brand-strong)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-base)]"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--color-border)] pt-3">
        <p className="truncate px-2 text-xs text-[var(--color-text-muted)]">{email}</p>
        <button type="button" onClick={signOut} className="mt-2 w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-base)]">
          Sign out
        </button>
      </div>
    </aside>
  );
}
