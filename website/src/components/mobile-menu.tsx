"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthOnly } from "@/components/auth-only";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { nav } from "@/lib/content";
import { appPath, site } from "@/lib/site";
import { cn } from "@/lib/cn";

/**
 * Full-screen navigation for viewports below 900px, where the inline nav is hidden.
 * Open state is keyed to the pathname it was opened on, so navigating closes it without an effect.
 */
export function MobileMenu() {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenAt(null);
    };
    const onResize = () => {
      if (window.innerWidth >= 900) setOpenAt(null);
    };
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const close = () => setOpenAt(null);

  return (
    <div className="min-[900px]:hidden">
      <button
        type="button"
        onClick={() => setOpenAt(pathname)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-full border border-hairline bg-surface/50 text-bone backdrop-blur transition active:scale-95"
      >
        <span className="h-px w-4 bg-current" />
        <span className="h-px w-4 bg-current" />
      </button>

      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        data-lenis-prevent
        className={cn(
          "fixed inset-0 z-[70] flex flex-col overflow-y-auto overscroll-contain bg-bg transition-[opacity,visibility] duration-500",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(247,109,1,0.22),transparent_70%)]"
        />

        <div className="relative flex items-center justify-between px-[var(--gutter)] py-5">
          <Link href="/" onClick={close} className="flex items-center gap-2.5 text-bone" aria-label={`${site.name} home`}>
            <BrandMark className="h-7 w-7" />
            <span className="font-display text-sm font-semibold tracking-tight">{site.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="relative h-9 w-9 rounded-full border border-hairline bg-surface/50 text-bone transition active:scale-95"
            >
              <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />
              <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current" />
            </button>
          </div>
        </div>

        <nav aria-label="Mobile" className="relative mt-8 px-[var(--gutter)]">
          <ul className="border-t border-hairline">
            {nav.map((item, index) => {
              const active = pathname === item.href;
              return (
                <li
                  key={item.href}
                  className="border-b border-hairline transition-[opacity,transform] duration-700 ease-[var(--ease-expo)]"
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? "translateY(0)" : "translateY(16px)",
                    transitionDelay: open ? `${120 + index * 70}ms` : "0ms",
                  }}
                >
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className="group flex items-center gap-5 py-6"
                  >
                    <span className={cn("font-mono text-[11px]", active ? "text-brand" : "text-faint")}>0{index + 1}</span>
                    <span className="font-display text-[2.6rem] font-semibold leading-none tracking-[-0.045em] text-bone">
                      {item.label}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "ml-auto grid h-10 w-10 place-items-center rounded-full border text-bone transition",
                        active ? "border-brand bg-brand text-white" : "border-hairline group-active:border-brand",
                      )}
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className="relative mt-auto px-[var(--gutter)] pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 transition-[opacity,transform] duration-700 ease-[var(--ease-expo)]"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(16px)",
            transitionDelay: open ? "380ms" : "0ms",
          }}
        >
          <AuthOnly when="signed-out">
            <div className="grid gap-3">
              <a
                href={appPath("/sign-up")}
                className="flex items-center justify-center gap-3 rounded-full bg-[image:var(--grad-brand)] px-6 py-4 text-sm font-semibold text-white shadow-[0_14px_36px_-12px_rgba(247,109,1,0.6)] active:brightness-95"
              >
                Start the trial
                <span aria-hidden>→</span>
              </a>
              <a
                href={appPath("/sign-in")}
                className="flex items-center justify-center rounded-full border px-6 py-4 text-sm font-medium text-bone active:bg-surface"
                style={{ borderColor: "var(--hairline-strong)" }}
              >
                Sign in
              </a>
            </div>
          </AuthOnly>
          <AuthOnly when="signed-in">
            <a
              href={appPath("/dashboard")}
              className="flex items-center justify-center gap-3 rounded-full bg-bone px-6 py-4 text-sm font-semibold text-[var(--bg)] active:opacity-90"
            >
              Open your dashboard
              <span aria-hidden>→</span>
            </a>
          </AuthOnly>
          <a href={`mailto:${site.contactEmail}`} className="mt-6 block text-center text-sm text-muted">
            {site.contactEmail}
          </a>
        </div>
      </div>
    </div>
  );
}
