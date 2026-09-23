"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { COLOR_SCHEME_STORAGE_KEY, type ColorScheme } from "./color-scheme";

function applyColorScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", scheme);
  root.style.colorScheme = scheme;
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
  } catch {
    /* private mode */
  }
}

/** Sun while the app is dark, moon while it is light. Which icon shows is decided in CSS from
 *  `data-theme`, so the button hydrates the same on the server and the client. */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Switch between dark and light mode"
      onClick={() => {
        const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        applyColorScheme(current === "dark" ? "light" : "dark");
      }}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-sidebar-text-muted)] sidebar-glass sidebar-glass-hover transition-colors",
        className
      )}
    >
      <Sun className="theme-icon-for-dark h-4 w-4" />
      <Moon className="theme-icon-for-light h-4 w-4" />
    </button>
  );
}
