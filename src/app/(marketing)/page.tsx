import Link from "next/link";
import {
  Shirt,
  BotMessageSquare,
  Plug,
  ArrowRight,
  Check,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";

const FEATURES = [
  {
    icon: <Shirt className="h-5 w-5 text-white" />,
    gradient: "gradient-wearable",
    title: "Virtual Try-On",
    desc: "Shoppers upload a photo and see exactly how clothing, shoes and accessories look on them before buying — with AI size guidance.",
  },
  {
    icon: <BotMessageSquare className="h-5 w-5 text-white" />,
    gradient: "gradient-unwearable",
    title: "Shopping Assistant",
    desc: "An AI chat that understands your catalog and guides customers to the perfect product in seconds, then adds it to cart.",
  },
  {
    icon: <Plug className="h-5 w-5 text-white" />,
    gradient: "gradient-accent",
    title: "Store Integration",
    desc: "Connects to Shopify, WooCommerce, and custom stores. Your products and categories, automatically synced.",
  },
];

const STATS = [
  { value: "+38%", label: "Average conversion lift" },
  { value: "2.4x", label: "More add-to-carts" },
  { value: "5 min", label: "To go live" },
  { value: "24/7", label: "AI assistance" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-mesh">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-card)]/70 backdrop-blur-md sticky top-0 z-40">
        <Logo variant="tool" size={30} />
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden sm:inline-flex text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors px-3 py-2"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 gradient-brand text-white text-sm font-semibold px-5 py-2.5 rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5 transition-all"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Glow orbs */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-[46rem] rounded-full bg-[var(--color-brand-orange)] opacity-20 blur-[120px]" />
        <div className="pointer-events-none absolute top-32 right-10 h-72 w-72 rounded-full bg-[var(--color-brand-purple)] opacity-15 blur-[100px]" />

        <div className="relative flex flex-col items-center text-center gap-6 px-6 pt-24 pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)]/80 backdrop-blur px-4 py-1.5 text-sm text-[var(--color-text-secondary)] shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-brand)]" />
            E-commerce with AI Excellence
          </div>

          <h1 className="text-4xl sm:text-6xl font-display font-extrabold text-[var(--color-text-primary)] max-w-3xl leading-[1.05] tracking-tight">
            Turn{" "}
            <span className="gradient-text-brand">browsers</span> into{" "}
            <span className="gradient-text-accent">buyers</span>
          </h1>

          <p className="text-lg text-[var(--color-text-secondary)] max-w-xl leading-relaxed">
            Persona AI gives your store an AI shopping assistant and virtual
            try-on that help customers find — and buy — the perfect product.
          </p>

          <div className="flex gap-3 flex-wrap justify-center pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 gradient-brand text-white font-semibold px-7 py-3.5 rounded-[var(--radius-xl)] shadow-[var(--shadow-glow)] hover:-translate-y-0.5 transition-transform"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-[var(--color-surface-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-semibold px-7 py-3.5 rounded-[var(--radius-xl)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              View Demo
            </Link>
          </div>

          {/* Trust row */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 text-sm text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[var(--color-success)]" /> No code required</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-[var(--color-brand)]" /> Setup in 5 minutes</span>
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-[var(--color-accent)]" /> Works with any store</span>
          </div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 -mt-6 mb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="card-base p-5 text-center">
              <div className="text-2xl sm:text-3xl font-display font-extrabold gradient-text-brand">{s.value}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-display font-extrabold text-[var(--color-text-primary)]">
            Two AI agents. One powerful platform.
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-2">
            Purpose-built for wearable and everyday products alike.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-interactive p-6 flex flex-col gap-4">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${f.gradient}`}>
                {f.icon}
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-[var(--color-text-primary)]">{f.title}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="relative overflow-hidden rounded-[var(--radius-2xl)] gradient-brand-warm p-10 sm:p-14 text-center">
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -top-16 -left-10 h-64 w-64 rounded-full bg-[var(--color-brand-purple)]/30 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-display font-extrabold text-white">
              Ready to boost your sales?
            </h2>
            <ul className="flex flex-col sm:flex-row gap-3 justify-center mt-5 text-sm text-white/90">
              {["No code required", "Setup in 5 minutes", "Works with any store"].map((item) => (
                <li key={item} className="flex items-center gap-2 justify-center">
                  <Check className="h-4 w-4" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white text-[var(--color-brand-strong)] font-bold px-8 py-3.5 rounded-[var(--radius-xl)] mt-7 hover:-translate-y-0.5 transition-transform shadow-lg"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-border)] mt-8">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo variant="full" size={26} />
          <p className="text-sm text-[var(--color-text-muted)]">
            © {new Date().getFullYear()} Autommerce. E-commerce with AI Excellence.
          </p>
        </div>
      </footer>
    </div>
  );
}
