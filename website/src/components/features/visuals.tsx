/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { stylist } from "@/lib/content";

const picks = stylist.catalog.filter((item) => item.match);
const others = stylist.catalog.filter((item) => !item.match);
const total = picks.reduce((sum, item) => sum + item.price, 0);
const violet = "bg-[linear-gradient(135deg,#6b358d,#400095)]";

type Item = (typeof stylist.catalog)[number];

const crop = (item: Item): CSSProperties => ({
  backgroundImage: `url(${item.image})`,
  backgroundPosition: item.crop,
  backgroundSize: item.zoom,
  backgroundRepeat: "no-repeat",
});

/** Pin positions for the suit look, as percentages of a 9:16 photo framed from the top. */
const hotspots = [
  { top: "38%", left: "64%" },
  { top: "25%", left: "50%" },
  { top: "90%", left: "61%" },
];

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
    </svg>
  );
}

function Orb({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-white", violet, className)}>
      <Sparkle className="h-[55%] w-[55%]" />
    </span>
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

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The merchant's product page the widget sits on. */
function Storefront({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="@container relative w-full overflow-hidden rounded-[32px] border border-hairline bg-surface p-3 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.5)] light:shadow-[0_25px_70px_-30px_rgba(14,12,19,0.08)] @lg:p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(70% 45% at 50% 0%, rgba(247,109,1,0.08), transparent 70%)" }}
      />
      <div className="relative mb-3 flex items-center justify-between gap-3 px-1.5 text-[10px] text-faint @lg:mb-4">
        <span className="font-display text-[11px] font-semibold tracking-[0.3em] text-muted">ATELIER NORTH</span>
        <span className="hidden gap-4 @lg:flex">
          <span>New in</span>
          <span className="text-muted">Men</span>
          <span>Women</span>
          <span>Sale</span>
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em]">
          <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
          {label}
        </span>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** The Persona widget panel as shoppers see it. */
function Widget({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="pw relative overflow-hidden rounded-[20px] border border-[var(--pw-border)] bg-[var(--pw-base)] text-[var(--pw-text)] shadow-[0_40px_90px_-40px_rgba(0,0,0,0.85)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--pw-border)] px-3.5 py-2.5">
        <Orb className="h-7 w-7" />
        <div className="min-w-0">
          <p className="bg-[image:var(--grad-brand)] bg-clip-text text-[12px] font-bold leading-none text-transparent">Style Assistant</p>
          <p className="mt-1 flex items-center gap-1 truncate text-[9px] text-[var(--pw-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            Atelier North · your catalog only
          </p>
        </div>
        <span className="ml-auto flex items-center gap-3.5">
          <img src="/media/face.webp" alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-[#6b358d]" />
          <span className="relative flex items-center">
            <Bag className="h-4 w-4" />
            <span
              data-cart
              className="absolute -right-2 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-brand px-1 text-[8px] font-semibold leading-none text-white"
            >
              0
            </span>
          </span>
        </span>
      </div>
      <div className={cn("relative", className)}>{children}</div>
    </div>
  );
}

function Stage({ base = "/media/look-1.webp", next, children, className }: { base?: string; next?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[14px] bg-[var(--pw-stage)]", className)}>
      <img src={base} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_18%]" />
      {next ? (
        <img
          data-next
          src={next}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[50%_18%]"
          style={{ clipPath: "inset(0% 0% 100% 0%)" }}
        />
      ) : null}
      {children}
    </div>
  );
}

function Pins() {
  return (
    <>
      {hotspots.map((spot, index) => (
        <span key={index} data-hot className="absolute z-10 -ml-2 -mt-2 h-4 w-4" style={spot}>
          <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
          <span className="absolute inset-0 rounded-full border-2 border-white bg-brand shadow-[0_0_0_3px_rgba(0,0,0,0.25)]" />
        </span>
      ))}
    </>
  );
}

function Beam({ name = "beam" }: { name?: string }) {
  return (
    <div {...{ [`data-${name}`]: true }} className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 opacity-0">
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-brand/35 to-transparent" />
      <div className="absolute inset-x-0 -top-px h-[2px] bg-brand shadow-[0_0_16px_3px_rgba(247,109,1,0.75)]" />
    </div>
  );
}

/** A floating annotation explaining a part of the widget. */
function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      data-note
      className={cn(
        "absolute z-20 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[9.5px] font-medium text-white opacity-0 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
      {children}
    </span>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-medium text-white backdrop-blur", className)}>
      {children}
    </span>
  );
}

const card = "rounded-[12px] border border-[var(--pw-border)] bg-[var(--pw-card)]";
const label = "font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--pw-muted)]";

const fields = [
  ["Height", "178 cm"],
  ["Weight", "74 kg"],
  ["Chest", "98 cm"],
  ["Waist", "82 cm"],
  ["Shoe", "EU 43"],
  ["Fit", "Regular"],
] as const;

export function AvatarVisual() {
  return (
    <Storefront label="Persona · Onboarding">
      <Widget>
        <div className="grid gap-3 p-3 @lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-1.5">
              {["Measurements", "Photo", "Avatar"].map((step, index) => (
                <div key={step}>
                  <p className="text-[9px] font-medium text-[var(--pw-muted)]">
                    {index + 1}. {step}
                  </p>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--pw-border)]">
                    <span data-ostep className={cn("block h-full origin-left scale-x-0", violet)} />
                  </span>
                </div>
              ))}
            </div>

            <div className={cn(card, "p-3")}>
              <p className="text-[12px] font-bold">Your measurements</p>
              <p className="mt-0.5 text-[9px] text-[var(--pw-muted)]">For a body-accurate avatar and size advice.</p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {fields.map(([name, value]) => (
                  <div key={name}>
                    <p className="text-[8.5px] font-medium text-[var(--pw-muted)]">{name}</p>
                    <p data-field className="mt-0.5 h-7 rounded-[8px] border border-[var(--pw-border)] bg-[var(--pw-base)] px-2 text-[10.5px] font-medium leading-[26px]">
                      <span data-val>{value}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className={cn(card, "flex items-center gap-3 p-3")}>
              <img data-selfie src="/media/face.webp" alt="" className="h-12 w-12 shrink-0 rounded-full border-2 border-[#6b358d] object-cover" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold">
                  Face photo
                  <span data-photo-ok className="flex items-center gap-1 text-[9px] font-medium text-[#10b981]">
                    <Check className="h-2.5 w-2.5" /> ready
                  </span>
                </p>
                <p className="mt-0.5 text-[9px] leading-snug text-[var(--pw-muted)]">Used once to build the avatar, then discarded. Never stored.</p>
              </div>
            </div>

            <span data-create className={cn("relative mt-auto flex h-9 items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold text-white", violet)}>
              Create my avatar <span aria-hidden>→</span>
            </span>
          </div>

          <Stage base="/media/look-1.webp" className="h-[320px] @lg:h-auto @lg:min-h-[380px]">
            <div data-reveal className="absolute inset-0 bg-[var(--pw-stage)]" />
            <Beam name="scan" />
            <div data-gen className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center opacity-0">
              <span className={cn("grid h-11 w-11 place-items-center rounded-[14px] text-white shadow-lg", violet)}>
                <Sparkle className="h-5 w-5 animate-pulse" />
              </span>
              <p className="text-[12px] font-bold text-white">Creating your avatar</p>
              <div className="w-full max-w-[180px]">
                <div className="flex justify-between text-[9px] text-white/70">
                  <span>Mapping face + body</span>
                  <span>
                    <span data-pct>0</span>%
                  </span>
                </div>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/15">
                  <span data-gen-bar className={cn("block h-full origin-left scale-x-0", violet)} />
                </span>
              </div>
            </div>
            <div data-done className="absolute inset-x-2.5 bottom-2.5 z-10 flex items-center justify-between opacity-0">
              <Pill>
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" /> Avatar ready
              </Pill>
              <Pill>
                Profile
                <span className="flex gap-1">
                  <span className="h-1 w-3.5 rounded-full bg-brand" />
                  <span className="h-1 w-3.5 rounded-full bg-white/30" />
                  <span className="h-1 w-3.5 rounded-full bg-white/30" />
                </span>
              </Pill>
            </div>
            <Note className="left-2.5 top-2.5">Same face in every outfit</Note>
          </Stage>
        </div>
      </Widget>
    </Storefront>
  );
}

export function TryOnVisual() {
  return (
    <Storefront label="Persona · Try-on">
      <Widget>
        <div className="grid gap-3 p-3 @lg:grid-cols-[0.95fr_1.05fr]">
          <Stage next="/media/look-2.webp" className="h-[340px] @lg:h-[410px]">
            <div data-scanov className="pointer-events-none absolute inset-0 z-10 opacity-0">
              <div className="absolute inset-0 bg-[rgba(6,4,10,0.35)]" />
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(247,109,1,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(247,109,1,0.5) 1px, transparent 1px)",
                  backgroundSize: "22px 22px",
                }}
              />
              {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "bottom-2 left-2 border-b-2 border-l-2", "bottom-2 right-2 border-b-2 border-r-2"].map((corner) => (
                <span key={corner} className={cn("absolute h-6 w-6 border-brand", corner)} />
              ))}
              <div className="absolute left-3 top-3 rounded-[10px] border border-white/10 bg-black/65 px-2.5 py-2 text-white backdrop-blur-md">
                <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-brand">Garment fit scan</p>
                <p className="mt-0.5 text-[10.5px] font-semibold">Fitting {picks.length} pieces onto you</p>
              </div>
            </div>
            <Beam />
            <Pins />
            <Note className="bottom-3 left-1/2 -translate-x-1/2">Full look, one render</Note>
          </Stage>

          <div className="flex flex-col">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-bold">Your look</p>
              <p className={label}>From Atelier North</p>
            </div>
            <ul className="mt-2.5 space-y-2">
              {picks.map((item) => (
                <li key={item.id} data-garment className={cn(card, "flex items-center gap-3 p-2")}>
                  <span className="h-12 w-10 shrink-0 rounded-[8px] bg-white" style={crop(item)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium">{item.name}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--pw-muted)]">
                      <span className="font-semibold text-brand">${item.price}</span> · Size M
                    </span>
                  </span>
                  <span data-check className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--pw-border)] text-transparent">
                    <Check className="h-3 w-3" />
                  </span>
                </li>
              ))}
            </ul>
            <div className={cn(card, "mt-2.5 p-2.5")}>
              <div className="flex items-baseline justify-between">
                <span className={label}>Garments in this render</span>
                <span className="text-[13px] font-bold">
                  <span data-gcount>0</span>
                  <span className="text-[10px] font-normal text-[var(--pw-muted)]"> / 11</span>
                </span>
              </div>
              <div className="mt-2 grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, index) => (
                  <span key={index} data-slot={index < picks.length ? "on" : "off"} className="h-1.5 rounded-full bg-[var(--pw-border)]" />
                ))}
              </div>
            </div>
            <span
              data-wear
              className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full bg-[image:var(--grad-brand)] text-[11px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(247,109,1,0.6)] @lg:mt-auto"
            >
              <Sparkle className="h-3 w-3" /> Wear this look
            </span>
          </div>
        </div>
      </Widget>
    </Storefront>
  );
}

const liveRack = [others.find((item) => item.id === "bomber")!, others.find((item) => item.id === "coat")!, picks[0], others.find((item) => item.id === "tee")!];

export function LiveVisual() {
  return (
    <Storefront label="Persona · Live mirror">
      <Widget>
        <div className="relative h-[380px] overflow-hidden bg-black @lg:h-[460px]">
          <img src="/media/look-4.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_16%]" />
          <img data-live-next src="/media/look-3.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_16%] opacity-0" />
          <img data-live-next2 src="/media/look-2.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_16%] opacity-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/45" />
          {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "left-3 bottom-3 border-b-2 border-l-2", "right-3 bottom-3 border-b-2 border-r-2"].map((corner) => (
            <span key={corner} className={cn("absolute h-6 w-6 rounded-[3px] border-white/80", corner)} />
          ))}

          <span data-track className="absolute left-[31%] top-[22%] h-[44%] w-[38%] rounded-xl border border-brand/80 opacity-0">
            <span className="absolute -top-5 left-0 font-mono text-[8.5px] uppercase tracking-[0.16em] text-brand">Body tracked</span>
          </span>

          <div data-live-ui className="absolute left-5 top-5 flex items-center gap-2 opacity-0">
            <Pill>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live · your camera
            </Pill>
          </div>
          <div data-live-ui className="absolute right-5 top-5 opacity-0">
            <Pill className="font-mono">
              <span data-timer>00:00</span>
              <span className="text-white/40">/ 01:30</span>
            </Pill>
          </div>

          <div data-cam-off className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0d0814] px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
            </span>
            <p className="text-[12px] text-white/70">Your picks are ready. See them on you, live.</p>
            <span data-cam-btn className="flex h-9 items-center gap-1.5 rounded-full bg-[image:var(--grad-brand)] px-5 text-[11px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(247,109,1,0.6)]">
              <Sparkle className="h-3 w-3" /> Start live try-on
            </span>
            <p className="text-[9.5px] text-white/40">Uses your own camera. Nothing is uploaded.</p>
          </div>

          <div data-live-ui className="absolute inset-x-4 bottom-4 opacity-0">
            <div className="flex items-end justify-between gap-3">
              <div className="flex gap-2">
                {liveRack.map((item, index) => (
                  <span key={item.id} className="relative h-14 w-11 overflow-hidden rounded-[10px] border border-white/20 bg-white @lg:h-16 @lg:w-12">
                    <span className="absolute inset-0" style={crop(item)} />
                    <span data-ring={index} className={cn("absolute inset-0 rounded-[10px] ring-2 ring-inset ring-brand", index !== 0 && "opacity-0")} />
                    <span data-tapfx={index} className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-brand/70 opacity-0" />
                  </span>
                ))}
              </div>
              <div className="relative h-8 min-w-0 flex-1 text-right text-[11px] font-medium text-white">
                {[0, 1, 2].map((i) => (
                  <span key={i} data-wearing={i} className={cn("absolute inset-x-0 bottom-0 truncate", i !== 0 && "opacity-0")}>
                    Wearing · {liveRack[i].name}
                  </span>
                ))}
              </div>
            </div>
            <span className="mt-3 block h-1 overflow-hidden rounded-full bg-white/20">
              <span data-session className="block h-full origin-left scale-x-0 bg-[image:var(--grad-brand)]" />
            </span>
          </div>
        </div>
      </Widget>
    </Storefront>
  );
}

export function StylistVisual() {
  return (
    <Storefront label="Persona · Stylist">
      <Widget>
        <div className="grid gap-3 p-3 @lg:grid-cols-[0.72fr_1.28fr]">
          <Stage next="/media/look-2.webp" className="hidden @lg:block @lg:h-[430px]">
            <Beam />
            <Pins />
          </Stage>

          <div className="flex flex-col @lg:h-[430px]">
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden text-[11px] leading-snug">
              <p data-msg className="max-w-[82%] self-end rounded-[14px] rounded-br-[4px] bg-brand/90 px-3 py-2 text-white">
                {stylist.ask}
              </p>
              <div data-msg className={cn(card, "px-3 py-2")}>
                <p className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-brand">
                    <Sparkle className="h-2.5 w-2.5" /> Searching your catalog
                  </span>
                  <span className="text-[9.5px] text-[var(--pw-muted)]">
                    <span data-found>0</span> in stock
                  </span>
                </p>
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {["Occasion · dinner", "Budget · ≤ $300", "Size · M"].map((tag) => (
                    <span key={tag} data-tag className="rounded-full border border-[var(--pw-border)] px-2 py-0.5 text-[9px] text-[var(--pw-muted)]">
                      {tag}
                    </span>
                  ))}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {picks.map((item) => (
                  <div key={item.id} data-result className="overflow-hidden rounded-[10px] border border-[var(--pw-border)] bg-[var(--pw-card)]">
                    <div className="aspect-[4/3] bg-white" style={crop(item)} />
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[9.5px] font-medium">{item.name}</p>
                      <p className="flex justify-between text-[9.5px]">
                        <span className="font-semibold text-brand">${item.price}</span>
                        <span className="text-[var(--pw-muted)]">M</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p data-msg className="max-w-[90%] rounded-[14px] rounded-bl-[4px] border border-[var(--pw-border)] bg-[var(--pw-bubble)] px-3 py-2">
                {stylist.answer}
              </p>
              <div data-msg className="flex items-center gap-2">
                <span className="flex-1">
                  <span className="flex justify-between font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--pw-muted)]">
                    <span>Budget</span>
                    <span>
                      ${total} / ${stylist.budget}
                    </span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--pw-border)]">
                    <span data-budget className="block h-full origin-left scale-x-0 bg-[image:var(--grad-brand)]" />
                  </span>
                </span>
                <span data-wear className="flex shrink-0 items-center gap-1.5 rounded-full bg-[image:var(--grad-brand)] px-3.5 py-2 text-[10.5px] font-semibold text-white">
                  <Sparkle className="h-3 w-3" /> Wear this look
                </span>
              </div>
            </div>
            <div className="mt-3 flex shrink-0 items-center gap-1.5">
              <span className="h-8 min-w-0 flex-1 truncate rounded-full border border-[var(--pw-border)] bg-[var(--pw-card)] px-3 text-[10px] leading-8 text-[var(--pw-muted)]">
                Ask about clothes, style, sizing…
              </span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[image:var(--grad-brand)] text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className="h-3.5 w-3.5">
                  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </Widget>
    </Storefront>
  );
}

const chart = [
  ["S", "88–94", "74–80"],
  ["M", "95–101", "81–87"],
  ["L", "102–108", "88–94"],
  ["XL", "109–115", "95–101"],
] as const;

const lines = [
  { top: "31%", text: "Chest 98 cm" },
  { top: "46%", text: "Waist 82 cm" },
];

export function SizingVisual() {
  return (
    <Storefront label="Persona · Size guide">
      <Widget>
        <div className="grid gap-3 p-3 @lg:grid-cols-[0.8fr_1.2fr]">
          <Stage base="/media/look-2.webp" className="h-[300px] @lg:h-auto @lg:min-h-[400px]">
            {lines.map((line) => (
              <div key={line.text} data-measure className="absolute inset-x-[22%] z-10" style={{ top: line.top }}>
                <span data-measure-line className="block h-px origin-left border-t border-dashed border-brand" />
                <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-brand" />
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-brand" />
                <Pill className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[8.5px]">{line.text}</Pill>
              </div>
            ))}
          </Stage>

          <div className={cn(card, "flex flex-col p-3")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={label}>Size guide · Tailoring</p>
                <p className="mt-1 truncate text-[12px] font-bold">{picks[0].name}</p>
              </div>
              <span className="shrink-0 rounded-full border border-[var(--pw-border)] px-2 py-0.5 text-[9px] text-[var(--pw-muted)]">Atelier North chart</span>
            </div>

            <div className="mt-3 overflow-hidden rounded-[10px] border border-[var(--pw-border)]">
              <div className="grid grid-cols-3 bg-[var(--pw-base)] px-3 py-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--pw-muted)]">
                <span>Size</span>
                <span>Chest cm</span>
                <span>Waist cm</span>
              </div>
              {chart.map(([size, chest, waist]) => (
                <div key={size} data-size className="relative grid grid-cols-3 border-t border-[var(--pw-border)] px-3 py-2 font-mono text-[11px] text-[var(--pw-muted)]">
                  {size === "M" ? <span data-hit className="absolute inset-0 border-l-2 border-brand bg-brand/10 opacity-0" /> : null}
                  <span className="relative font-semibold text-[var(--pw-text)]">{size}</span>
                  <span className="relative">{chest}</span>
                  <span className="relative">{waist}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-[10px] border border-[var(--pw-border)] bg-[var(--pw-base)] p-3">
              <span
                data-ring
                className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full"
                style={{ ["--p" as string]: 0, background: "conic-gradient(#f76d01 calc(var(--p) * 1%), var(--pw-border) 0)" }}
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--pw-base)] text-[11px] font-bold">
                  <span>
                    <span data-fit>0</span>%
                  </span>
                </span>
              </span>
              <div className="min-w-0">
                <p data-rec className="text-[13px] font-bold opacity-0">
                  Your size: <span className="text-brand">M</span> · Regular
                </p>
                <p className="mt-0.5 text-[9.5px] leading-snug text-[var(--pw-muted)]">Your measurements against this brand&apos;s own chart.</p>
              </div>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[9px] text-[var(--pw-muted)] @lg:mt-auto">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Global brand charts come from a shared registry, researched once.
            </p>
          </div>
        </div>
      </Widget>
    </Storefront>
  );
}

export function CartVisual() {
  return (
    <Storefront label="Your store's cart">
      <div className="grid gap-3 @lg:grid-cols-[0.95fr_1.05fr]">
        <Widget>
          <Stage base="/media/look-2.webp" className="m-3 h-[300px] @lg:h-[372px]">
            <Pins />
            <div className="absolute inset-x-3 bottom-3 z-20 rounded-[12px] border border-white/15 bg-black/70 p-2.5 text-white shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <span className="flex -space-x-2">
                  {picks.map((item) => (
                    <span key={item.id} className="h-8 w-8 rounded-full bg-white ring-2 ring-black/70" style={crop(item)} />
                  ))}
                </span>
                <span className="min-w-0 text-[10px] leading-tight">
                  <span className="block font-semibold">The dinner look</span>
                  <span className="text-white/70">
                    {picks.length} pieces · Size M · ${total}
                  </span>
                </span>
              </div>
              <span data-add className="relative mt-2.5 grid h-8 overflow-hidden rounded-full bg-[image:var(--grad-brand)] text-[10.5px] font-semibold">
                <span data-add-a className="col-start-1 row-start-1 grid place-items-center">
                  Add all to cart · ${total}
                </span>
                <span data-add-b className="col-start-1 row-start-1 grid place-items-center opacity-0">
                  ✓ Added to your cart
                </span>
              </span>
            </div>
          </Stage>
        </Widget>

        <div className="flex flex-col rounded-[20px] border border-hairline bg-[var(--surface-card)] p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-semibold text-bone">
              Cart <span data-cart-n className="text-brand">(0)</span>
            </p>
            <span className="flex rounded-full border border-hairline bg-surface p-0.5 text-[9.5px]">
              <span className="rounded-full bg-bone px-2.5 py-0.5 font-medium text-[var(--bg)]">Shopify</span>
              <span className="px-2.5 py-0.5 text-faint">WooCommerce</span>
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {picks.map((item) => (
              <li key={item.id} data-item className="flex items-center gap-3 rounded-[12px] border border-hairline bg-surface p-2">
                <span className="h-12 w-10 shrink-0 rounded-[8px] bg-white" style={crop(item)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-bone">{item.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                    Size M · Qty 1
                    <span className="rounded-full bg-brand/15 px-1.5 py-px normal-case tracking-normal text-brand">via Persona</span>
                  </span>
                </span>
                <span className="font-mono text-[11.5px] text-bone">${item.price}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-4">
            <div className="flex items-center justify-between border-t border-hairline pt-3">
              <span className="text-[12px] text-muted">Subtotal</span>
              <span className="font-display text-xl font-semibold text-bone">${total}</span>
            </div>
            <span className="mt-3 grid h-10 place-items-center rounded-full bg-bone text-[12px] font-semibold text-[var(--bg)]">Checkout</span>
            <p className="mt-2 text-center text-[9.5px] text-faint">Your checkout, your payments, your customer.</p>
          </div>
        </div>
      </div>
    </Storefront>
  );
}
