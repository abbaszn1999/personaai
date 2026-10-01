import { cn } from "@/lib/cn";

/** Both marks ship in the HTML; the theme attribute picks one, so there is no swap flash. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/autommerce-white.png" alt="" className={cn("light:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/autommerce-natural.png" alt="" className={cn("hidden light:block", className)} />
    </>
  );
}
