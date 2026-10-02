import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { stylist } from "@/lib/content";

/** Coordinates are percentages of the 9:16 look photos, which fill the mirror edge to edge. */

const ease = "ease-[var(--ease-expo)]";

function reveal(on: boolean, delay: number, from = "translateY(6px)"): CSSProperties {
  return {
    opacity: on ? 1 : 0,
    transform: on ? "none" : from,
    transitionDelay: on ? `${delay}ms` : "0ms",
  };
}

function Layer({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-500"
      style={{ opacity: on ? 1 : 0, transitionDelay: on ? "350ms" : "0ms" }}
    >
      {children}
    </div>
  );
}

const tag = "rounded-md border border-white/15 bg-black/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white backdrop-blur-md";

function FaceScan({ on }: { on: boolean }) {
  const corners = ["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"];
  const points = [
    [38, 40],
    [62, 40],
    [50, 58],
    [40, 76],
    [60, 76],
    [50, 92],
  ];
  return (
    <Layer on={on}>
      <div className={cn("absolute left-[38%] top-[6.5%] h-[15%] w-[24%] transition-[opacity,transform] duration-700", ease)} style={reveal(on, 400, "scale(1.25)")}>
        {corners.map((corner) => (
          <span key={corner} className={cn("absolute h-3.5 w-3.5 border-brand", corner)} />
        ))}
        {points.map(([x, y], index) => (
          <span
            key={index}
            className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_6px_var(--brand)] transition-opacity duration-300"
            style={{ left: `${x}%`, top: `${y}%`, opacity: on ? 1 : 0, transitionDelay: on ? `${700 + index * 70}ms` : "0ms" }}
          />
        ))}
        <span className="absolute inset-x-0 top-0 h-px animate-[scanY_2.4s_ease-in-out_infinite] bg-brand shadow-[0_0_10px_2px_rgba(247,109,1,0.6)]" />
      </div>
      <span className={cn("absolute left-[64%] top-[9%] whitespace-nowrap transition-[opacity,transform] duration-500", tag, ease)} style={reveal(on, 1100, "translateX(-6px)")}>
        <span className="text-brand">●</span> Face mapped
      </span>
    </Layer>
  );
}

const options = ["/media/look-1.webp", "/media/look-2.webp", "/media/look-3.webp", "/media/look-4.webp"];
const TICK = 350;
const LOOP = 26;
const hoverAt: Record<number, number> = { 10: 3, 11: 1, 12: 0, 13: 0 };

/** Loops: upload the selfie, four avatars are generated from it, the shopper picks one, the avatar is ready. */
function AvatarFlow({ on }: { on: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % LOOP), TICK);
    return () => {
      window.clearInterval(id);
      setTick(0);
    };
  }, [on]);

  const phase = tick < 4 ? "upload" : tick < 10 ? "generate" : tick < 14 ? "pick" : "done";
  const panel = on && phase !== "done";
  const hover = hoverAt[tick] ?? -1;
  const pressed = tick === 13;

  return (
    <>
      <FaceScan on={on && phase === "done"} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/75 px-[8%] backdrop-blur-md transition-opacity duration-500"
        style={{ opacity: panel ? 1 : 0 }}
      >
        <div className="w-full text-white">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em]">
            {["Selfie", "Generate", "Pick"].map((label, index) => {
              const reached = ["upload", "generate", "pick"].indexOf(phase) >= index;
              return (
                <span key={label} className={cn("flex items-center gap-1.5 transition-colors duration-300", reached ? "text-brand" : "text-white/35")}>
                  <span className={cn("grid h-4 w-4 place-items-center rounded-full border text-[8px]", reached ? "border-brand" : "border-white/25")}>{index + 1}</span>
                  {label}
                </span>
              );
            })}
          </div>

          <div className="relative mt-4 h-[17.5rem]">
            <div className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300" style={{ opacity: phase === "upload" ? 1 : 0 }}>
              <div className="relative grid h-28 w-28 place-items-center rounded-full border border-dashed border-white/30">
                <span
                  className={cn("h-24 w-24 rounded-full bg-cover ring-2 ring-brand transition-[opacity,transform] duration-500", ease)}
                  style={{ backgroundImage: "url(/media/face.webp)", backgroundPosition: "50% 22%", opacity: tick >= 1 ? 1 : 0, transform: tick >= 1 ? "none" : "translateY(18px) scale(0.8)" }}
                />
              </div>
              <p className="mt-4 text-[12px] font-semibold">{tick >= 3 ? "Selfie received" : "Uploading selfie…"}</p>
              <span className="mt-2 block h-1 w-40 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full origin-left bg-[image:var(--grad-brand)] transition-transform duration-300 ease-linear"
                  style={{ transform: `scaleX(${Math.min(1, tick / 3)})` }}
                />
              </span>
            </div>

            <div className="absolute inset-0 flex flex-col transition-opacity duration-300" style={{ opacity: phase === "generate" || phase === "pick" ? 1 : 0 }}>
              <p className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">{phase === "pick" ? "Pick your avatar" : "Generating 4 avatars…"}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">Same face</span>
              </p>
              <div className="mt-2.5 grid flex-1 grid-cols-2 gap-2">
                {options.map((src, index) => {
                  const ready = tick >= 5 + index;
                  const selected = hover === index;
                  return (
                    <span
                      key={src}
                      className={cn(
                        "relative overflow-hidden rounded-xl border bg-white/[0.06] transition-[border-color,transform,box-shadow] duration-200",
                        selected ? "border-brand shadow-[0_0_0_2px_var(--brand)]" : "border-white/15",
                      )}
                      style={{ transform: selected && pressed ? "scale(0.95)" : selected ? "scale(1.03)" : "none" }}
                    >
                      <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />
                      <span
                        className="absolute inset-0 bg-no-repeat transition-[opacity,filter] duration-500"
                        style={{
                          backgroundImage: `url(${src})`,
                          backgroundSize: "150% auto",
                          backgroundPosition: "50% 6%",
                          opacity: ready ? 1 : 0,
                          filter: ready ? "blur(0)" : "blur(8px)",
                        }}
                      />
                      <span
                        className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-brand text-[8px] font-bold transition-opacity duration-200"
                        style={{ opacity: selected ? 1 : 0 }}
                      >
                        ✓
                      </span>
                    </span>
                  );
                })}
              </div>
              <span
                className={cn(
                  "mt-2.5 flex h-8 items-center justify-center rounded-full text-[11px] font-semibold transition-[background,opacity,transform] duration-200",
                  hover >= 0 ? "bg-[image:var(--grad-brand)] opacity-100" : "bg-white/10 opacity-60",
                )}
                style={{ transform: pressed ? "scale(0.95)" : "none" }}
              >
                Use this avatar
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const products = stylist.catalog;
const picked = products.filter((item) => item.match);
const pickedTotal = picked.reduce((sum, item) => sum + item.price, 0);
const CATALOG_LOOP = 28;

/** Loops: browse the store's catalog, pick the pieces, render them on the avatar in one pass, tag every piece. */
function CatalogFlow({ on }: { on: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % CATALOG_LOOP), TICK);
    return () => {
      window.clearInterval(id);
      setTick(0);
    };
  }, [on]);

  const phase = tick < 2 ? "browse" : tick < 7 ? "pick" : tick < 11 ? "render" : "done";
  const panel = on && (phase === "browse" || phase === "pick");
  const rendering = on && phase === "render";
  const count = picked.filter((_, index) => tick >= 2 + index).length;
  const pressed = tick === 6;

  return (
    <>
      <PriceTags on={on && phase === "done"} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-black/55 backdrop-blur-[10px] transition-[clip-path,opacity] ease-linear"
        style={{
          opacity: on && phase !== "done" ? 1 : 0,
          clipPath: rendering || phase === "done" ? "inset(100% 0% 0% 0%)" : "inset(0% 0% 0% 0%)",
          transitionDuration: rendering ? "1300ms, 300ms" : "0ms, 300ms",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        <span
          className="absolute inset-x-0 h-[3px] bg-brand shadow-[0_0_24px_6px_rgba(247,109,1,0.55)] transition-[top,opacity] ease-linear"
          style={{ top: rendering ? "100%" : "0%", opacity: rendering ? 1 : 0, transitionDuration: rendering ? "1300ms, 200ms" : "0ms, 200ms" }}
        />
        <span
          className={cn("absolute left-1/2 top-[46%] -translate-x-1/2 whitespace-nowrap transition-opacity duration-300", tag)}
          style={{ opacity: rendering ? 1 : 0 }}
        >
          <span className="text-brand">●</span> Rendering {picked.length} pieces · one pass
        </span>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-[7%] transition-opacity duration-300"
        style={{ opacity: panel ? 1 : 0 }}
      >
        <div className="w-full text-white">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">Synced from your store</span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-brand">
              {count} / {picked.length} picked
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {products.map((item, index) => {
              const pick = picked.indexOf(item as (typeof picked)[number]);
              const selected = pick >= 0 && tick >= 2 + pick;
              return (
                <span
                  key={item.id}
                  className={cn(
                    "relative overflow-hidden rounded-xl border bg-white/[0.06] transition-[opacity,transform,border-color,box-shadow] duration-300",
                    ease,
                    selected ? "border-brand shadow-[0_0_0_1.5px_var(--brand)]" : "border-white/15",
                  )}
                  style={{
                    opacity: panel ? (pick < 0 && tick >= 2 ? 0.45 : 1) : 0,
                    transform: panel ? (selected && tick === 2 + pick ? "scale(0.95)" : "none") : "translateY(10px)",
                    transitionDelay: panel && tick < 2 ? `${index * 60}ms` : "0ms",
                  }}
                >
                  <span
                    className="block aspect-square bg-white bg-no-repeat"
                    style={{ backgroundImage: `url(${item.image})`, backgroundPosition: item.crop, backgroundSize: item.zoom }}
                  />
                  <span className="block px-1.5 py-1">
                    <span className="block truncate text-[9px] font-medium">{item.name}</span>
                    <span className="block text-[9px] font-semibold text-brand">${item.price}</span>
                  </span>
                  <span
                    className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-brand text-[8px] font-bold transition-[opacity,transform] duration-200"
                    style={{ opacity: selected ? 1 : 0, transform: selected ? "scale(1)" : "scale(0.4)" }}
                  >
                    ✓
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-white/60">The dinner look</span>
            <span className="font-mono">${picked.filter((_, index) => tick >= 2 + index).reduce((sum, item) => sum + item.price, 0)}</span>
          </div>
          <span
            className={cn(
              "mt-2 flex h-8 items-center justify-center rounded-full text-[11px] font-semibold transition-[opacity,transform] duration-200",
              count === picked.length ? "bg-[image:var(--grad-brand)]" : "bg-white/10 opacity-60",
            )}
            style={{ transform: pressed ? "scale(0.95)" : "none" }}
          >
            Wear this look · ${pickedTotal}
          </span>
        </div>
      </div>
    </>
  );
}

const body = [
  ["Chest", "98 cm"],
  ["Waist", "82 cm"],
  ["Height", "182 cm"],
] as const;
const chart = [
  ["XS", "86–90", "72–76"],
  ["S", "90–94", "76–80"],
  ["M", "96–100", "80–84"],
  ["L", "102–106", "86–90"],
  ["XL", "108–112", "92–96"],
] as const;
const SIZE_LOOP = 28;
const scanAt: Record<number, number> = { 4: 0, 5: 1, 6: 3, 7: 2, 8: 2, 9: 2, 10: 2 };

/** Loops: their measurements, matched row by row against the brand's own chart, settle on one size, then the mirror. */
function SizeFlow({ on }: { on: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % SIZE_LOOP), TICK);
    return () => {
      window.clearInterval(id);
      setTick(0);
    };
  }, [on]);

  const panel = on && tick < 11;
  const row = scanAt[tick] ?? -1;
  const settled = tick >= 7 && tick < 11;
  const fit = tick >= 8 ? 94 : 0;

  return (
    <>
      <Measure on={on && tick >= 11} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/70 px-[7%] backdrop-blur-md transition-opacity duration-500"
        style={{ opacity: panel ? 1 : 0 }}
      >
        <div className="w-full text-white">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">Their body</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {body.map(([k, v], index) => (
              <span
                key={k}
                className={cn("rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1.5 transition-[opacity,transform] duration-300", ease)}
                style={{ opacity: panel && tick >= index ? 1 : 0, transform: panel && tick >= index ? "none" : "translateY(6px)" }}
              >
                <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-white/50">{k}</span>
                <span className="block font-mono text-[12px]">{v}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">Atelier North · size chart</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-brand">{tick >= 3 ? "Matching…" : ""}</span>
          </div>
          <div
            className="mt-2 overflow-hidden rounded-xl border border-white/15 transition-opacity duration-300"
            style={{ opacity: panel && tick >= 3 ? 1 : 0 }}
          >
            <div className="grid grid-cols-[1fr_1.4fr_1.4fr] bg-white/[0.08] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/50">
              <span>Size</span>
              <span>Chest</span>
              <span>Waist</span>
            </div>
            {chart.map(([size, chest, waist], index) => {
              const hit = row === index;
              const final = settled && index === 2;
              return (
                <div
                  key={size}
                  className={cn(
                    "grid grid-cols-[1fr_1.4fr_1.4fr] items-center border-t border-white/10 px-2.5 py-1.5 font-mono text-[10.5px] transition-colors duration-200",
                    final ? "bg-brand text-white" : hit ? "bg-white/15" : "text-white/70",
                  )}
                >
                  <span className="font-semibold">{size}</span>
                  <span>{chest}</span>
                  <span>{waist}</span>
                </div>
              );
            })}
          </div>

          <div
            className={cn("mt-3 flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 p-2.5 transition-[opacity,transform] duration-400", ease)}
            style={{ opacity: panel && tick >= 8 ? 1 : 0, transform: panel && tick >= 8 ? "none" : "translateY(8px)" }}
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-[background] duration-700"
              style={{ background: `conic-gradient(var(--brand) ${fit * 3.6}deg, rgba(255,255,255,0.15) 0deg)` }}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-black font-display text-sm font-semibold">M</span>
            </span>
            <span className="leading-tight">
              <span className="block text-[12px] font-semibold">Size M · {fit}% fit</span>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/60">From this brand&apos;s own chart</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

const pins = [
  { x: 41, y: 40, name: "Suit", price: "$189", side: "left" },
  { x: 47, y: 25, name: "Shirt", price: "$49", side: "left" },
  { x: 61, y: 91, name: "Loafers", price: "$55", side: "right" },
] as const;

function PriceTags({ on }: { on: boolean }) {
  return (
    <Layer on={on}>
      {pins.map((pin, index) => (
        <div key={pin.name} className="absolute" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
          <span
            className={cn("absolute -left-2 -top-2 h-4 w-4 transition-[opacity,transform] duration-500", ease)}
            style={reveal(on, 450 + index * 160, "scale(0.3)")}
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
            <span className="absolute inset-0 rounded-full border-2 border-white bg-brand" />
          </span>
          <span
            className={cn(
              "absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap transition-[opacity,transform] duration-500",
              tag,
              ease,
              pin.side === "right" ? "left-4" : "right-4",
            )}
            style={reveal(on, 600 + index * 160, `translateX(${pin.side === "right" ? -8 : 8}px)`)}
          >
            {pin.name}
            <span className="text-brand">{pin.price}</span>
          </span>
        </div>
      ))}
    </Layer>
  );
}

const rulers = [
  { y: 25, from: 25, to: 74, label: "Chest", value: "98 cm" },
  { y: 45, from: 29, to: 71, label: "Waist", value: "82 cm" },
];

function Measure({ on }: { on: boolean }) {
  return (
    <Layer on={on}>
      {rulers.map((ruler, index) => (
        <div key={ruler.label} className="absolute" style={{ top: `${ruler.y}%`, left: `${ruler.from}%`, width: `${ruler.to - ruler.from}%` }}>
          <span
            className="absolute inset-x-0 top-0 h-px origin-center bg-brand shadow-[0_0_8px_var(--brand)] transition-transform duration-700"
            style={{ transform: on ? "scaleX(1)" : "scaleX(0)", transitionDelay: on ? `${450 + index * 200}ms` : "0ms" }}
          />
          <span className="absolute -top-1.5 left-0 h-3 w-px bg-brand" />
          <span className="absolute -top-1.5 right-0 h-3 w-px bg-brand" />
          <span
            className={cn("absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap transition-[opacity,transform] duration-500", tag, ease)}
            style={reveal(on, 800 + index * 200)}
          >
            {ruler.label} <span className="text-brand">{ruler.value}</span>
          </span>
        </div>
      ))}
      <div className="absolute left-[80%] top-[19%] h-[48%] w-px">
        <span
          className="absolute inset-0 origin-top bg-brand/80 transition-transform duration-700"
          style={{ transform: on ? "scaleY(1)" : "scaleY(0)", transitionDelay: on ? "850ms" : "0ms" }}
        />
        <span className="absolute -left-1.5 top-0 h-px w-3 bg-brand" />
        <span className="absolute -left-1.5 bottom-0 h-px w-3 bg-brand" />
      </div>
      <div
        className={cn("absolute bottom-[22%] left-1/2 flex -translate-x-1/2 items-center whitespace-nowrap gap-3 rounded-full border border-white/15 bg-black/65 py-1.5 pl-1.5 pr-4 text-white backdrop-blur-md transition-[opacity,transform] duration-500", ease)}
        style={reveal(on, 1250)}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[image:var(--grad-brand)] font-display text-sm font-semibold">M</span>
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold">True fit</span>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/60">From your size chart</span>
        </span>
      </div>
    </Layer>
  );
}

const joints = [
  [50, 13],
  [31, 24],
  [69, 24],
  [28, 41],
  [72, 41],
  [31, 56],
  [68, 56],
  [38, 52],
  [62, 52],
  [37, 74],
  [61, 74],
  [37, 89],
  [61, 89],
];
const bones = [
  [0, 1],
  [0, 2],
  [1, 3],
  [3, 5],
  [2, 4],
  [4, 6],
  [1, 7],
  [2, 8],
  [7, 8],
  [7, 9],
  [9, 11],
  [8, 10],
  [10, 12],
];

function LiveHud({ on }: { on: boolean }) {
  const corners = ["left-4 top-12 border-l-2 border-t-2", "right-4 top-12 border-r-2 border-t-2", "bottom-24 left-4 border-b-2 border-l-2", "bottom-24 right-4 border-b-2 border-r-2"];
  return (
    <Layer on={on}>
      {corners.map((corner) => (
        <span key={corner} className={cn("absolute h-6 w-6 border-white/70", corner)} />
      ))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {bones.map(([a, b], index) => (
          <line
            key={index}
            x1={joints[a][0]}
            y1={joints[a][1]}
            x2={joints[b][0]}
            y2={joints[b][1]}
            stroke="rgba(247,109,1,0.75)"
            strokeWidth="0.35"
            vectorEffect="non-scaling-stroke"
            className="transition-opacity duration-500"
            style={{ opacity: on ? 1 : 0, transitionDelay: on ? `${500 + index * 40}ms` : "0ms" }}
          />
        ))}
      </svg>
      <div className="absolute inset-0">
        {joints.map(([x, y], index) => (
          <span
            key={index}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-brand transition-opacity duration-300"
            style={{ left: `${x}%`, top: `${y}%`, opacity: on ? 1 : 0, transitionDelay: on ? `${450 + index * 40}ms` : "0ms" }}
          />
        ))}
      </div>
      <span
        className={cn("absolute bottom-[7.25rem] left-4 flex items-center gap-1.5 transition-[opacity,transform] duration-500", tag, ease)}
        style={reveal(on, 900)}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b3b] shadow-[0_0_8px_#ff3b3b]" /> Rec · front camera
      </span>
      <span
        className={cn("absolute bottom-[7.25rem] right-4 transition-[opacity,transform] duration-500", tag, ease)}
        style={reveal(on, 1000)}
      >
        Body <span className="text-brand">tracked</span>
      </span>
    </Layer>
  );
}

const rack = (["bomber", "coat", "suit", "tee"] as const).map((id) => products.find((item) => item.id === id)!);
const LIVE_LOOP = 34;
const taps: Record<number, number> = { 9: 1, 15: 2, 21: 3, 27: 0 };

function wornAt(tick: number) {
  let worn = 0;
  for (const [at, index] of Object.entries(taps)) if (tick >= Number(at)) worn = index;
  return worn;
}

/** Loops: camera off, the shopper starts live try-on, then taps garments on the rack and each one is on them instantly. */
function LiveFlow({ on }: { on: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % LIVE_LOOP), TICK);
    return () => {
      window.clearInterval(id);
      setTick(0);
    };
  }, [on]);

  const live = on && tick >= 3;
  const worn = wornAt(tick);
  const tapping = taps[tick];

  return (
    <>
      {rack.map((item, index) =>
        index === 0 ? null : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.id}
            src={item.image}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-150"
            style={{ opacity: live && worn === index ? 1 : 0 }}
          />
        ),
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white mix-blend-overlay transition-opacity duration-200"
        style={{ opacity: live && tapping !== undefined ? 0.35 : 0 }}
      />

      <LiveHud on={live} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[9.25rem] z-10 flex justify-center gap-2 transition-[opacity,transform] duration-500"
        style={{ opacity: live ? 1 : 0, transform: live ? "none" : "translateY(10px)", transitionDelay: live ? "500ms" : "0ms" }}
      >
        {rack.map((item, index) => (
          <span
            key={item.id}
            className={cn(
              "relative h-14 w-11 overflow-hidden rounded-[10px] border-2 bg-white bg-no-repeat transition-[border-color,transform] duration-200",
              worn === index ? "border-brand" : "border-white/30",
            )}
            style={{
              backgroundImage: `url(${item.image})`,
              backgroundPosition: item.crop,
              backgroundSize: item.zoom,
              transform: tapping === index ? "scale(0.88)" : worn === index ? "translateY(-4px)" : "none",
            }}
          >
            <span
              className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/60 transition-[opacity,transform] duration-300"
              style={{ opacity: tapping === index ? 1 : 0, transform: `translate(-50%, -50%) scale(${tapping === index ? 1.4 : 0.2})` }}
            />
          </span>
        ))}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/90 to-transparent p-4 pt-10 transition-opacity duration-300"
        style={{ opacity: on ? 1 : 0 }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">{live ? "Live · on their camera" : "Camera off"}</p>
        <p className="mt-1 font-serif text-2xl italic leading-none text-white">{live ? rack[worn].name : "Ready when they are"}</p>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0d0814] px-8 text-center text-white transition-opacity duration-500"
        style={{ opacity: on && !live ? 1 : 0 }}
      >
        <span className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/5 text-white/70">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="12.5" r="3.5" />
          </svg>
        </span>
        <p className="text-[13px] text-white/75">Your picks are ready. See them on you, live.</p>
        <span
          className="flex h-10 items-center gap-2 rounded-full bg-[image:var(--grad-brand)] px-6 text-[12px] font-semibold shadow-[0_8px_24px_-8px_rgba(247,109,1,0.6)] transition-transform duration-150"
          style={{ transform: tick === 2 ? "scale(0.92)" : "none" }}
        >
          <span className="h-2 w-2 rounded-full bg-white" /> Start live try-on
        </span>
        <p className="text-[10px] text-white/40">Uses their own camera · 90-second session</p>
      </div>
    </>
  );
}

export function MirrorOverlays({ active }: { active: number }) {
  return (
    <>
      <AvatarFlow on={active === 0} />
      <CatalogFlow on={active === 1} />
      <SizeFlow on={active === 2} />
      <LiveFlow on={active === 3} />
    </>
  );
}
