import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

const crop = (src: string, pos: string, size: string): CSSProperties => ({
  backgroundImage: `url(${src})`,
  backgroundPosition: pos,
  backgroundSize: size,
  backgroundRepeat: "no-repeat",
});

export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[32px] border border-hairline bg-surface p-5 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.5)] light:shadow-[0_25px_70px_-30px_rgba(14,12,19,0.08)]",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(70% 45% at 50% 0%, rgba(247,109,1,0.08), transparent 70%)" }} />
      <div className="relative">{children}</div>
    </div>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface/80 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-bone backdrop-blur", className)}>
      {children}
    </span>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />;
}

const measurements = [
  ["Height", "178 cm", 0.78],
  ["Weight", "74 kg", 0.56],
  ["Chest", "98 cm", 0.64],
  ["Waist", "82 cm", 0.5],
  ["Shoe", "EU 43", 0.7],
] as const;

export function AvatarVisual() {
  return (
    <Frame>
      <div className="grid grid-cols-[0.9fr_1.1fr] gap-4">
        <div className="space-y-4">
          <div data-selfie className="relative aspect-square overflow-hidden rounded-2xl border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/media/face.webp" alt="" className="h-full w-full object-cover" />
            <span data-scan className="absolute inset-x-0 top-0 h-px bg-brand shadow-[0_0_18px_4px_rgba(247,109,1,0.6)]" />
            <span data-discard className="absolute inset-0 grid place-items-center bg-black/70 font-mono text-[10px] uppercase tracking-[0.16em] text-bone opacity-0 backdrop-blur-sm">
              Selfie discarded
            </span>
          </div>
          <div className="rounded-2xl border border-hairline bg-[var(--surface-well)] p-3.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Measurements</p>
            <ul className="mt-2.5 space-y-2">
              {measurements.map(([k, v, w]) => (
                <li key={k} data-row className="grid grid-cols-[4rem_1fr_3.6rem] items-center gap-2 text-[11px]">
                  <span className="text-muted">{k}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-hairline">
                    <span data-fill className="block h-full origin-left bg-[image:var(--grad-brand)]" style={{ width: `${w * 100}%` }} />
                  </span>
                  <span className="text-right font-mono text-bone">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-hairline bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-avatar src="/media/look-1.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%]" />
          <div className="absolute left-3 top-3">
            <Chip>
              <Dot /> Avatar ready
            </Chip>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-black/60 px-3 py-2 backdrop-blur">
            <span className="text-[11px] text-white">Profile</span>
            <span className="flex gap-1.5">
              <span className="h-1.5 w-5 rounded-full bg-brand" />
              <span className="h-1.5 w-5 rounded-full bg-white/30" />
              <span className="h-1.5 w-5 rounded-full bg-white/30" />
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

const garments = ["Navy jacket", "Navy trouser", "White poplin shirt", "Brown loafers"];

export function TryOnVisual() {
  return (
    <Frame>
      <div className="grid grid-cols-[1.25fr_1fr] gap-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/look-1.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-dressed src="/media/look-2.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%]" style={{ clipPath: "inset(0 0 100% 0)" }} />
          <span data-wipe className="absolute inset-x-0 top-0 h-px bg-brand shadow-[0_0_22px_5px_rgba(247,109,1,0.7)]" />
          <div className="absolute left-3 top-3">
            <Chip>One render</Chip>
          </div>
        </div>
        <div className="flex flex-col">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">From your catalog</p>
          <ul className="mt-3 space-y-2">
            {garments.map((name, index) => (
              <li key={name} data-garment className="flex items-center gap-3 rounded-xl border border-hairline bg-[var(--surface-well)] p-2">
                <span
                  className="h-11 w-9 shrink-0 rounded-lg"
                  style={crop("/media/look-2.webp", ["50% 30%", "50% 64%", "50% 24%", "50% 94%"][index], ["300%", "300%", "620%", "320%"][index])}
                />
                <span className="text-[12px] leading-tight text-bone">{name}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto rounded-xl border border-hairline bg-[var(--surface-well)] p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Garments</span>
              <span className="font-display text-2xl font-semibold text-bone">
                <span data-garment-count>0</span>
                <span className="text-sm text-faint"> / 11</span>
              </span>
            </div>
            <div className="mt-2 grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, index) => (
                <span key={index} data-slot={index < 4 ? "on" : "off"} className="h-1.5 rounded-full bg-hairline" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function LiveVisual() {
  return (
    <Frame>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-hairline bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/look-4.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_18%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
        {["left-4 top-4 border-l-2 border-t-2", "right-4 top-4 border-r-2 border-t-2", "left-4 bottom-4 border-b-2 border-l-2", "right-4 bottom-4 border-b-2 border-r-2"].map((pos) => (
          <span key={pos} className={cn("absolute h-7 w-7 rounded-[3px] border-white/80", pos)} />
        ))}
        <span data-track className="absolute left-[37%] top-[10%] h-[18%] w-[26%] rounded-lg border border-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0)]">
          <span className="absolute -top-5 left-0 font-mono text-[9px] uppercase tracking-[0.14em] text-brand">Tracking</span>
        </span>
        <div className="absolute left-6 top-6 flex items-center gap-2">
          <Chip className="bg-black/60 text-white border-white/15">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
          </Chip>
        </div>
        <div className="absolute right-6 top-6">
          <Chip className="bg-black/60 text-white border-white/15">
            <span data-timer>00:00</span>
            <span className="text-white/40">/ 01:30</span>
          </Chip>
        </div>
        <div className="absolute inset-x-6 bottom-6">
          <div className="h-1 overflow-hidden rounded-full bg-white/20">
            <span data-session className="block h-full origin-left scale-x-0 bg-[image:var(--grad-brand)]" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[12px] text-white font-medium">Bomber · cargo trouser</span>
            <span className="flex h-4 items-end gap-0.5">
              {[0.4, 0.8, 0.55, 1, 0.65, 0.9, 0.45].map((h, index) => (
                <span key={index} className="w-0.5 origin-bottom animate-[eq_0.9s_ease-in-out_infinite] rounded-full bg-brand" style={{ height: `${h * 100}%`, animationDelay: `${index * 0.1}s` }} />
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-hairline bg-[var(--surface-well)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className="text-muted">widget-live.js</span>
        <span data-loaded className="flex items-center gap-2 text-brand opacity-0">
          <Dot /> Loaded on first use
        </span>
      </div>
    </Frame>
  );
}

const results = [
  ["Navy two-piece suit", "$189", "50% 30%", "300%"],
  ["White poplin shirt", "$49", "50% 24%", "620%"],
  ["Brown leather loafers", "$55", "50% 92%", "300%"],
] as const;

export function StylistVisual() {
  return (
    <Frame>
      <div className="space-y-3">
        <div data-msg className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-bone px-4 py-2.5 text-[13px] text-[var(--bg)] font-medium shadow-sm">
          A sharp look for a dinner. Under $300.
        </div>
        <div data-msg className="rounded-2xl border border-hairline bg-[var(--surface-well)] p-3 font-mono text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-brand">search_catalog</span>
            <span data-found className="text-faint">
              <span data-found-n>0</span> in stock
            </span>
          </div>
          <p className="mt-1.5 text-muted">
            {"{ occasion: "}
            <span className="text-bone">&quot;dinner&quot;</span>
            {", max_price: "}
            <span className="text-bone">300</span>
            {" }"}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {results.map(([name, price, pos, size]) => (
            <div key={name} data-result className="overflow-hidden rounded-xl border border-hairline bg-[var(--surface-well)]">
              <div className="aspect-[4/3]" style={crop("/media/look-2.webp", pos, size)} />
              <div className="p-2">
                <p className="line-clamp-2 text-[11px] leading-tight text-bone">{name}</p>
                <p className="font-mono text-[10px] text-brand">{price}</p>
              </div>
            </div>
          ))}
        </div>
        <div data-msg className="w-fit max-w-[85%] rounded-2xl rounded-bl-md border border-hairline bg-[var(--surface-card)] px-4 py-2.5 text-[13px] leading-snug text-bone">
          Navy suit, white shirt, brown loafers. All in stock, all in your size. <span className="text-brand">$293</span>.
        </div>
        <div data-msg className="flex items-center gap-2">
          <Chip className="border-brand/30 text-brand">
            <Dot /> Grounded in 3 catalog results
          </Chip>
          <Chip className="text-muted">No invented prices</Chip>
        </div>
      </div>
    </Frame>
  );
}

const sizes = [
  ["S", "88–94", "74–80"],
  ["M", "95–101", "81–87"],
  ["L", "102–108", "88–94"],
  ["XL", "109–115", "95–101"],
] as const;

export function SizingVisual() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Size chart · Tailoring</p>
          <p className="mt-1 text-sm font-medium text-bone">Navy two-piece suit</p>
        </div>
        <Chip className="text-muted">Shared brand registry</Chip>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-hairline">
        <div className="grid grid-cols-3 bg-[var(--surface-well)] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
          <span>Size</span>
          <span>Chest cm</span>
          <span>Waist cm</span>
        </div>
        {sizes.map(([size, chest, waist]) => (
          <div key={size} data-size={size} className="relative grid grid-cols-3 border-t border-hairline px-4 py-3 font-mono text-[12px] text-muted">
            {size === "M" ? <span data-hit className="absolute inset-0 border-l-2 border-brand bg-brand/10 opacity-0" /> : null}
            <span className="relative text-bone font-medium">{size}</span>
            <span className="relative">{chest}</span>
            <span className="relative">{waist}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-5 rounded-2xl border border-hairline bg-[var(--surface-well)] p-4">
        <div className="text-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Recommended</p>
          <p data-rec className="font-display text-5xl font-semibold leading-none text-brand opacity-0">M</p>
        </div>
        <ul className="space-y-2.5">
          {[
            ["Chest", "98 cm", 0.5],
            ["Waist", "82 cm", 0.18],
            ["Length", "Regular", 0.5],
          ].map(([k, v, x]) => (
            <li key={k as string} className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-3 text-[11px]">
              <span className="text-muted">{k}</span>
              <span className="relative h-1 rounded-full bg-hairline">
                <span data-marker className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand shadow-sm" style={{ left: `${(x as number) * 100}%` }} />
              </span>
              <span className="text-right font-mono text-bone">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

export function CartVisual() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-bone">
          Your cart <span data-cart-n className="text-brand">(0)</span>
        </p>
        <div className="grid grid-cols-2 rounded-full border border-hairline bg-[var(--surface-well)] p-1 text-[11px]">
          <span className="rounded-full bg-surface px-3 py-1 font-medium text-bone shadow-sm">Shopify</span>
          <span className="px-3 py-1 text-faint">WooCommerce</span>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {results.map(([name, price, pos, size]) => (
          <li key={name} data-item className="flex items-center gap-3 rounded-2xl border border-hairline bg-[var(--surface-well)] p-2.5">
            <span className="h-14 w-12 shrink-0 rounded-lg" style={crop("/media/look-2.webp", pos, size)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-bone">{name}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Size M · Qty 1</p>
            </div>
            <span className="font-mono text-[12px] font-medium text-bone">{price}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
        <span className="text-sm text-muted">Subtotal</span>
        <span className="font-display text-2xl font-semibold text-bone">$293</span>
      </div>
      <div className="relative mt-4 h-12 overflow-hidden rounded-xl bg-bone text-[var(--bg)] shadow-sm">
        <span className="absolute inset-0 grid place-items-center text-sm font-semibold">Checkout on your store</span>
      </div>
      <div data-toast className="absolute right-5 top-16 opacity-0">
        <Chip className="border-brand/40 text-brand">
          <Dot /> Added by Persona
        </Chip>
      </div>
    </Frame>
  );
}
