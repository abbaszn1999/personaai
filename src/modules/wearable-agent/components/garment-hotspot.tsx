"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Loader2, Plus, ShoppingBag, X } from "lucide-react";
import type { Product } from "@/modules/commerce/types";
import { formatPrice } from "@/modules/commerce/constants";
import { cn } from "@/lib/utils/cn";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { useWearableTheme } from "../theme-context";
import { HOTSPOT_MIN_GAP, placeHotspotCard, spreadHotspots, type Point } from "../utils/hotspot-layout";
import { bodyHotspotAnchor } from "../utils/hotspot-anchor";
import { useBodyBounds } from "../lib/use-body-bounds";
import type { GarmentCategory } from "../utils/fit-metrics";

export interface ActiveLookItem {
  product: Product;
  size: string;
  /** Fallback spot (%), used until the body is found in the picture, or when it can't be. */
  position: { top: string; left: string };
  /** What the garment is, and how many of the same kind came before it. With the body found,
   *  these place the dot on the garment itself. */
  slot?: GarmentCategory;
  stagger?: number;
}

interface GarmentHotspotProps {
  item: ActiveLookItem;
  inCart: boolean;
  isPending?: boolean;
  onAddToCart: (product: Product) => void;
  /** A second press on an item already in the cart takes it back out. */
  onRemoveFromCart?: (product: Product) => void;
  /** Where the other dots are (the layer's pixels), so the open card stays off them. */
  neighbours?: readonly Point[];
}

/** Fixed, known width — the horizontal flip math below needs an exact number to compare
 *  against the frame's real pixel width, not whatever Tailwind's `w-*` happens to render. */
const CARD_WIDTH = 208;
const GAP = 10;
/** Never let the card touch the frame's own edge, phone or desktop. */
const EDGE_PADDING = 10;

export function GarmentHotspot({
  item,
  inCart,
  isPending = false,
  onAddToCart,
  onRemoveFromCart,
  neighbours = [],
}: GarmentHotspotProps) {
  const neighbourKey = neighbours.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
  const light = useWearableTheme() === "light";
  const [isOpen, setIsOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState({ left: GAP, top: 0, width: CARD_WIDTH });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover and focus-out only drive the card for a real mouse or keyboard. A touch screen
  // fabricates mouse events from a tap (enter, then click) and blurs the dot whenever the
  // shopper touches anything inside the card, so wiring those to open/close made the card
  // flicker shut on a phone. Touch opens and closes by tapping the dot, or by tapping outside.
  const keyboardFocus = React.useRef(false);

  // Using a delayed close so the mouse can travel from the dot across the gap
  // into the popover without the card disappearing mid-journey.
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsOpen(false), 160);
  }
  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  React.useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useClickOutside(rootRef, React.useCallback(() => setIsOpen(false), []), isOpen);

  // Compute an exact position inside the visible avatar area. Picking only "left" or "right"
  // is not enough on a phone: a hotspot around the middle can have less than 208px available
  // on *both* sides. We first choose the more natural side, then clamp the resulting card box
  // to the frame's edges. The vertical calculation also subtracts `--sheet-h`, because that
  // part of the avatar is physically covered by the chat sheet even though it is still part of
  // the hotspot layer's DOM box.
  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const root = rootRef.current;
    const card = cardRef.current;
    const parent = root?.offsetParent as HTMLElement | null;
    if (!root || !card || !parent) return;

    const update = () => {
      // offsetLeft/Top and clientWidth/Height are all in the same CSS-pixel coordinate space.
      // Mixing boundingClientRect (post-transform pixels) with clientWidth (pre-transform
      // pixels) would break this math if the dashboard preview is ever scaled.
      const anchorX = root.offsetLeft;
      const anchorY = root.offsetTop;
      const width = Math.min(CARD_WIDTH, Math.max(160, parent.clientWidth - EDGE_PADDING * 2));
      const cardHeight = card.getBoundingClientRect().height;

      const sheetHeight = parseFloat(getComputedStyle(parent).getPropertyValue("--sheet-h")) || 0;
      const visibleHeight = Math.max(0, parent.clientHeight - sheetHeight);
      // Beside the dot when there is room; otherwise in a free slot above or below, so it
      // never sits on the dot's neighbours (a tee's card used to cover the jacket's dot).
      const spot = placeHotspotCard({
        anchor: { x: anchorX, y: anchorY },
        others: neighbours,
        card: { width, height: cardHeight },
        frame: { width: parent.clientWidth, height: visibleHeight },
        gap: GAP,
        edge: EDGE_PADDING,
      });

      setPlacement({ left: spot.x - anchorX, top: spot.y - anchorY, width });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    observer.observe(card);
    return () => observer.disconnect();
    // `neighbourKey` stands in for the array itself, which is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item.position.left, item.position.top, neighbourKey]);

  return (
    <div
      ref={rootRef}
      // The open one rises above its neighbours so its card is never under another dot.
      className={cn("absolute pointer-events-auto", isOpen ? "z-[28]" : "z-[25]")}
      style={{ top: item.position.top, left: item.position.left }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") cancelClose();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") scheduleClose();
      }}
      onFocus={(e) => {
        // Only keyboard focus (focus-visible) opens the card; a tap also focuses the dot.
        if ((e.target as HTMLElement).matches?.(":focus-visible")) {
          keyboardFocus.current = true;
          cancelClose();
          setIsOpen(true);
        }
      }}
      onBlur={(e) => {
        if (!keyboardFocus.current) return;
        if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
        keyboardFocus.current = false;
        scheduleClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setIsOpen(false);
      }}
    >
      {/* Hotspot dot — hover opens, click toggles. Hit area is larger than the visible dot to
          clear the 44px touch-target minimum without making the marker itself look oversized. */}
      <button
        type="button"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setIsOpen(true);
        }}
        onClick={(e) => {
          cancelClose();
          // A mouse has already opened it by hovering, so its click must not toggle it shut.
          // `detail === 0` is a keyboard-triggered click: toggle.
          const mouse = (e.nativeEvent as PointerEvent).pointerType === "mouse" && e.detail > 0;
          setIsOpen((open) => (mouse ? true : !open));
        }}
        aria-label={`${item.product.name} — view details`}
        aria-expanded={isOpen}
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
          ref={cardRef}
          style={{ width: placement.width, left: placement.left, top: placement.top }}
          className={cn(
            "absolute rounded-[var(--radius-xl)] border backdrop-blur-2xl p-3 z-[30] animate-fade-in",
            light
              ? "border-black/[0.08] bg-[rgba(255,255,255,0.97)] shadow-[0_16px_40px_rgba(23,18,29,0.16)]"
              : "border-white/15 bg-[rgba(10,8,14,0.96)] shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
          )}
        >
          <div className="flex gap-2.5">
            <div className={cn("relative h-12 w-12 rounded-[var(--radius-md)] overflow-hidden shrink-0 border", light ? "border-black/[0.08]" : "border-white/10")}>
              <Image src={item.product.imageUrl} alt={item.product.name} fill sizes="48px" className="object-cover" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[12px] font-semibold leading-snug line-clamp-2", light ? "text-[#17121d]" : "text-white")}>{item.product.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={cn("text-[12px] font-bold", light ? "text-[#17121d]" : "text-white")}>
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
            // The card stays open after either press: the shopper sees the result and can undo it.
            onClick={() => (inCart ? onRemoveFromCart?.(item.product) : onAddToCart(item.product))}
            disabled={isPending || (inCart && !onRemoveFromCart)}
            aria-pressed={inCart}
            className={cn(
              "mt-2.5 w-full h-11 rounded-[var(--radius-md)] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all",
              inCart
                ? light
                  ? "bg-black/[0.05] text-[#17121d] hover:bg-red-500/10 active:scale-[0.97]"
                  : "bg-white/10 text-white hover:bg-red-500/15 active:scale-[0.97]"
                : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white hover:brightness-110 active:scale-[0.97]"
            )}
          >
            {isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {inCart ? "Removing…" : "Adding…"}</>
            ) : inCart ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#10b981]" /> In cart
                {onRemoveFromCart && (
                  <>
                    <span aria-hidden className={light ? "h-4 w-px bg-black/15" : "h-4 w-px bg-white/20"} />
                    <X className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-red-500">Remove</span>
                  </>
                )}
              </>
            ) : (
              <><ShoppingBag className="h-3.5 w-3.5" /> Add to Cart</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface GarmentHotspotLayerProps {
  items: readonly ActiveLookItem[];
  /** The avatar picture the dots sit on. Its body is located so each dot lands on its garment. */
  imageUrl?: string | null;
  cartItemIds: ReadonlySet<string>;
  pendingCartIds: ReadonlySet<string>;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart?: (product: Product) => void;
}

/**
 * Every dot on the avatar, laid out together. Each garment has a guessed spot on the body, and a
 * jacket over a tee guesses almost the same one, so dots that would sit closer than a thumb can
 * tell apart are spread out (see `spreadHotspots`) and each open card is kept off the others.
 * It works from the dots' pixel positions, not from which garments there are, so any outfit —
 * any number of pieces, any gender — gets dots that are all easy to hit.
 */
export function GarmentHotspotLayer({
  items,
  imageUrl,
  cartItemIds,
  pendingCartIds,
  onAddToCart,
  onRemoveFromCart,
}: GarmentHotspotLayerProps) {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bounds = useBodyBounds(imageUrl ?? null)?.bounds ?? null;

  const points = React.useMemo(() => {
    if (size.width === 0 || size.height === 0) return [];
    const half = HOTSPOT_MIN_GAP / 2;
    // Each dot's spot as fractions of the picture: on the garment when the body was found,
    // otherwise the fixed guess.
    const spots = items.map((item) => {
      const onBody = bounds && item.slot ? bodyHotspotAnchor(item.slot, bounds, item.stagger ?? 0) : null;
      return onBody ?? { top: parseFloat(item.position.top) / 100, left: parseFloat(item.position.left) / 100 };
    });
    const ys = spreadHotspots(
      spots.map((spot) => spot.top * size.height),
      HOTSPOT_MIN_GAP,
      half,
      Math.max(half, size.height - half)
    );
    return spots.map((spot, i) => ({ x: spot.left * size.width, y: ys[i] }));
  }, [items, bounds, size.width, size.height]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-[18]">
      {points.length === items.length &&
        items.map((item, i) => (
          <GarmentHotspot
            key={item.product.id}
            item={{ ...item, position: { top: `${points[i].y}px`, left: `${points[i].x}px` } }}
            inCart={cartItemIds.has(item.product.id)}
            isPending={pendingCartIds.has(item.product.id)}
            onAddToCart={onAddToCart}
            onRemoveFromCart={onRemoveFromCart}
            neighbours={points.filter((_, j) => j !== i)}
          />
        ))}
    </div>
  );
}
