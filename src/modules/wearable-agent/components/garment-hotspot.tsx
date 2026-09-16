"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Loader2, Plus, ShoppingBag } from "lucide-react";
import type { Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { cn } from "@/lib/utils/cn";

export interface ActiveLookItem {
  product: Product;
  size: string;
  position: { top: string; left: string };
}

interface GarmentHotspotProps {
  item: ActiveLookItem;
  inCart: boolean;
  isPending?: boolean;
  onAddToCart: (product: Product) => void;
}

/** Fixed, known width — the horizontal flip math below needs an exact number to compare
 *  against the frame's real pixel width, not whatever Tailwind's `w-*` happens to render. */
const CARD_WIDTH = 208;
const GAP = 10;
/** Never let the card touch the frame's own edge, phone or desktop. */
const EDGE_PADDING = 10;

export function GarmentHotspot({ item, inCart, isPending = false, onAddToCart }: GarmentHotspotProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [side, setSide] = React.useState<"left" | "right">("right");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Using a delayed close so the mouse can travel from the dot across the gap
  // into the popover without the card disappearing mid-journey.
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setIsOpen(false), 160);
  }
  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  React.useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  // Picks the side with room the moment the card opens, from the *actual* pixel width of the
  // photo frame it's positioned against — not a fixed "past 55% of the panel" guess. That
  // guess assumed a wide desktop panel; on a ~390px phone frame a hotspot sitting at even 35%
  // from the left already has less than the card's own 208px + gap of room to its right, so it
  // opened off the edge and got clipped exactly as reported (name, price and the Add to Cart
  // button all cut off).
  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const parent = rootRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const leftPx = (parseFloat(item.position.left) / 100) * parent.clientWidth;
    const fitsRight = leftPx + GAP + CARD_WIDTH + EDGE_PADDING <= parent.clientWidth;
    setSide(fitsRight ? "right" : "left");
  }, [isOpen, item.position.left]);

  // Same idea vertically, without needing to measure the card's own height (which depends on
  // a 1- vs 2-line product name): a dot near the top or bottom of a short mobile frame can't
  // support a card centred on it without spilling past that edge, so anchor the card's own
  // top/bottom edge to the dot instead of straddling it in those zones.
  const topPct = parseFloat(item.position.top);
  const vAlign = topPct < 30 ? "top" : topPct > 70 ? "bottom" : "center";

  return (
    <div
      ref={rootRef}
      className="absolute z-[25] pointer-events-auto"
      style={{ top: item.position.top, left: item.position.left }}
    >
      {/* Hotspot dot — hover opens, click toggles. Hit area is larger than the visible dot to
          clear the 44px touch-target minimum without making the marker itself look oversized. */}
      <button
        type="button"
        onClick={() => { cancelClose(); setIsOpen((v) => !v); }}
        onMouseEnter={() => { cancelClose(); setIsOpen(true); }}
        onMouseLeave={scheduleClose}
        aria-label={`${item.product.name} — view details`}
        className="relative -translate-x-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center group"
      >
        <span className="absolute inset-0 m-auto h-7 w-7 rounded-full bg-white/50 animate-ping" />
        <span
          className={cn(
            "relative h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(0,0,0,0.3)] transition-colors",
            inCart ? "bg-[#10b981]" : "bg-[var(--color-brand)] group-hover:brightness-110"
          )}
        />
        {/* "+" badge */}
        {!isOpen && (
          <span className="pointer-events-none absolute top-[7px] right-[7px] h-3.5 w-3.5 rounded-full bg-black/70 border border-white/40 flex items-center justify-center">
            <Plus className="h-2 w-2 text-white" />
          </span>
        )}
      </button>

      {/* Popover card — enters the same mouse-zone so moving from dot→card cancels close */}
      {isOpen && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{ width: CARD_WIDTH }}
          className={cn(
            "absolute rounded-xl border border-white/15",
            "bg-[rgba(10,8,14,0.96)] backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)]",
            "p-3 z-[30] animate-fade-in",
            side === "left" ? "right-[calc(100%+10px)]" : "left-[calc(100%+10px)]",
            vAlign === "top" && "top-0",
            vAlign === "bottom" && "bottom-0",
            vAlign === "center" && "top-1/2 -translate-y-1/2"
          )}
        >
          <div className="flex gap-2.5">
            <div className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
              <Image src={item.product.imageUrl} alt={item.product.name} fill sizes="48px" className="object-cover" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-white leading-snug line-clamp-2">{item.product.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[12px] font-bold text-white">
                  {formatPrice(item.product.price, item.product.currency)}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-brand)]/20 text-[var(--color-brand)] whitespace-nowrap">
                  Size {item.size}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { onAddToCart(item.product); setIsOpen(false); }}
            disabled={inCart || isPending}
            className={cn(
              "mt-2.5 w-full h-11 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all",
              inCart
                ? "bg-white/10 text-white/60 cursor-default"
                : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white hover:brightness-110 active:scale-[0.97]"
            )}
          >
            {isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…</>
            ) : inCart ? (
              <><Check className="h-3.5 w-3.5" /> Added to Cart</>
            ) : (
              <><ShoppingBag className="h-3.5 w-3.5" /> Add to Cart</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
