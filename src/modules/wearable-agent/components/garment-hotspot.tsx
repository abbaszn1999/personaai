"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Plus, ShoppingBag } from "lucide-react";
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
  onAddToCart: (product: Product) => void;
}

export function GarmentHotspot({ item, inCart, onAddToCart }: GarmentHotspotProps) {
  const [isOpen, setIsOpen] = React.useState(false);
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

  const flipLeft = parseFloat(item.position.left) > 55;

  return (
    <div
      className="absolute z-[25] pointer-events-auto"
      style={{ top: item.position.top, left: item.position.left }}
    >
      {/* Hotspot dot — hover opens, click toggles */}
      <button
        type="button"
        onClick={() => { cancelClose(); setIsOpen((v) => !v); }}
        onMouseEnter={() => { cancelClose(); setIsOpen(true); }}
        onMouseLeave={scheduleClose}
        className="relative -translate-x-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center group"
      >
        <span className="absolute inset-0 rounded-full bg-white/50 animate-ping" />
        <span
          className={cn(
            "relative h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_3px_rgba(0,0,0,0.3)] transition-colors",
            inCart ? "bg-[#10b981]" : "bg-[#f76d01] group-hover:bg-[#ff8a2b]"
          )}
        />
        {/* "+" badge */}
        {!isOpen && (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-black/70 border border-white/40 flex items-center justify-center">
            <Plus className="h-2 w-2 text-white" />
          </span>
        )}
      </button>

      {/* Popover card — enters the same mouse-zone so moving from dot→card cancels close */}
      {isOpen && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-56 rounded-xl border border-white/15",
            "bg-[rgba(10,8,14,0.94)] backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)]",
            "p-3 z-[30] animate-fade-in",
            flipLeft ? "right-[calc(100%+10px)]" : "left-[calc(100%+10px)]"
          )}
        >
          <div className="flex gap-2.5">
            <div className="relative h-14 w-14 rounded-lg overflow-hidden shrink-0 border border-white/10">
              <Image src={item.product.imageUrl} alt={item.product.name} fill className="object-cover" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-white leading-snug line-clamp-2">{item.product.name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[12px] font-bold text-white">
                  {formatPrice(item.product.price, item.product.currency)}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f76d01]/20 text-[#f76d01]">
                  Size {item.size}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { onAddToCart(item.product); setIsOpen(false); }}
            disabled={inCart}
            className={cn(
              "mt-2.5 w-full h-9 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all",
              inCart
                ? "bg-white/10 text-white/60 cursor-default"
                : "bg-gradient-to-r from-[#f76d01] to-[#e85d04] text-white hover:brightness-110 active:scale-[0.97]"
            )}
          >
            {inCart ? <><Check className="h-3.5 w-3.5" /> Added to Cart</> : <><ShoppingBag className="h-3.5 w-3.5" /> Add to Cart</>}
          </button>
        </div>
      )}
    </div>
  );
}
