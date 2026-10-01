import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { closing } from "@/lib/content";
import { appPath, site } from "@/lib/site";

const pages = [
  { href: "/features", label: "Features", note: "Everything in the fitting room" },
  { href: "/pricing", label: "Pricing", note: "Trial, Main and the GMV calculator" },
  { href: "/contact", label: "Contact", note: "Demos, sales and integration help" },
];

const account = [
  { href: appPath("/sign-up"), label: "Start the trial", className: "auth-out" },
  { href: appPath("/sign-in"), label: "Sign in", className: "auth-out" },
  { href: appPath("/dashboard"), label: "Open your dashboard", className: "auth-in" },
  { href: `mailto:${site.contactEmail}`, label: site.contactEmail },
];

export function Closing() {
  const words = Array.from({ length: 4 }, () => closing.marquee);

  return (
    <footer className="relative overflow-hidden pt-12 min-[900px]:pt-[10vh]">
      <a href={appPath("/sign-up")} className="group block border-y border-hairline py-8" aria-label={closing.cta}>
        <div className="marquee-track flex w-max animate-[marquee_28s_linear_infinite] group-hover:[animation-play-state:paused]">
          {[...words, ...words].map((word, index) => (
            <span
              key={index}
              className="flex items-center gap-10 pr-10 font-display text-[clamp(3rem,9vw,9rem)] font-semibold leading-none tracking-[-0.055em] text-bone transition-colors duration-500 group-hover:text-brand"
            >
              {word}
              <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-[image:var(--grad-brand)]" aria-hidden />
            </span>
          ))}
        </div>
      </a>

      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-[28rem] w-[60rem] -translate-x-1/2 translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(247,109,1,0.12),transparent_65%)]" />

      <div className="relative mx-auto grid max-w-[1400px] gap-14 px-[var(--gutter)] pb-10 pt-16 min-[1000px]:grid-cols-[1fr_1.3fr_0.8fr] min-[1000px]:gap-10">
        <div className="flex flex-col items-start">
          <Link href="/" aria-label={`${site.name} home`} className="group flex items-center gap-3">
            <BrandMark className="h-10 w-10 transition-transform duration-700 group-hover:rotate-[-8deg] group-hover:scale-110" />
            <span>
              <span className="block font-display text-lg font-semibold tracking-tight text-bone">{site.name}</span>
              <span className="block text-xs text-muted">by {site.company}</span>
            </span>
          </Link>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
            A fitting room for Shopify and WooCommerce fashion stores.
          </p>
          <a
            href={appPath("/sign-up")}
            className="auth-out group mt-8 inline-flex items-center gap-3 rounded-full bg-[image:var(--grad-brand)] px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {closing.cta}
            <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
          </a>
          <a
            href={appPath("/dashboard")}
            className="auth-in group mt-8 inline-flex items-center gap-3 rounded-full bg-bone px-6 py-3.5 text-sm font-semibold text-[var(--bg)] transition hover:bg-brand hover:text-white"
          >
            Open your dashboard
            <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
          </a>
        </div>

        <nav aria-label="Footer">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">Pages</p>
          <ul className="mt-5 border-t border-hairline">
            {pages.map((page, index) => (
              <li key={page.href} className="border-b border-hairline">
                <Link href={page.href} className="group relative flex items-center gap-5 overflow-hidden py-5">
                  <span aria-hidden className="absolute inset-0 origin-left scale-x-0 bg-[linear-gradient(90deg,rgba(247,109,1,0.1),transparent)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100" />
                  <span className="relative font-mono text-[11px] text-faint transition-colors group-hover:text-brand">
                    0{index + 1}
                  </span>
                  <span className="relative font-display text-[clamp(1.6rem,2.6vw,2.4rem)] font-semibold leading-none tracking-[-0.04em] text-bone transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-2">
                    {page.label}
                  </span>
                  <span className="relative ml-auto hidden text-right text-xs text-faint transition-colors group-hover:text-muted min-[600px]:block">
                    {page.note}
                  </span>
                  <span className="relative grid h-9 w-9 shrink-0 max-[599px]:ml-auto place-items-center rounded-full border border-hairline text-bone transition duration-500 group-hover:rotate-[-45deg] group-hover:border-brand group-hover:bg-brand group-hover:text-white">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">Get started</p>
          <ul className="mt-5 space-y-4">
            {account.map((item) => (
              <li key={item.label} className={item.className}>
                <a href={item.href} className="group inline-flex items-center text-sm text-muted transition-colors hover:text-bone">
                  <span className="h-px w-0 bg-brand transition-all duration-500 group-hover:mr-2 group-hover:w-4" />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-[1400px] flex-col gap-4 border-t border-hairline px-[var(--gutter)] py-6 text-xs text-faint min-[700px]:flex-row min-[700px]:items-center min-[700px]:justify-between">
        <p>
          © {new Date().getFullYear()} {site.company}. {site.tagline}.
        </p>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <a href="#top" className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:text-bone">
            Back to top
            <span className="grid h-7 w-7 place-items-center rounded-full border border-hairline transition group-hover:-translate-y-0.5 group-hover:border-bone/40">
              ↑
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
