import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PlusCircle,
  Ruler,
  Search,
  Shirt,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/modules/shopping-agent/types";
import type { BundleSuggestion, Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import { SCAN_STAGES } from "../mocks/responses";
import { cn } from "@/lib/utils/cn";

interface WearableChatMessageProps {
  message: ChatMessageType;
  isLast?: boolean;
  userPhotoUrl?: string | null;
  inlineProducts?: Product[];
  outfitItemIds?: string[];
  cartItemIds?: string[];
  isGenerating?: boolean;
  onWearItem?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onQuickOption?: (label: string) => void;
  onRenderBundle?: (productIds: string[]) => void;
  onAddBundleToCart?: (productIds: string[]) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function WearableChatMessage({
  message,
  isLast = false,
  userPhotoUrl,
  inlineProducts,
  outfitItemIds = [],
  cartItemIds = [],
  isGenerating = false,
  onWearItem,
  onAddToCart,
  onQuickOption,
  onRenderBundle,
  onAddBundleToCart,
}: WearableChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2.5 animate-fade-in", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser ? (
        <div className="h-8 w-8 rounded-full gradient-wearable flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Shirt className="h-4 w-4 text-white" />
        </div>
      ) : userPhotoUrl ? (
        <div className="relative h-8 w-8 rounded-full overflow-hidden shrink-0 mt-0.5 border-2 border-[var(--color-wearable-from)]/40">
          <Image src={userPhotoUrl} alt="You" fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="h-8 w-8 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-[var(--color-wearable-from)]" />
        </div>
      )}

      <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start", "max-w-[88%]")}>
        <div
          className={cn(
            "rounded-[var(--radius-xl)] px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-[var(--color-accent)]/90 text-white rounded-br-[var(--radius-sm)]"
              : "bg-[var(--color-surface-base)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-bl-[var(--radius-sm)]"
          )}
        >
          {message.content}
        </div>

        <span className="text-[10px] text-[var(--color-text-muted)] px-1">
          {formatTime(message.timestamp)}
        </span>

        {message.quickOptions && message.quickOptions.length > 0 && isLast && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {message.quickOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onQuickOption?.(option)}
                className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {inlineProducts && inlineProducts.length > 0 && (
          <InlineProductScroller>
            {inlineProducts.map((product) => (
              <InlineSuggestionCard
                key={product.id}
                product={product}
                isWorn={outfitItemIds.includes(product.id)}
                inCart={cartItemIds.includes(product.id)}
                isGenerating={isGenerating}
                onWear={() => onWearItem?.(product)}
                onAddToCart={() => onAddToCart?.(product)}
              />
            ))}
          </InlineProductScroller>
        )}

        {message.bundles && message.bundles.length > 0 && (
          <div className="flex flex-col gap-2.5 w-full mt-1">
            {message.bundles.map((bundle, i) => (
              <BundleSuggestionCard
                key={bundle.id}
                bundle={bundle}
                index={i}
                cartItemIds={cartItemIds}
                isGenerating={isGenerating}
                onRender={() => onRenderBundle?.(bundle.productIds)}
                onAddAllToCart={() => onAddBundleToCart?.(bundle.productIds)}
              />
            ))}
          </div>
        )}

        {message.tryOnImage && (
          <TryOnResultCard
            items={message.tryOnImage.items}
            recommendedSizes={message.tryOnImage.recommendedSizes}
            fitNotes={message.tryOnImage.fitNotes}
          />
        )}
      </div>
    </div>
  );
}

/** Horizontally scrollable product row with arrow controls on the edges. */
function InlineProductScroller({ children }: { children: React.ReactNode }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollState, children]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "right" ? 210 : -210, behavior: "smooth" });
  }

  return (
    <div className="relative w-full mt-1">
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[var(--color-surface-card)] to-transparent" />
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll products left"
            className="absolute left-1 top-1/2 z-20 -translate-y-1/2 h-8 w-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)]/95 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] flex items-center justify-center hover:text-[var(--color-brand)] hover:border-[var(--color-brand)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-2.5 overflow-x-auto pb-1 w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[var(--color-surface-card)] via-[var(--color-surface-card)]/80 to-transparent" />
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll products right"
            className="absolute right-1 top-1/2 z-20 -translate-y-1/2 h-8 w-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)]/95 text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)] flex items-center justify-center hover:text-[var(--color-brand)] hover:border-[var(--color-brand)] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

interface InlineSuggestionCardProps {
  product: Product;
  isWorn: boolean;
  inCart: boolean;
  isGenerating: boolean;
  onWear: () => void;
  onAddToCart: () => void;
}

export function InlineSuggestionCard({ product, isWorn, inCart, isGenerating, onWear, onAddToCart }: InlineSuggestionCardProps) {
  // Disable while anything is rendering (avoid overlapping requests) or once it's already on the avatar.
  const wearDisabled = !product.inStock || isGenerating || isWorn;
  const wearBusy = isGenerating && isWorn;

  return (
    <div
      className={cn(
        "shrink-0 w-48 rounded-[var(--radius-xl)] border bg-[var(--color-surface-card)] overflow-hidden transition-all duration-200",
        isWorn
          ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]/30"
          : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
      )}
    >
      <div className="relative h-36 bg-[var(--color-surface-base)]">
        <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
        {isWorn && (
          <div className="absolute inset-0 bg-[var(--color-brand)]/10 flex items-center justify-center">
            <div className="h-7 w-7 rounded-full gradient-wearable flex items-center justify-center shadow-lg">
              {wearBusy ? (
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-2.5 space-y-2">
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-primary)] line-clamp-1">{product.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Star className="h-2.5 w-2.5 text-amber-400 fill-current" />
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {product.rating} ({product.reviewCount})
            </span>
          </div>
        </div>
        <span className="block text-xs font-bold text-[var(--color-text-primary)]">
          {formatPrice(product.price, product.currency)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAddToCart}
            disabled={inCart || !product.inStock}
            title="Add to cart"
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-all",
              inCart
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : product.inStock
                  ? "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                  : "bg-[var(--color-surface-base)] text-[var(--color-text-muted)] cursor-not-allowed"
            )}
          >
            {inCart ? (
              <>
                <CheckCircle2 className="h-2.5 w-2.5" /> Added
              </>
            ) : (
              <>
                <PlusCircle className="h-2.5 w-2.5" /> Cart
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onWear}
            disabled={wearDisabled}
            title={isWorn ? "On your avatar" : "Wear it — render on avatar"}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-all",
              isWorn
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : "gradient-brand text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {wearBusy ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Rendering
              </>
            ) : isWorn ? (
              <>
                <CheckCircle2 className="h-2.5 w-2.5" /> On Avatar
              </>
            ) : (
              <>
                <Sparkles className="h-2.5 w-2.5" /> Wear It
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BundleSuggestionCardProps {
  bundle: BundleSuggestion;
  index: number;
  cartItemIds: string[];
  isGenerating: boolean;
  onRender: () => void;
  onAddAllToCart: () => void;
}

function BundleSuggestionCard({ bundle, index, cartItemIds, isGenerating, onRender, onAddAllToCart }: BundleSuggestionCardProps) {
  const products = bundle.productIds
    .map((id) => MOCK_WEARABLE_PRODUCTS.find((p) => p.id === id))
    .filter((p): p is Product => !!p);

  if (products.length === 0) return null;

  const total = products.reduce((sum, p) => sum + p.price, 0);
  const currency = products[0]?.currency ?? "USD";
  const allInCart = products.every((p) => cartItemIds.includes(p.id));

  return (
    <div className="w-full max-w-[320px] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] overflow-hidden">
      <BundleItemMosaic products={products} bundleIndex={index} />

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{bundle.label}</p>
          <span className="shrink-0 text-[10px] rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] px-2 py-0.5 font-semibold">
            {products.length} Items
          </span>
        </div>
        <p className={cn(
          "text-[11px] text-[var(--color-text-muted)]",
          products.length <= 4 ? "line-clamp-1" : "line-clamp-2"
        )}>
          {products.map((p) => p.name).join(" · ")}
        </p>
        <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatPrice(total, currency)}</p>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={onAddAllToCart}
            disabled={allInCart}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-all",
              allInCart
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            )}
          >
            {allInCart ? (
              <>
                <CheckCircle2 className="h-3 w-3" /> Added
              </>
            ) : (
              <>
                <PlusCircle className="h-3 w-3" /> Add All
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRender}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full gradient-brand text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Rendering
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" /> Render Full Look
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Adapts the bundle thumbnail layout to however many items the agent suggested. */
function BundleItemMosaic({ products, bundleIndex }: { products: Product[]; bundleIndex: number }) {
  const badge = (
    <span className="absolute top-2.5 left-2.5 z-10 h-5 w-5 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center justify-center">
      {bundleIndex + 1}
    </span>
  );

  function Thumb({ product, className }: { product: Product; className?: string }) {
    return (
      <div className={cn("relative overflow-hidden rounded-[10px] bg-[var(--color-surface-card)]", className)}>
        <Image src={product.imageUrl} alt={product.name} fill className="object-cover" unoptimized />
      </div>
    );
  }

  // 1 item — single hero image
  if (products.length === 1) {
    return (
      <div className="relative p-1.5 bg-[var(--color-surface-base)]">
        {badge}
        <Thumb product={products[0]} className="aspect-[5/3] w-full" />
      </div>
    );
  }

  // 2 items — equal split
  if (products.length === 2) {
    return (
      <div className="relative grid grid-cols-2 gap-0.5 p-1.5 bg-[var(--color-surface-base)]">
        {badge}
        {products.map((p) => (
          <Thumb key={p.id} product={p} className="aspect-square" />
        ))}
      </div>
    );
  }

  // 3 items — one featured left, two stacked right
  if (products.length === 3) {
    return (
      <div className="relative grid grid-cols-2 grid-rows-2 gap-0.5 p-1.5 bg-[var(--color-surface-base)] h-[168px]">
        {badge}
        <Thumb product={products[0]} className="row-span-2 h-full" />
        <Thumb product={products[1]} className="h-full" />
        <Thumb product={products[2]} className="h-full" />
      </div>
    );
  }

  // 4 items — classic 2×2
  if (products.length === 4) {
    return (
      <div className="relative grid grid-cols-2 gap-0.5 p-1.5 bg-[var(--color-surface-base)]">
        {badge}
        {products.map((p) => (
          <Thumb key={p.id} product={p} className="aspect-square" />
        ))}
      </div>
    );
  }

  // 5 items — 3 on top, 2 centered below
  if (products.length === 5) {
    return (
      <div className="relative p-1.5 bg-[var(--color-surface-base)] space-y-0.5">
        {badge}
        <div className="grid grid-cols-3 gap-0.5">
          {products.slice(0, 3).map((p) => (
            <Thumb key={p.id} product={p} className="aspect-square" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-0.5 w-[66%] mx-auto">
          {products.slice(3, 5).map((p) => (
            <Thumb key={p.id} product={p} className="aspect-square" />
          ))}
        </div>
      </div>
    );
  }

  // 6 items — 3×2 grid
  if (products.length === 6) {
    return (
      <div className="relative grid grid-cols-3 grid-rows-2 gap-0.5 p-1.5 bg-[var(--color-surface-base)]">
        {badge}
        {products.map((p) => (
          <Thumb key={p.id} product={p} className="aspect-square" />
        ))}
      </div>
    );
  }

  // 7+ items — horizontal filmstrip (scrollable)
  return (
    <div className="relative p-1.5 bg-[var(--color-surface-base)]">
      {badge}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <Thumb key={p.id} product={p} className="shrink-0 h-[72px] w-[72px]" />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--color-surface-base)] to-transparent" />
    </div>
  );
}

/** Shown in the chat feed while the agent "scans the catalog" for personalized picks. */
export function WearableScanningIndicator({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <div className="h-8 w-8 rounded-full gradient-wearable flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Search className="h-4 w-4 text-white" />
      </div>
      <div className="w-72 rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Scanning catalog…</span>
          <Loader2 className="h-3.5 w-3.5 text-[var(--color-brand)] animate-spin" />
        </div>
        <div className="space-y-1.5">
          {SCAN_STAGES.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i < stageIndex ? (
                <CheckCircle2 className="h-3 w-3 text-[var(--color-success)] shrink-0" />
              ) : i === stageIndex ? (
                <Loader2 className="h-3 w-3 animate-spin text-[var(--color-brand)] shrink-0" />
              ) : (
                <span className="h-3 w-3 rounded-full border border-[var(--color-border)] shrink-0" />
              )}
              <span
                className={cn(
                  "text-[11px]",
                  i <= stageIndex ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TryOnResultCardProps {
  items: Array<{ productId: string; name: string; selectedVariant?: string }>;
  recommendedSizes: Record<string, string>;
  fitNotes: string;
}

function TryOnResultCard({ items, recommendedSizes, fitNotes }: TryOnResultCardProps) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] overflow-hidden shadow-sm w-72 mt-1">
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Recommended Sizes</span>
        </div>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.productId} className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-secondary)] truncate pr-2">{item.name}</span>
              <span className="text-xs font-bold text-[var(--color-brand)] shrink-0 bg-[var(--color-brand-light)] px-2 py-0.5 rounded-full">
                {recommendedSizes[item.productId] ?? item.selectedVariant ?? "M"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-success-light)] px-2.5 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[var(--color-success)] leading-relaxed">{fitNotes}</p>
        </div>
      </div>
    </div>
  );
}

export function WearableTypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <div className="h-8 w-8 rounded-full gradient-wearable flex items-center justify-center shrink-0">
        <Shirt className="h-4 w-4 text-white" />
      </div>
      <div className="bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-pulse-dot"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
