"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Ruler, ShoppingBag, X } from "lucide-react";
import type { ActiveLookItem } from "./garment-hotspot";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { getProductSizeLabel } from "../utils/fit-metrics";
import { cn } from "@/lib/utils/cn";

interface SizeGuideModalProps {
  lookLabel: string;
  items: ActiveLookItem[];
  cartItemIds: Set<string>;
  onAddToCart: (item: ActiveLookItem["product"]) => void;
  onClose: () => void;
}

const SIZE_SCALE = ["XS", "S", "M", "L", "XL"];

export function SizeGuideModal({ lookLabel, items, cartItemIds, onAddToCart, onClose }: SizeGuideModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#151019] shadow-[0_24px_64px_rgba(0,0,0,0.6)] animate-fade-in overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-wearable flex items-center justify-center">
              <Ruler className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Size Guide</h3>
              <p className="text-[11px] text-white/40">{lookLabel} — based on your measurements</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              Add items to your outfit to see personalized size recommendations.
            </p>
          ) : (
            items.map((item) => {
              const inCart = cartItemIds.has(item.product.id);
              const category = getProductSizeLabel(item.product.name);
              const sizeVariants = item.product.variants.filter((v) => v.type === "size");
              const scale = sizeVariants.length > 0 ? sizeVariants.map((v) => v.label) : SIZE_SCALE;

              return (
                <div key={item.product.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                  <div className="flex gap-3">
                    <div className="relative h-16 w-16 rounded-lg overflow-hidden shrink-0 border border-white/10">
                      <Image src={item.product.imageUrl} alt={item.product.name} fill className="object-cover" unoptimized />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{category}</p>
                      <p className="text-[13px] font-semibold text-white leading-snug mt-0.5">{item.product.name}</p>
                      <p className="text-[12px] text-white/50 mt-0.5">
                        {formatPrice(item.product.price, item.product.currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddToCart(item.product)}
                      disabled={inCart}
                      className={cn(
                        "h-8 self-start px-3 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 shrink-0 transition-all",
                        inCart
                          ? "bg-white/10 text-white/60"
                          : "bg-gradient-to-r from-[#f76d01] to-[#c40000] text-white hover:brightness-105"
                      )}
                    >
                      {inCart ? <Check className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                      {inCart ? "Added" : "Add"}
                    </button>
                  </div>

                  {/* Size scale row with recommendation highlighted */}
                  <div className="flex items-center gap-1.5 mt-3">
                    {scale.map((size) => {
                      const isRecommended = size === item.size;
                      return (
                        <div
                          key={size}
                          className={cn(
                            "flex-1 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all",
                            isRecommended
                              ? "bg-gradient-to-r from-[#f76d01] to-[#ff8a2b] text-white shadow-[0_2px_10px_rgba(247,109,1,0.4)]"
                              : "bg-white/[0.05] text-white/40 border border-white/[0.06]"
                          )}
                        >
                          {size}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-white/35 mt-1.5">
                    Recommended: <span className="text-[#f76d01] font-semibold">{item.size}</span> based on your body profile
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
