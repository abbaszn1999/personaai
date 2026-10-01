import { cn } from "@/lib/cn";

/**
 * Renders for one auth state only. Both branches ship in the static HTML and CSS
 * hides the wrong one, so signed-in visitors never see "Sign in" flash.
 */
export function AuthOnly({
  when,
  children,
  className,
}: {
  when: "signed-in" | "signed-out";
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn(when === "signed-in" ? "auth-in" : "auth-out", "contents", className)}>{children}</span>;
}
