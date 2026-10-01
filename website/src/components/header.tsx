"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthOnly } from "@/components/auth-only";
import { BrandMark } from "@/components/brand-mark";
import { MobileMenu } from "@/components/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { nav } from "@/lib/content";
import { appPath, site } from "@/lib/site";
import { cn } from "@/lib/cn";

export function Header() {
  const pathname = usePathname();

  return (
    <header
      id="top"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[var(--gutter)] py-3.5 min-[900px]:absolute min-[900px]:py-5"
    >
      {/* The blur lives on a child: backdrop-filter on the header itself would trap the menu's fixed overlay. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 border-b border-hairline bg-bg/80 backdrop-blur-xl min-[900px]:hidden"
      />
      <Link href="/" className="group flex items-center gap-2.5 text-bone" aria-label={`${site.name} home`}>
        <BrandMark className="h-7 w-7 transition-transform duration-500 group-hover:scale-110" />
        <span className="font-display text-sm font-semibold tracking-tight">{site.name}</span>
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-bone min-[900px]:flex">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("relative transition-opacity hover:opacity-100", active ? "opacity-100" : "opacity-60")}
            >
              {item.label}
              {active ? <span className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand" /> : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2.5 min-[900px]:gap-3">
        <ThemeToggle className="max-[899px]:hidden" />
        <AuthOnly when="signed-out">
          <a
            href={appPath("/sign-in")}
            className="rounded-full border border-hairline px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition hover:border-bone hover:bg-bone hover:text-[var(--bg)] min-[900px]:px-4 min-[900px]:tracking-[0.2em]"
          >
            Sign in
          </a>
        </AuthOnly>
        <AuthOnly when="signed-in">
          <a
            href={appPath("/dashboard")}
            className="group inline-flex items-center gap-2 rounded-full bg-bone px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--bg)] transition hover:bg-brand hover:text-white min-[900px]:px-4 min-[900px]:tracking-[0.2em]"
          >
            Dashboard
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
          </a>
        </AuthOnly>
        <MobileMenu />
      </div>
    </header>
  );
}
