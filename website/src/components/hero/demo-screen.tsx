/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { heroDemo, stylist } from "@/lib/content";
import { cn } from "@/lib/cn";

type Variant = "desktop" | "mobile";

const picks = stylist.catalog.filter((item) => item.match);

const hotspots = [
  { top: "37%", left: "64%" },
  { top: "25%", left: "50%" },
  { top: "92%", left: "61%" },
];

function crop(src: string, position: string, size: string): CSSProperties {
  return { backgroundImage: `url(${src})`, backgroundPosition: position, backgroundSize: size };
}

function Orb({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6b358d,#400095)] text-white",
        className,
      )}
    >
      <Sparkle className="h-[55%] w-[55%]" />
    </span>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
    </svg>
  );
}

function Bag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className={className}>
      <path d="M5 8h14l-1.2 12H6.2L5 8z" strokeLinejoin="round" />
      <path d="M9 8V6.5a3 3 0 016 0V8" />
    </svg>
  );
}

function CartBadge() {
  return (
    <span className="relative flex items-center">
      <Bag className="h-4 w-4" />
      <span
        data-d="cart"
        data-on="false"
        className="absolute -right-2 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-hairline px-1 text-[8px] font-semibold leading-none text-bone transition-colors data-[on=true]:bg-brand data-[on=true]:text-white"
      >
        0
      </span>
    </span>
  );
}

function LaunchButton({ className }: { className?: string }) {
  return (
    <span
      data-d="launch"
      className={cn(
        "flex items-center justify-center gap-2 rounded-full border border-brand/60 bg-brand/[0.08] font-semibold text-bone",
        className,
      )}
    >
      <Orb className="h-4 w-4" />
      {heroDemo.launch}
    </span>
  );
}

function StoreDesktop() {
  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-hairline px-5 text-[11px] text-muted">
        <span className="font-display text-[13px] font-semibold tracking-[0.32em] text-bone">{heroDemo.store}</span>
        <span className="flex gap-5">
          <span>New in</span>
          <span className="text-bone">Men</span>
          <span>Women</span>
          <span>Sale</span>
        </span>
        <CartBadge />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.05fr_1fr] gap-7 p-6">
        <div className="overflow-hidden rounded-xl bg-surface-raised">
          <img src="/media/look-2.webp" alt="" className="h-full w-full object-cover object-[50%_20%]" />
        </div>
        <div className="flex flex-col justify-center">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">Men / Tailoring</p>
          <p className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-bone">{heroDemo.product}</p>
          <p className="mt-1 text-[14px] text-muted">{heroDemo.price}</p>
          <div className="mt-4 flex gap-1.5">
            {heroDemo.sizes.map((size) => (
              <span
                key={size}
                className={cn(
                  "grid h-7 w-9 place-items-center rounded-md border text-[10px]",
                  size === "M" ? "border-bone text-bone" : "border-hairline text-muted",
                )}
              >
                {size}
              </span>
            ))}
          </div>
          <span className="mt-4 rounded-full bg-bone py-2.5 text-center text-[11px] font-semibold text-[var(--bg)]">Add to cart</span>
          <LaunchButton className="mt-2 py-2.5 text-[11px]" />
          <p className="mt-3 text-[9px] text-faint">Free returns · Ships in 2 days</p>
        </div>
      </div>
    </div>
  );
}

function StoreMobile() {
  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="flex h-[26px] shrink-0 items-end justify-between px-6 text-[9px] font-semibold text-bone">
        <span>9:41</span>
        <span className="tracking-[0.2em]">●●●</span>
      </div>
      <div className="flex h-[32px] shrink-0 items-center justify-between border-b border-hairline px-4 text-bone">
        <span className="flex flex-col gap-[3px]">
          <span className="h-px w-3.5 bg-current" />
          <span className="h-px w-3.5 bg-current" />
        </span>
        <span className="font-display text-[11px] font-semibold tracking-[0.3em]">{heroDemo.store}</span>
        <CartBadge />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <img src="/media/look-2.webp" alt="" className="h-[58%] w-full object-cover object-[50%_18%]" />
        <div className="px-4 pt-3">
          <p className="font-display text-[15px] font-semibold tracking-[-0.02em] text-bone">{heroDemo.product}</p>
          <p className="text-[11px] text-muted">{heroDemo.price}</p>
          <span className="mt-3 block rounded-full bg-bone py-2 text-center text-[10px] font-semibold text-[var(--bg)]">Add to cart</span>
          <LaunchButton className="mt-2 py-2 text-[10px]" />
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ compact }: { compact: boolean }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col text-[var(--pw-text)]", !compact && "rounded-[12px] border border-[var(--pw-border)] bg-[var(--pw-card)]")}>
      <div className={cn("flex shrink-0 items-center gap-2 px-3", compact ? "py-2" : "border-b border-[var(--pw-border)] py-2.5")}>
        <Orb className="h-6 w-6" />
        <div className="min-w-0">
          <p className="bg-[image:var(--grad-brand)] bg-clip-text text-[11px] font-bold text-transparent">{heroDemo.agent}</p>
          {!compact ? (
            <p className="flex items-center gap-1 truncate text-[8.5px] text-[var(--pw-muted)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#10b981]" />
              {heroDemo.status}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden px-3 pb-2 text-[10px] leading-snug [mask-image:linear-gradient(to_bottom,transparent,black_28px)]">
        {!compact ? (
          <p data-d="welcome" className="max-w-[88%] rounded-[12px] rounded-bl-[4px] border border-[var(--pw-border)] bg-[var(--pw-bubble)] px-2.5 py-1.5">
            {heroDemo.welcome}
          </p>
        ) : null}
        <p data-d="user" className="max-w-[82%] self-end rounded-[12px] rounded-br-[4px] bg-brand/90 px-2.5 py-1.5 text-white">
          {heroDemo.ask}
        </p>
        <div className="relative">
          <span data-d="typing" className="absolute left-0 top-0 flex items-center gap-1.5 rounded-[12px] rounded-bl-[4px] border border-[var(--pw-border)] bg-[var(--pw-bubble)] px-2.5 py-1.5 text-[var(--pw-muted)]">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="h-1 w-1 animate-pulse rounded-full bg-current" style={{ animationDelay: `${dot * 0.2}s` }} />
              ))}
            </span>
            {heroDemo.searching}
          </span>
          <p data-d="answer" className="max-w-[90%] rounded-[12px] rounded-bl-[4px] border border-[var(--pw-border)] bg-[var(--pw-bubble)] px-2.5 py-1.5">
            {heroDemo.answer}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {picks.map((item) => (
            <div key={item.id} data-d="card" className="overflow-hidden rounded-[8px] border border-[var(--pw-border)] bg-[var(--pw-base)]">
              <div className="aspect-[4/3] bg-white" style={crop(item.image, item.crop, item.zoom)} />
              <div className="px-1.5 py-1">
                <p className="truncate text-[8.5px] font-medium">{item.name}</p>
                <p className="flex items-center justify-between text-[8.5px]">
                  <span className="font-semibold text-brand">${item.price}</span>
                  <span className="text-[var(--pw-muted)]">M</span>
                </p>
              </div>
            </div>
          ))}
        </div>
        <div data-d="budget" className="rounded-[8px] border border-[var(--pw-border)] bg-[var(--pw-base)] px-2 py-1.5">
          <p className="flex justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--pw-muted)]">
            <span>Budget</span>
            <span>
              $<span data-d="amt">0</span> / $300
            </span>
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--pw-border)]">
            <div data-d="budget-fill" className="h-full origin-left bg-[image:var(--grad-brand)]" />
          </div>
        </div>
        <span data-d="wear" className="flex items-center justify-center gap-1.5 self-stretch rounded-full bg-[image:var(--grad-brand)] py-1.5 text-[10px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(247,109,1,0.6)]">
          <Sparkle className="h-3 w-3" />
          {heroDemo.wear}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-3">
        <div data-d="input" className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-full border border-[var(--pw-border)] bg-[var(--pw-base)] px-3 text-[9.5px] leading-7">
          <span data-d="ph" className="absolute inset-y-0 left-3 truncate text-[var(--pw-muted)]">
            Ask about clothes, style, sizing…
          </span>
          <span data-d="typed" className="absolute inset-y-0 left-3 whitespace-nowrap">
            {heroDemo.ask}
          </span>
        </div>
        <span data-d="send" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[image:var(--grad-brand)] text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className="h-3 w-3">
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function AvatarStage({ compact }: { compact: boolean }) {
  return (
    <div data-d="stage" className={cn("relative flex h-full overflow-hidden bg-[var(--pw-stage)]", compact ? "justify-center" : "rounded-[12px]")}>
      <div className="relative aspect-[9/16] h-full shrink-0">
        <img data-d="av-base" src="/media/look-1.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <img data-d="av-new" src="/media/look-2.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        {hotspots.map((spot, index) => (
          <span key={index} data-d="hot" className="absolute z-10 -ml-2 -mt-2 h-4 w-4" style={spot}>
            <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
            <span className="absolute inset-0 rounded-full border-2 border-white bg-brand shadow-[0_0_0_3px_rgba(0,0,0,0.25)]" />
          </span>
        ))}
      </div>
      {!compact ? (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 aspect-[9/16] h-full bg-[linear-gradient(to_right,transparent_70%,var(--pw-stage))]" />
      ) : null}

      {!compact ? (
        <div className="absolute right-2 top-2 flex w-[40%] max-w-[150px] flex-col gap-2 text-[var(--pw-text)]">
          <div data-d="stats" className="rounded-[10px] border border-[var(--pw-border)] bg-[var(--pw-card)] p-2">
            <p className="font-mono text-[7.5px] uppercase tracking-[0.16em] text-[var(--pw-muted)]">Model stats</p>
            {heroDemo.stats.map(([label, value]) => (
              <p key={label} className="mt-1 flex justify-between text-[9px]">
                <span className="text-[var(--pw-muted)]">{label}</span>
                <span className="font-medium">{value}</span>
              </p>
            ))}
          </div>
          <div data-d="fit" className="flex items-center gap-2 rounded-[10px] border border-[var(--pw-border)] bg-[var(--pw-card)] p-2">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[conic-gradient(#f76d01_0_94%,var(--pw-border)_94%_100%)]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--pw-card)] text-[8px] font-bold">94%</span>
            </span>
            <span className="text-[8.5px] leading-tight">
              <span className="block font-semibold">Size M</span>
              <span className="text-[var(--pw-muted)]">From your measurements</span>
            </span>
          </div>
        </div>
      ) : (
        <span data-d="fit" className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[9px] font-medium text-white backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
          94% fit · Size M
        </span>
      )}

      <div
        data-d="pop"
        className={cn(
          "absolute z-20 w-[150px] rounded-[12px] border border-white/15 bg-black/70 p-2 text-white shadow-2xl backdrop-blur-md",
          compact ? "right-3 top-[24%]" : "right-2 top-[54%]",
        )}
      >
        <div className="flex gap-2">
          <span className="h-10 w-10 shrink-0 rounded-[8px] bg-white" style={crop(picks[0].image, picks[0].crop, picks[0].zoom)} />
          <span className="min-w-0 text-[9px] leading-tight">
            <span className="block font-semibold">{picks[0].name}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              ${picks[0].price}
              <span className="rounded-full bg-white/15 px-1.5 text-[8px]">Size M</span>
            </span>
          </span>
        </div>
        <span data-d="add" className="mt-2 grid rounded-full bg-[image:var(--grad-brand)] py-1.5 text-center text-[9px] font-semibold">
          <span data-d="add-a" className="col-start-1 row-start-1">
            Add to cart
          </span>
          <span data-d="add-b" className="col-start-1 row-start-1">
            ✓ Added to cart
          </span>
        </span>
      </div>

      <div data-d="scan" className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute inset-0 bg-[rgba(6,4,10,0.38)]" />
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(247,109,1,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(247,109,1,0.5) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div data-d="beam" className="absolute inset-x-0 h-0">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-brand/30 to-transparent" />
          <div className="absolute inset-x-0 -top-px h-[2px] bg-brand shadow-[0_0_16px_3px_rgba(247,109,1,0.75)]" />
        </div>
        {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "bottom-2 left-2 border-b-2 border-l-2", "bottom-2 right-2 border-b-2 border-r-2"].map((corner) => (
          <span key={corner} className={cn("absolute h-6 w-6 border-brand", corner)} />
        ))}
        <div className="absolute left-3 top-3 w-[150px] rounded-[10px] border border-white/10 bg-black/65 p-2 text-white backdrop-blur-md">
          <p className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-brand">Garment fit scan</p>
          <p className="mt-0.5 text-[10px] font-semibold">Fitting onto avatar</p>
          <div className="relative mt-1 h-3 text-[8.5px] text-white/70">
            {heroDemo.scanStages.map((stage) => (
              <span key={stage} data-d="scan-line" className="absolute inset-0">
                {stage}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const violet = "bg-[linear-gradient(135deg,#6b358d,#400095)]";

function Onboarding({ variant }: { variant: Variant }) {
  const desktop = variant === "desktop";
  return (
    <div data-d="onboard" className={cn("absolute inset-0 z-50 bg-[var(--pw-base)] text-[var(--pw-text)]", desktop && "rounded-[16px]")}>
      <div
        data-d="form"
        className={cn(
          "absolute inset-0 flex flex-col",
          desktop ? "justify-center gap-5 px-8 py-5" : "gap-4 px-5 pb-5 pt-6",
        )}
      >
        <div className={cn("flex", desktop ? "items-stretch gap-6" : "flex-col gap-4")}>
          <div className="min-w-0 flex-1">
            <p className="text-center text-[13px] font-bold">Your measurements</p>
            <p className="mt-1 text-center text-[8.5px] text-[var(--pw-muted)]">Used to build a body-accurate avatar and size recommendations.</p>
            <div className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-2">
              {heroDemo.fields.map(([label, value, example]) => (
                <div key={label}>
                  <p className="text-[8px] font-medium text-[var(--pw-muted)]">{label}</p>
                  <div
                    data-d="field"
                    className="relative mt-0.5 h-6 rounded-[7px] border border-[var(--pw-border)] bg-[var(--pw-card)] px-2 text-[10px] leading-[22px]"
                  >
                    <span data-d="eg" className="absolute inset-y-0 left-2 text-[var(--pw-muted)] opacity-50">e.g. {example}</span>
                    <span data-d="val" className="absolute inset-y-0 left-2 font-medium">
                      {value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <span className={cn("shrink-0 bg-[var(--pw-border)]", desktop ? "w-px self-stretch" : "h-px")} />

          <div className="min-w-0 flex-1">
            <p className="text-center text-[13px] font-bold">Add your photo</p>
            <p className="mt-1 text-center text-[8.5px] text-[var(--pw-muted)]">A clear front-facing photo is all we need to build your avatar.</p>
            <div className={cn("relative mt-3 grid place-items-center rounded-[12px] border-2 border-dashed border-[var(--pw-border)]", desktop ? "h-[118px]" : "h-[96px]")}>
              <div data-d="drop-empty" className="flex flex-col items-center gap-1 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="h-4 w-4 text-[var(--pw-muted)]">
                  <path d="M12 16V4M7 9l5-5 5 5M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-[9px] font-medium">Upload your face photo</p>
                <p className="text-[7.5px] text-[var(--pw-muted)]">Clear front-facing photo · JPEG, PNG up to 10MB</p>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                <img
                  data-d="selfie"
                  src="/media/face.webp"
                  alt=""
                  className={cn("rounded-full border-2 border-[#6b358d] object-cover", desktop ? "h-[68px] w-[68px]" : "h-[54px] w-[54px]")}
                />
                <p data-d="photo-ok" className="flex items-center gap-1 text-[8.5px] font-medium text-[#10b981]">
                  <span className="grid h-2.5 w-2.5 place-items-center rounded-full bg-[#10b981] text-[6px] text-white">✓</span>
                  Face photo ready
                </p>
              </div>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-[7.5px] text-[var(--pw-muted)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" aria-hidden className="h-2.5 w-2.5 shrink-0">
                <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
              </svg>
              Used to build your avatar, then discarded — never stored.
            </p>
          </div>
        </div>

        <span
          data-d="create"
          className={cn(
            "relative mx-auto flex items-center justify-center gap-1.5 overflow-hidden rounded-full border border-[var(--pw-border)] text-[10.5px] font-semibold",
            desktop ? "h-8 w-[46%]" : "mt-auto h-9 w-full",
          )}
        >
          <span className="flex items-center gap-1.5 text-[var(--pw-muted)]">
            {heroDemo.create}
            <span aria-hidden>→</span>
          </span>
          <span data-d="create-on" className={cn("absolute inset-0 flex items-center justify-center gap-1.5 text-white", violet)}>
            {heroDemo.create}
            <span aria-hidden>→</span>
          </span>
        </span>
      </div>

      <div data-d="gen" className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="relative">
          <span className={cn("grid h-12 w-12 place-items-center rounded-[14px] text-white shadow-lg", violet)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="h-6 w-6">
              <circle cx="12" cy="8" r="4" />
              <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 animate-pulse place-items-center rounded-full bg-brand text-white">
            <Sparkle className="h-2.5 w-2.5" />
          </span>
        </div>
        <div>
          <p className="text-[13px] font-bold">Creating your avatar</p>
          <p className="mx-auto mt-1 max-w-[230px] text-[8.5px] leading-relaxed text-[var(--pw-muted)]">{heroDemo.creating}</p>
        </div>
        <div className="w-full max-w-[250px]">
          <div className="flex items-center justify-between text-[8.5px]">
            <span className="relative h-3 flex-1 text-left font-medium text-brand">
              {heroDemo.avatarStages.map(([label]) => (
                <span key={label} data-d="ostage" className="absolute inset-0 whitespace-nowrap">
                  {label}
                </span>
              ))}
            </span>
            <span className="tabular-nums text-[var(--pw-muted)]">
              <span data-d="pct">0</span>%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-[var(--pw-border)] bg-[var(--pw-card)]">
            <div data-d="progress" className={cn("h-full origin-left rounded-full", violet)} />
          </div>
          <div className="mt-1.5 flex gap-1">
            {heroDemo.avatarStages.map(([label]) => (
              <span key={label} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--pw-border)]">
                <span data-d="seg" className={cn("block h-full origin-left", violet)} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const themeLines: Array<[string, boolean?]> = [
  ["<!doctype html>"],
  ['<html lang="en">'],
  ["<head>"],
  ["  {{ content_for_header }}"],
  ["</head>"],
  ["<body>"],
  ["  {{ content_for_layout }}"],
  ["", true],
  ["</body>"],
  ["</html>"],
];

const files = ["layout", "  theme.liquid", "  password.liquid", "sections", "  header.liquid", "  product.liquid", "snippets", "templates"];

function Install({ variant }: { variant: Variant }) {
  const desktop = variant === "desktop";
  return (
    <div data-d="install" className={cn("absolute inset-0 z-30 flex flex-col bg-bg", !desktop && "pt-[26px]")}>
      <div className={cn("flex shrink-0 items-center justify-between border-b border-hairline", desktop ? "h-[46px] px-5" : "h-[40px] px-4")}>
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("font-display font-semibold tracking-[0.3em] text-bone", desktop ? "text-[13px]" : "text-[11px]")}>{heroDemo.store}</span>
          <span className="truncate font-mono text-[9px] text-faint">/ Edit code</span>
        </span>
        <span data-d="save" className={cn("relative grid overflow-hidden rounded-full font-semibold", desktop ? "text-[10px]" : "text-[9px]")}>
          <span className="col-start-1 row-start-1 bg-hairline" />
          <span data-d="save-on" className="col-start-1 row-start-1 bg-[image:var(--grad-brand)]" />
          <span className={cn("relative col-start-1 row-start-1 py-1.5 text-center text-bone", desktop ? "px-4" : "px-3.5")}>Save</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {desktop ? (
          <div className="w-[26%] shrink-0 border-r border-hairline py-3 font-mono text-[9.5px] leading-[1.9]">
            {files.map((file) => (
              <p
                key={file}
                className={cn(
                  "whitespace-pre px-4",
                  file.startsWith("  ") ? "text-faint" : "text-muted",
                  file.trim() === heroDemo.file && "border-l-2 border-brand bg-brand/10 text-bone",
                )}
              >
                {file}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 border-b border-hairline font-mono text-[9px]">
            <span className="border-b-2 border-brand px-4 py-2 text-bone">{heroDemo.file}</span>
          </div>
          <div className={cn("flex-1 py-3 font-mono", desktop ? "text-[11px] leading-[2]" : "text-[8.5px] leading-[2.1]")}>
            {themeLines.map(([line, insert], index) =>
              insert ? (
                <div key={index} className="relative flex pr-3">
                  <span data-d="ins-bg" className="absolute inset-0 border-l-2 border-brand bg-brand/10" />
                  <span className="relative w-8 shrink-0 pr-3 text-right text-brand">{index + 1}</span>
                  <span className="relative whitespace-pre text-bone">
                    {"  "}
                    <span data-d="ins" className="inline-block">
                      {heroDemo.script}
                    </span>
                  </span>
                </div>
              ) : (
                <div key={index} className="flex pr-3 text-faint">
                  <span className="w-8 shrink-0 pr-3 text-right opacity-50">{index + 1}</span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              ),
            )}
          </div>
          <div className="flex h-8 shrink-0 items-center justify-between border-t border-hairline px-4 font-mono text-[8.5px] uppercase tracking-[0.14em] text-faint">
            <span>Theme · Dawn</span>
            <span data-d="saved" className="flex items-center gap-1.5 text-[#10b981]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#10b981]" />
              {heroDemo.saved}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cursor({ variant }: { variant: Variant }) {
  return (
    <span data-d="cursor" className="pointer-events-none absolute left-0 top-0 z-50">
      <span data-d="ripple" className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2 border-brand" />
      {variant === "desktop" ? (
        <svg viewBox="0 0 24 24" aria-hidden className="relative -ml-[3px] -mt-[2px] h-5 w-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <path d="M4 2.5l15 9.2-6.6 1.4 3.6 7.1-2.7 1.3-3.6-7.1L4.8 19 4 2.5z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-2 border-white/90 bg-white/35 shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
      )}
    </span>
  );
}

function Toast({ variant }: { variant: Variant }) {
  return (
    <div
      data-d="toast"
      className={cn(
        "absolute z-40 flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-bone shadow-xl",
        variant === "desktop" ? "right-4 top-[54px] text-[10px]" : "left-1/2 top-[64px] w-max -translate-x-1/2 text-[9px]",
      )}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full bg-[#10b981] text-[9px] text-white">✓</span>
      {heroDemo.added}
    </div>
  );
}

export function DemoScreen({ variant }: { variant: Variant }) {
  if (variant === "desktop") {
    return (
      <div className="pw rounded-[20px] border border-hairline bg-surface p-1.5 shadow-[0_50px_140px_-40px_rgba(0,0,0,0.7)] light:shadow-[0_30px_90px_-30px_rgba(14,12,19,0.25)]">
        <div className="flex items-center gap-3 px-3 pb-2 pt-1">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="h-2.5 w-2.5 rounded-full bg-hairline" />
            ))}
          </span>
          <span className="mx-auto flex w-[56%] items-center justify-center gap-1.5 rounded-full bg-surface-raised py-1 font-mono text-[10px] text-faint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-2.5 w-2.5">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            <span className="grid">
              <span data-d="url-admin" className="col-start-1 row-start-1">
                {heroDemo.adminUrl}
              </span>
              <span data-d="url-store" className="col-start-1 row-start-1">
                {heroDemo.url}
              </span>
            </span>
          </span>
          <span className="w-[42px]" />
        </div>
        <div data-d="screen" aria-hidden className="relative aspect-[16/10.4] overflow-hidden rounded-[14px]">
          <StoreDesktop />
          <div data-d="dim" className="absolute inset-x-0 bottom-0 top-[46px] bg-black/45 backdrop-blur-[2px]" />
          <div
            data-d="widget"
            className="absolute inset-x-[2.5%] bottom-[3%] top-[54px] grid grid-cols-[0.95fr_1.05fr] gap-2 rounded-[16px] border border-[var(--pw-border)] bg-[var(--pw-base)] p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
          >
            <ChatPanel compact={false} />
            <AvatarStage compact={false} />
            <Onboarding variant="desktop" />
          </div>
          <Install variant="desktop" />
          <Toast variant="desktop" />
          <Cursor variant="desktop" />
        </div>
      </div>
    );
  }

  return (
    <div className="pw rounded-[46px] border border-hairline bg-surface p-2 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] light:shadow-[0_30px_80px_-24px_rgba(14,12,19,0.25)]">
      <div data-d="screen" aria-hidden className="relative aspect-[9/19] overflow-hidden rounded-[38px]">
        <span className="absolute left-1/2 top-2 z-50 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
        <StoreMobile />
        <div data-d="dim" className="absolute inset-x-0 bottom-0 top-[58px] bg-black/45" />
        <div data-d="widget" className="absolute inset-x-0 bottom-0 top-[58px] overflow-hidden bg-[var(--pw-base)]">
          <AvatarStage compact />
          <div data-d="sheet" className="absolute inset-x-0 bottom-0 z-40 h-[60%] rounded-t-[22px] border-t border-[var(--pw-border)] bg-[var(--pw-card)] shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.5)]">
            <span className="mx-auto mt-1.5 block h-1 w-9 rounded-full bg-[var(--pw-border)]" />
            <div className="h-[calc(100%-10px)]">
              <ChatPanel compact />
            </div>
          </div>
          <Onboarding variant="mobile" />
        </div>
        <Install variant="mobile" />
        <Toast variant="mobile" />
        <Cursor variant="mobile" />
      </div>
    </div>
  );
}

export function DemoSteps() {
  return (
    <ol className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4" aria-label="How Persona works">
      {heroDemo.steps.map((step, index) => (
        <li key={step} data-d="step">
          <div className="h-[2px] overflow-hidden rounded-full bg-hairline">
            <div data-d="step-bar" className="h-full origin-left bg-[image:var(--grad-brand)]" />
          </div>
          <p className="mt-2 font-mono text-[9.5px] uppercase leading-snug tracking-[0.16em] text-muted min-[1000px]:text-[10px]">
            <span className="text-brand">0{index + 1}</span> {step}
          </p>
        </li>
      ))}
    </ol>
  );
}
