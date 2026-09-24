import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  MessageSquare,
  PlusCircle,
  Ruler,
  Search,
  Shirt,
  Sparkles,
  Star,
  User,
  X,
} from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/modules/commerce/types";
import type { BundleSuggestion, Product } from "@/modules/commerce/types";
import { formatPrice } from "@/modules/commerce/constants";
import { SCAN_STAGES } from "../mocks/responses";
import type { TypingStage } from "../hooks/use-try-on-agent";
import { useWearableBranding } from "../branding-context";
import { cn } from "@/lib/utils/cn";

interface WearableChatMessageProps {
  message: ChatMessageType;
  isLast?: boolean;
  userPhotoUrl?: string | null;
  inlineProducts?: Product[];
  outfitItemIds?: string[];
  cartItemIds?: string[];
  pendingCartItemIds?: string[];
  isGenerating?: boolean;
  /** The live product cache — bundles only carry product ids, so this resolves them to
   *  the actual products the agent found via search_catalog earlier in the conversation. */
  knownProducts?: Record<string, Product>;
  /** The product currently pinned as the conversation's subject, if any. */
  selectedAnchorId?: string | null;
  onWearItem?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onSelectItem?: (product: Product) => void;
  onQuickOption?: (label: string) => void;
  onRenderBundle?: (productIds: string[]) => void;
  onAddBundleToCart?: (productIds: string[]) => void;
  /** Pins every item of one outfit option as the conversation's subject — see
   *  `useTryOnAgent.discussBundle`. */
  onDiscussBundle?: (bundle: BundleSuggestion) => void;
  /** The outfit option currently pinned for discussion, if any. */
  discussedBundleId?: string | null;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
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
  pendingCartItemIds = [],
  isGenerating = false,
  knownProducts = {},
  selectedAnchorId = null,
  onWearItem,
  onAddToCart,
  onSelectItem,
  onQuickOption,
  onRenderBundle,
  onAddBundleToCart,
  onDiscussBundle,
  discussedBundleId = null,
}: WearableChatMessageProps) {
  const isUser = message.role === "user";
  const branding = useWearableBranding();

  return (
    <div className={cn("flex items-start gap-2.5 animate-fade-in", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser ? (
        branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover shrink-0 mt-0.5 shadow-sm"
          />
        ) : (
          <div className="h-8 w-8 rounded-full gradient-violet flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <Shirt className="h-4 w-4 text-white" />
          </div>
        )
      ) : userPhotoUrl ? (
        <div className="relative h-8 w-8 rounded-full overflow-hidden shrink-0 mt-0.5 border-2 border-[var(--color-violet-from)]/40">
          <Image src={userPhotoUrl} alt="You" fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="h-8 w-8 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-[var(--color-violet-from)]" />
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
          <div className="space-y-1.5 w-full mt-1">
            {message.retrievalNote && (
              <p className="text-[10px] text-[var(--color-text-muted)] px-0.5">{message.retrievalNote}</p>
            )}
            <InlineProductScroller>
              {inlineProducts.map((product) => (
                <InlineSuggestionCard
                  key={product.id}
                  product={product}
                  isWorn={outfitItemIds.includes(product.id)}
                  inCart={cartItemIds.includes(product.id)}
                  isPending={pendingCartItemIds.includes(product.id)}
                  isGenerating={isGenerating}
                  isSelected={selectedAnchorId === product.id}
                  onWear={() => onWearItem?.(product)}
                  onAddToCart={() => onAddToCart?.(product)}
                  onSelect={onSelectItem ? () => onSelectItem(product) : undefined}
                />
              ))}
            </InlineProductScroller>
          </div>
        )}

        {message.bundles && message.bundles.length > 0 && (
          <BundleCarousel
            bundles={message.bundles}
            cartItemIds={cartItemIds}
            pendingCartItemIds={pendingCartItemIds}
            isGenerating={isGenerating}
            knownProducts={knownProducts}
            onRenderBundle={onRenderBundle}
            onAddBundleToCart={onAddBundleToCart}
            onDiscussBundle={onDiscussBundle}
            discussedBundleId={discussedBundleId}
          />
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
  isPending?: boolean;
  isGenerating: boolean;
  /** True when this is the product pinned above the composer. */
  isSelected?: boolean;
  onWear: () => void;
  onAddToCart: () => void;
  onSelect?: () => void;
}

function ProductPreviewImage({
  product,
  className,
}: {
  product: Product;
  className: string;
}) {
  // Preserve the original direct-preview behavior first. The proxy is a resilience fallback,
  // not a ten-second gate in front of an image the browser may be able to load immediately.
  const sources = [product.imageUrl, product.previewImageUrl].filter(
    (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index
  );
  const [sourceIndex, setSourceIndex] = React.useState(0);
  const source = sources[sourceIndex];

  if (!source) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--color-surface-base)] px-2 text-center">
        <ImageOff className="h-5 w-5 text-[var(--color-text-muted)]" />
        <span className="line-clamp-2 text-[9px] text-[var(--color-text-muted)]">{product.name}</span>
      </div>
    );
  }

  return (
    <Image
      src={source}
      alt={product.name}
      fill
      className={className}
      unoptimized
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

export function InlineSuggestionCard({ product, isWorn, inCart, isPending = false, isGenerating, isSelected = false, onWear, onAddToCart, onSelect }: InlineSuggestionCardProps) {
  // Disable while anything is rendering (avoid overlapping requests) or once it's already on the avatar.
  const wearDisabled = !product.inStock || isGenerating || isWorn;
  const wearBusy = isGenerating && isWorn;

  return (
    <div
      className={cn(
        "shrink-0 w-48 rounded-[var(--radius-xl)] border bg-[var(--color-surface-card)] overflow-hidden transition-all duration-200",
        isSelected
          ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)]/40"
          : isWorn
            ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]/30"
            : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
      )}
    >
      <div className="relative h-36 bg-white">
        <ProductPreviewImage product={product} className="object-contain" />
        {isWorn && (
          <div className="absolute inset-0 bg-[var(--color-brand)]/10 flex items-center justify-center">
            <div className="h-7 w-7 rounded-full gradient-violet flex items-center justify-center shadow-lg">
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
          {product.reviewCount > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <Star className="h-2.5 w-2.5 text-amber-400 fill-current" />
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {product.rating} ({product.reviewCount})
              </span>
            </div>
          )}
        </div>
        <span className="block text-xs font-bold text-[var(--color-text-primary)]">
          {formatPrice(product.price, product.currency)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAddToCart}
            disabled={inCart || isPending || !product.inStock}
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
            {isPending ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Adding…
              </>
            ) : inCart ? (
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
                : "gradient-brand text-[var(--color-brand-contrast)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
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
        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            title={isSelected ? "Already the focus of the conversation" : "Talk about this one"}
            className={cn(
              "w-full flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-all",
              isSelected
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)]"
            )}
          >
            {isSelected ? (
              <>
                <CheckCircle2 className="h-2.5 w-2.5" /> Discussing
              </>
            ) : (
              <>
                <MessageSquare className="h-2.5 w-2.5" /> Discuss This
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface PinnedAnchorBarProps {
  product: Product;
  onClear: () => void;
  /** The mobile sheet is dark-on-dark; the desktop panel is the themed card surface. */
  tone?: "light" | "dark";
}

/**
 * Names the product the conversation is pinned to, directly above the composer.
 *
 * Without it a pinned anchor is invisible state: the shopper's next "does it come in navy" is
 * answered about an item they picked several turns ago, with nothing on screen saying which.
 */
export function PinnedAnchorBar({ product, onClear, tone = "light" }: PinnedAnchorBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs",
        tone === "dark" ? "text-white/70" : "text-[var(--color-text-secondary)]"
      )}
    >
      <MessageSquare className="h-3 w-3 shrink-0 text-[var(--color-brand)]" />
      <span className="shrink-0">Discussing:</span>
      <span
        className={cn(
          "truncate font-semibold",
          tone === "dark" ? "text-white" : "text-[var(--color-text-primary)]"
        )}
      >
        {product.name}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Stop discussing this item"
        className={cn(
          "ml-auto h-5 w-5 shrink-0 rounded-full flex items-center justify-center transition-colors",
          tone === "dark"
            ? "text-white/50 hover:text-white hover:bg-white/10"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)]"
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface PinnedBundleBarProps {
  bundle: BundleSuggestion;
  knownProducts: Record<string, Product>;
  onClear: () => void;
  tone?: "light" | "dark";
}

/**
 * The outfit equivalent of `PinnedAnchorBar`: names every piece the conversation is pinned to.
 *
 * Lists the items rather than saying "1 outfit" because the whole point of pinning an outfit is
 * that the next message can be about any single piece of it ("does the top run small?"), so which
 * pieces are in scope is the part the shopper needs to see.
 */
export function PinnedBundleBar({ bundle, knownProducts, onClear, tone = "light" }: PinnedBundleBarProps) {
  const names = bundle.items
    .map((item) => knownProducts[item.productId]?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs",
        tone === "dark" ? "text-white/70" : "text-[var(--color-text-secondary)]"
      )}
    >
      <MessageSquare className="h-3 w-3 shrink-0 text-[var(--color-brand)]" />
      <span className="shrink-0">Discussing outfit:</span>
      <span
        className={cn(
          "truncate font-semibold",
          tone === "dark" ? "text-white" : "text-[var(--color-text-primary)]"
        )}
      >
        {names.length > 0 ? names.join(" + ") : `${bundle.items.length} items`}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Stop discussing this outfit"
        className={cn(
          "ml-auto h-5 w-5 shrink-0 rounded-full flex items-center justify-center transition-colors",
          tone === "dark"
            ? "text-white/50 hover:text-white hover:bg-white/10"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)]"
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface BundleCarouselProps {
  bundles: BundleSuggestion[];
  cartItemIds: string[];
  pendingCartItemIds?: string[];
  isGenerating: boolean;
  knownProducts: Record<string, Product>;
  onRenderBundle?: (productIds: string[]) => void;
  onAddBundleToCart?: (productIds: string[]) => void;
  onDiscussBundle?: (bundle: BundleSuggestion) => void;
  /** Which option is currently pinned for discussion, so the row shows *which* of five was
   *  picked — the pinned bar above the composer only says that one of them was. */
  discussedBundleId?: string | null;
}

/** Shows every stylist option side by side. The row scrolls horizontally when five cards exceed
 *  the chat width, which keeps every option visible and directly comparable without hiding four
 *  of them behind Previous/Next arrows. */
function BundleCarousel({
  bundles,
  cartItemIds,
  pendingCartItemIds = [],
  isGenerating,
  knownProducts,
  onRenderBundle,
  onAddBundleToCart,
  onDiscussBundle,
  discussedBundleId,
}: BundleCarouselProps) {
  return (
    <div className="flex w-full gap-3 mt-1 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:thin]">
      {bundles.map((bundle, index) => (
        <div key={bundle.id} className="shrink-0 w-[min(320px,82vw)] snap-start">
          <BundleSuggestionCard
            bundle={bundle}
            index={index}
            cartItemIds={cartItemIds}
            pendingCartItemIds={pendingCartItemIds}
            isGenerating={isGenerating}
            knownProducts={knownProducts}
            isDiscussed={bundle.id === discussedBundleId}
            onRender={() => onRenderBundle?.(bundle.productIds)}
            onAddAllToCart={() => onAddBundleToCart?.(bundle.productIds)}
            onDiscuss={onDiscussBundle ? () => onDiscussBundle(bundle) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

interface BundleSuggestionCardProps {
  bundle: BundleSuggestion;
  index: number;
  cartItemIds: string[];
  pendingCartItemIds?: string[];
  isGenerating: boolean;
  knownProducts: Record<string, Product>;
  isDiscussed?: boolean;
  onRender: () => void;
  onAddAllToCart: () => void;
  onDiscuss?: () => void;
}

function BundleSuggestionCard({ bundle, index, cartItemIds, pendingCartItemIds = [], isGenerating, knownProducts, isDiscussed = false, onRender, onAddAllToCart, onDiscuss }: BundleSuggestionCardProps) {
  const products = bundle.productIds
    .map((id) => knownProducts[id])
    .filter((p): p is Product => !!p);

  if (products.length === 0) return null;

  const total = products.reduce((sum, p) => sum + p.price, 0);
  const currency = products[0]?.currency ?? "USD";
  const allInCart = products.every((p) => cartItemIds.includes(p.id));
  const anyPending = products.some((p) => pendingCartItemIds.includes(p.id));
  const itemsByProductId = new Map(bundle.items.map((item) => [item.productId, item]));

  return (
    <div
      className={cn(
        "w-full h-full rounded-[var(--radius-xl)] border bg-[var(--color-surface-card)] overflow-hidden transition-colors",
        isDiscussed
          ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]"
          : "border-[var(--color-border)]"
      )}
    >
      <BundleItemMosaic products={products} bundleIndex={index} />

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{bundle.label}</p>
          <span className="shrink-0 text-[10px] rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] px-2 py-0.5 font-semibold">
            {products.length} Items
          </span>
        </div>

        <ul className="space-y-1">
          {products.map((product) => {
            const category = itemsByProductId.get(product.id)?.category;
            return (
              <li key={product.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 min-w-0">
                  {category && (
                    <span className="shrink-0 rounded bg-[var(--color-surface-base)] text-[var(--color-text-muted)] px-1.5 py-0.5 uppercase tracking-wide text-[9px] font-semibold">
                      {category}
                    </span>
                  )}
                  <span className="truncate text-[var(--color-text-secondary)]">{product.name}</span>
                </span>
                <span className="shrink-0 font-medium text-[var(--color-text-primary)]">{formatPrice(product.price, product.currency)}</span>
              </li>
            );
          })}
        </ul>

        {bundle.rationale && (
          <p className="text-[11px] italic text-[var(--color-text-muted)] line-clamp-2">{bundle.rationale}</p>
        )}

        <p className="text-sm font-bold text-[var(--color-text-primary)]">{formatPrice(total, currency)}</p>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={onAddAllToCart}
            disabled={allInCart || anyPending}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-all",
              allInCart
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            )}
          >
            {anyPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Adding…
              </>
            ) : allInCart ? (
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
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full gradient-brand text-[var(--color-brand-contrast)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
        {onDiscuss && (
          <button
            type="button"
            onClick={onDiscuss}
            aria-pressed={isDiscussed}
            className={cn(
              "w-full flex items-center justify-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-all",
              isDiscussed
                ? "border-[var(--color-brand)] bg-[var(--color-brand-light)] text-[var(--color-brand)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            )}
          >
            <MessageSquare className="h-3 w-3" /> {isDiscussed ? "Discussing this bundle" : "Discuss this bundle"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Declared at module scope, not inside `BundleItemMosaic`. A component defined during render is
 * a different component type on every render, so React unmounts and remounts it — which threw
 * away `ProductPreviewImage`'s record of which source URL it had already tried and restarted the
 * fallback from the top each time the mosaic re-rendered.
 */
function Thumb({ product, className }: { product: Product; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[var(--radius-md)] bg-white", className)}>
      <ProductPreviewImage product={product} className="object-contain" />
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

/** Shown only while the server explicitly reports the complete-bundle pipeline is running. */
export function WearableScanningIndicator({
  stageIndex,
  resultCount,
}: {
  stageIndex: number;
  resultCount?: number | null;
}) {
  const lastStageIndex = SCAN_STAGES.length - 1;
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <div className="h-8 w-8 rounded-full gradient-violet flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Search className="h-4 w-4 text-white" />
      </div>
      <div className="w-72 rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Building your outfit…</span>
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
                {i === lastStageIndex && typeof resultCount === "number"
                  ? `Prepared ${resultCount} bundle item${resultCount === 1 ? "" : "s"}…`
                  : label}
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

/** Only the stages that are worth naming. The opening stretch before any tool has run is short
 *  enough that three dots say everything, and labelling it would be guessing at what the model
 *  is about to decide. */
const TYPING_STAGE_LABELS: Partial<Record<TypingStage, string>> = {
  // "Checking", not "searching": this tool can come back with a question instead of results, and
  // the label has to stay true in that case too.
  searching: "Checking the catalog…",
  composing: "Putting your reply together…",
};

export function WearableTypingIndicator({ stage = "thinking" }: { stage?: TypingStage }) {
  const label = TYPING_STAGE_LABELS[stage];

  return (
    <div className="flex items-end gap-2.5">
      <div className="h-8 w-8 rounded-full gradient-violet flex items-center justify-center shrink-0">
        <Shirt className="h-4 w-4 text-white" />
      </div>
      <div className="bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] px-4 py-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-pulse-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        {label && <span className="text-[11px] text-[var(--color-text-muted)]">{label}</span>}
      </div>
    </div>
  );
}
