import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  ImageOff,
  Layers,
  Loader2,
  MessageSquare,
  RotateCcw,
  Ruler,
  Search,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  User,
  X,
} from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/modules/commerce/types";
import type { BundleSuggestion, Product } from "@/modules/commerce/types";
import { formatPrice } from "@/modules/commerce/constants";
import type { ChatAttachment, TypingStage } from "../hooks/use-try-on-agent";
import { useWearableBranding } from "../branding-context";
import { useWidgetLocale, widgetStrings } from "../widget-strings";
import { cn } from "@/lib/utils/cn";
import { PagedCarousel } from "./paged-carousel";

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
   *  the actual products the agents surfaced earlier in the conversation. */
  knownProducts?: Record<string, Product>;
  /** The product attached with "Ask about this item", if any. */
  attachedItemId?: string | null;
  /** The look attached with "Ask about this bundle", if any. */
  attachedLookId?: string | null;
  /** Disables the chat CTAs while a turn is streaming. */
  isBusy?: boolean;
  /** True whenever the composer is disabled — quick options and Retry send a message too. */
  sendDisabled?: boolean;
  /** Set only on the bubble of a failed reply. */
  onRetry?: () => void;
  /** Mobile: suggestions span the whole chat width and swipe one full card at a time. */
  paged?: boolean;
  onWearItem?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  /** A second press on an item that is already in the cart takes it back out. */
  onRemoveFromCart?: (product: Product) => void;
  onAskAboutItem?: (product: Product) => void;
  onCompleteLook?: (product: Product) => void;
  onQuickOption?: (label: string) => void;
  onRenderBundle?: (productIds: string[]) => void;
  onAddBundleToCart?: (productIds: string[]) => void;
  onRemoveBundleFromCart?: (productIds: string[]) => void;
  onAskAboutLook?: (bundle: BundleSuggestion) => void;
}

function formatTime(iso: string, locale: string | undefined): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
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
  attachedItemId = null,
  attachedLookId = null,
  isBusy = false,
  sendDisabled = false,
  onRetry,
  paged = false,
  onWearItem,
  onAddToCart,
  onRemoveFromCart,
  onAskAboutItem,
  onCompleteLook,
  onQuickOption,
  onRenderBundle,
  onAddBundleToCart,
  onRemoveBundleFromCart,
  onAskAboutLook,
}: WearableChatMessageProps) {
  const renderCard = (product: Product) => (
    <InlineSuggestionCard
      key={product.id}
      product={product}
      paged={paged}
      onRemoveFromCart={onRemoveFromCart ? () => onRemoveFromCart(product) : undefined}
      isWorn={outfitItemIds.includes(product.id)}
      inCart={cartItemIds.includes(product.id)}
      isPending={pendingCartItemIds.includes(product.id)}
      isGenerating={isGenerating}
      isAttached={attachedItemId === product.id}
      isBusy={isBusy}
      onWear={() => onWearItem?.(product)}
      onAddToCart={() => onAddToCart?.(product)}
      onAsk={onAskAboutItem ? () => onAskAboutItem(product) : undefined}
      onCompleteLook={onCompleteLook ? () => onCompleteLook(product) : undefined}
    />
  );
  const isUser = message.role === "user";
  const branding = useWearableBranding();
  const locale = useWidgetLocale();
  const strings = widgetStrings(locale);
  // Old sessions may still contain a revoked `blob:` URL from the former onboarding uploader.
  // Remember only the URL that failed: a newly uploaded URL automatically gets another chance.
  const [failedUserPhotoUrl, setFailedUserPhotoUrl] = React.useState<string | null>(null);
  const showUserPhoto = Boolean(userPhotoUrl && userPhotoUrl !== failedUserPhotoUrl);

  const hasProducts = Boolean(inlineProducts && inlineProducts.length > 0);
  const hasBundles = Boolean(message.bundles && message.bundles.length > 0);

  // The product and bundle suggestions. On the desktop panel they sit in the reply's own column;
  // on mobile (`paged`) they leave it and span the chat's full width, one whole card at a time —
  // the column beside the avatar is far too narrow to show a card in full.
  const suggestions = (hasProducts || hasBundles) && (
    // `data-message-cards` lets the mobile chat scroll to the cards themselves, not just the reply.
    <div data-message-cards className="w-full">
      {hasProducts && inlineProducts && (
        <div className={cn("space-y-1.5 w-full", paged ? "mt-2" : "mt-1")}>
          {message.retrievalNote && (
            <p className="text-[10px] text-[var(--color-text-muted)] px-0.5">{message.retrievalNote}</p>
          )}
          <InlineProductScroller paged={paged}>{inlineProducts.map(renderCard)}</InlineProductScroller>
        </div>
      )}

      {hasBundles && message.bundles && (
        <BundleCarousel
          bundles={message.bundles}
          paged={paged}
          cartItemIds={cartItemIds}
          pendingCartItemIds={pendingCartItemIds}
          isGenerating={isGenerating}
          isBusy={isBusy}
          knownProducts={knownProducts}
          onRenderBundle={onRenderBundle}
          onAddBundleToCart={onAddBundleToCart}
          onRemoveBundleFromCart={onRemoveBundleFromCart}
          onAskAboutLook={onAskAboutLook}
          attachedLookId={attachedLookId}
        />
      )}
    </div>
  );

  return (
    <div className="animate-fade-in">
    <div className={cn("flex items-start gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
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
      ) : showUserPhoto ? (
        <div className="relative h-8 w-8 rounded-full overflow-hidden shrink-0 mt-0.5 border-2 border-[var(--color-violet-from)]/40">
          <Image
            src={userPhotoUrl!}
            alt="You"
            fill
            className="object-cover"
            unoptimized
            onError={() => setFailedUserPhotoUrl(userPhotoUrl!)}
          />
        </div>
      ) : (
        <div className="h-8 w-8 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-[var(--color-violet-from)]" />
        </div>
      )}

      <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start", "max-w-[88%]")}>
        <div
          dir="auto"
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
          {formatTime(message.timestamp, locale)}
        </span>

        {onRetry && (
          <button
            type="button"
            dir="auto"
            onClick={onRetry}
            disabled={sendDisabled}
            className="flex items-center gap-1.5 text-xs font-semibold rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3 w-3" /> {strings.retry}
          </button>
        )}

        {message.quickOptions && message.quickOptions.length > 0 && isLast && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {message.quickOptions.map((option) => (
              <button
                key={option}
                type="button"
                dir="auto"
                onClick={() => onQuickOption?.(option)}
                disabled={sendDisabled}
                className="text-xs rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {!paged && suggestions}

        {message.tryOnImage && (
          <TryOnResultCard
            items={message.tryOnImage.items}
            recommendedSizes={message.tryOnImage.recommendedSizes}
            fitNotes={message.tryOnImage.fitNotes}
          />
        )}
      </div>
    </div>
    {paged && suggestions}
    </div>
  );
}

/** Horizontally scrollable product row with arrow controls on the edges. On mobile (`paged`) it
 *  is a carousel that shows one whole card at a time instead. */
function InlineProductScroller({ children, paged = false }: { children: React.ReactNode; paged?: boolean }) {
  if (paged) {
    return (
      <PagedCarousel label="products" arrowTop="26%">
        {React.Children.toArray(children)}
      </PagedCarousel>
    );
  }
  return <FreeProductScroller>{children}</FreeProductScroller>;
}

/** Horizontally scrollable product row with arrow controls on the edges. */
function FreeProductScroller({ children }: { children: React.ReactNode }) {
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
  /** True when this product is attached above the composer. */
  isAttached?: boolean;
  isBusy?: boolean;
  /** Mobile: the card fills the carousel page instead of being a fixed-width tile. */
  paged?: boolean;
  onWear: () => void;
  onAddToCart: () => void;
  /** Pressing the cart button again while the product is in the cart takes it back out. */
  onRemoveFromCart?: () => void;
  onAsk?: () => void;
  onCompleteLook?: () => void;
}

function ProductPreviewImage({
  product,
  className,
  bare = false,
}: {
  product: Product;
  className: string;
  /** Thumbnails: no product name on the placeholder, which would not fit. */
  bare?: boolean;
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
        {!bare && <span className="line-clamp-2 text-[9px] text-[var(--color-text-muted)]">{product.name}</span>}
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

export function InlineSuggestionCard({
  product,
  isWorn,
  inCart,
  isPending = false,
  isGenerating,
  isAttached = false,
  isBusy = false,
  paged = false,
  onWear,
  onAddToCart,
  onRemoveFromCart,
  onAsk,
  onCompleteLook,
}: InlineSuggestionCardProps) {
  // Disable while anything is rendering (avoid overlapping requests) or once it's already on the avatar.
  const wearDisabled = !product.inStock || isGenerating || isWorn;
  const wearBusy = isGenerating && isWorn;
  // In the cart, the same button takes the product back out — unless nothing can remove it.
  const cartRemovable = inCart && Boolean(onRemoveFromCart);
  const cartDisabled = isPending || (!inCart && !product.inStock) || (inCart && !cartRemovable);
  return (
    // The shell leaves a strip above the card for the Ask tab, which straddles the card's top
    // edge on the right — clear of the photo, and of everything the shopper reads on the card.
    <div className={cn("relative flex flex-col", onAsk && "pt-4", paged ? "w-full h-full" : "shrink-0 w-56")}>
    {onAsk && <CardAskButton onAsk={onAsk} isAttached={isAttached} disabled={isBusy} subject="item" />}
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-[var(--radius-xl)] border bg-[var(--color-surface-card)] overflow-hidden transition-all duration-200",
        isAttached
          ? "border-[var(--color-brand)] ring-2 ring-[var(--color-brand)]/40"
          : isWorn
            ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]/30"
            : "border-[var(--color-border)] hover:border-[var(--color-brand)]/50"
      )}
    >
      <div className={cn("relative shrink-0 bg-white", paged ? "h-44" : "h-40")}>
        <ProductPreviewImage product={product} className="object-contain p-2" />
        {wearBusy && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-[var(--color-brand)] animate-spin" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {product.fitSizes?.length ? (
            <span
              title="The store's size chart fits your measurements to this size"
              className="rounded-full bg-[var(--color-brand)] px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            >
              Your size · {product.fitSizes[0]}
            </span>
          ) : null}
          {!product.inStock && (
            <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">Out of stock</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-[13px] font-medium leading-snug text-[var(--color-text-primary)] line-clamp-2">
            {product.name}
          </p>
          <span className="shrink-0 text-[13px] font-bold leading-snug text-[var(--color-text-primary)]">
            {formatPrice(product.price, product.currency)}
          </span>
        </div>
        {product.reviewCount > 0 && (
          <div className="-mt-1.5 flex items-center gap-1">
            <Star className="h-3 w-3 text-amber-400 fill-current" />
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {product.rating} ({product.reviewCount})
            </span>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onWear}
            disabled={wearDisabled}
            title={isWorn ? "On your avatar" : "Wear it — render on avatar"}
            className={cn(
              "h-9 min-w-0 flex-1 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-semibold transition-all",
              isWorn
                ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] cursor-default"
                : "gradient-brand text-white shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {wearBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> Rendering
              </>
            ) : isWorn ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> On avatar
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 shrink-0" /> Wear it
              </>
            )}
          </button>
          <CardCartButton
            inCart={inCart}
            isPending={isPending}
            disabled={cartDisabled}
            removable={cartRemovable}
            inStock={product.inStock}
            label="Add"
            fill
            onClick={inCart ? onRemoveFromCart : onAddToCart}
          />
        </div>
      </div>

      {onCompleteLook && (
        <button
          type="button"
          onClick={onCompleteLook}
          disabled={isBusy || !product.inStock}
          title="Build a full outfit around this item"
          // A tinted footer in the brand colour: clearly a feature of its own, but a step
          // below the two solid buttons above it.
          className="group flex shrink-0 items-center gap-2 border-t border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] px-3 py-2.5 text-xs font-semibold text-[var(--color-brand)] hover:bg-[var(--color-brand)]/15 disabled:opacity-40 disabled:hover:bg-[var(--color-brand-light)] transition-colors"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-start">Complete the look</span>
          <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </button>
      )}
    </div>
    </div>
  );
}

/** The round "ask about this" button in the top corner of a card's picture. */
function CardAskButton({
  onAsk,
  isAttached,
  disabled,
  subject,
}: {
  onAsk: () => void;
  isAttached: boolean;
  disabled: boolean;
  subject: "item" | "look";
}) {
  return (
    <button
      type="button"
      onClick={onAsk}
      disabled={isAttached || disabled}
      aria-pressed={isAttached}
      aria-label={isAttached ? "Asking — type your question below" : `Ask about this ${subject}`}
      title={isAttached ? "Attached — type your question below" : `Ask about this ${subject}`}
      className={cn(
        // A labelled tab on the card's top edge, so "Ask" reads as a question to the assistant
        // about this card rather than an unlabelled bubble; it turns solid while this card is
        // the one attached. The card's own border runs behind it.
        "absolute right-3 top-0 z-10 flex h-8 items-center gap-1.5 rounded-full border pl-2.5 pr-3 text-[11px] font-semibold shadow-[var(--shadow-sm)] transition-all active:scale-95",
        isAttached
          ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white cursor-default"
          : "border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text-primary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-50"
      )}
    >
      <MessageSquare className={cn("h-3.5 w-3.5", !isAttached && "text-[var(--color-brand)]")} />
      {isAttached ? "Asking" : "Ask"}
    </button>
  );
}

/** Square cart toggle beside the primary action: a bag to add, a check once it is in the cart
 *  (an × on hover when it can be taken back out). */
function CardCartButton({
  inCart,
  isPending,
  disabled,
  removable,
  inStock,
  onClick,
  label,
  fill = false,
}: {
  inCart: boolean;
  isPending: boolean;
  disabled: boolean;
  removable: boolean;
  inStock: boolean;
  onClick?: () => void;
  /** Shown beside the icon when there is room for words ("Add", "Add all"). */
  label?: string;
  /** Share the row with the primary action instead of sizing to its content. */
  fill?: boolean;
}) {
  const title = isPending
    ? inCart
      ? "Removing from your cart…"
      : "Adding to your cart…"
    : inCart
      ? removable
        ? "In your cart — tap to remove"
        : "In your cart"
      : inStock
        ? "Add to cart"
        : "Out of stock";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={inCart}
      aria-label={title}
      title={title}
      className={cn(
        "group h-9 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border text-xs font-semibold transition-all",
        fill ? "min-w-0 flex-1 px-2" : cn("shrink-0", label ? "px-3.5" : "w-9"),
        inCart
          ? cn(
              "border-transparent bg-[var(--color-brand-light)] text-[var(--color-brand)]",
              removable
                ? "hover:bg-[var(--color-error,#ef4444)]/10 hover:text-[var(--color-error,#ef4444)]"
                : "cursor-default"
            )
          : inStock
            ? "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            : "border-[var(--color-border)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
      )}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : inCart ? (
        <>
          <Check className={cn("h-4 w-4", removable && "group-hover:hidden")} />
          {removable && <X className="hidden h-4 w-4 group-hover:block" />}
        </>
      ) : (
        <ShoppingBag className="h-4 w-4" />
      )}
      {label && (
        <span className="truncate">
          {inCart ? (
            removable ? (
              <>
                <span className="group-hover:hidden">Added</span>
                <span className="hidden group-hover:inline">Remove</span>
              </>
            ) : (
              "Added"
            )
          ) : (
            label
          )}
        </span>
      )}
    </button>
  );
}

/** The most piece thumbnails a look shows in the composer before "+N". */
const ATTACHED_LOOK_THUMBS = 4;

interface ComposerAttachmentProps {
  attachment: ChatAttachment;
  knownProducts: Record<string, Product>;
  onClear: () => void;
  /** The mobile sheet is dark-on-dark; the desktop panel is the themed card surface. */
  tone?: "light" | "dark";
}

/**
 * What the shopper attached, shown as a card inside the composer — the product's own thumbnail
 * for "Ask about this item" and "Complete the look", the look's piece thumbnails for "Ask about
 * this bundle". While it shows, every message goes to that mode's agent; the × hands the chat
 * back to the shopping assistant.
 */
export function ComposerAttachment({ attachment, knownProducts, onClear, tone = "light" }: ComposerAttachmentProps) {
  const dark = tone === "dark";
  const isLook = attachment.kind === "look";
  const pieces: Product[] = isLook
    ? attachment.look.items.map((item) => knownProducts[item.productId]).filter((piece): piece is Product => Boolean(piece))
    : [attachment.product];
  const pieceCount = isLook ? attachment.look.items.length : 1;
  const shown = pieces.slice(0, isLook ? ATTACHED_LOOK_THUMBS : 1);
  const extra = Math.max(0, pieceCount - shown.length);
  const currency = pieces[0]?.currency;

  const label =
    attachment.kind === "item" ? "Asking about this item" : attachment.kind === "anchor" ? "Completing the look" : "Asking about this look";
  const Icon = attachment.kind === "item" ? MessageSquare : Layers;
  const title = isLook
    ? pieces.length > 0
      ? pieces.map((piece) => piece.name).join(" + ")
      : `${pieceCount} pieces`
    : attachment.product.name;
  const detail = isLook
    ? `${pieceCount} pieces${currency ? ` · ${formatPrice(attachment.look.total, currency)}` : ""}`
    : formatPrice(attachment.product.price, attachment.product.currency);

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-[var(--radius-lg)] border p-2 pr-2.5",
        dark
          ? "border-white/10 bg-white/[0.06] text-white"
          : "border-[var(--color-brand)]/30 bg-[var(--color-brand-light)]/40 text-[var(--color-text-primary)]"
      )}
    >
      <div className="flex shrink-0 items-center">
        {shown.length === 0 ? (
          <div className="flex h-14 w-11 items-center justify-center rounded-md bg-[var(--color-surface-base)]">
            <Layers className="h-4 w-4 text-[var(--color-text-muted)]" />
          </div>
        ) : (
          shown.map((piece, index) => (
            <div
              key={piece.id}
              className={cn(
                "relative h-14 w-11 shrink-0 overflow-hidden rounded-md border",
                dark ? "border-[#1d1527]" : "border-[var(--color-surface-card)]",
                index > 0 && "-ml-3"
              )}
              style={{ zIndex: shown.length - index }}
            >
              <ProductPreviewImage product={piece} className="object-cover" bare />
            </div>
          ))
        )}
        {extra > 0 && (
          <div
            className={cn(
              "-ml-3 flex h-14 w-11 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
              dark
                ? "border-[#1d1527] bg-white/10 text-white/80"
                : "border-[var(--color-surface-card)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)]"
            )}
          >
            +{extra}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">
          <Icon className="h-3 w-3 shrink-0" />
          {label}
        </p>
        <p className="truncate text-xs font-semibold">{title}</p>
        <p className={cn("truncate text-[11px]", dark ? "text-white/60" : "text-[var(--color-text-muted)]")}>{detail}</p>
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label="Remove attachment"
        title="Back to searching the store"
        className={cn(
          "h-6 w-6 shrink-0 self-start rounded-full flex items-center justify-center transition-colors",
          dark
            ? "text-white/60 hover:text-white hover:bg-white/10"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)]"
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface BundleCarouselProps {
  bundles: BundleSuggestion[];
  cartItemIds: string[];
  pendingCartItemIds?: string[];
  isGenerating: boolean;
  isBusy?: boolean;
  knownProducts: Record<string, Product>;
  onRenderBundle?: (productIds: string[]) => void;
  onAddBundleToCart?: (productIds: string[]) => void;
  onRemoveBundleFromCart?: (productIds: string[]) => void;
  onAskAboutLook?: (bundle: BundleSuggestion) => void;
  /** Which look is attached, so the row shows which one the bar above the composer means. */
  attachedLookId?: string | null;
  /** Mobile: one whole bundle per swipe, with arrows and dots, instead of a free-scrolling row. */
  paged?: boolean;
}

/** Shows the stylist's options. On the desktop panel they sit side by side in a free-scrolling
 *  row; on mobile (`paged`) each look is a full page of its own, so swiping always lands on a
 *  whole bundle in the middle of the chat. */
function BundleCarousel({
  bundles,
  cartItemIds,
  pendingCartItemIds = [],
  isGenerating,
  isBusy = false,
  knownProducts,
  onRenderBundle,
  onAddBundleToCart,
  onRemoveBundleFromCart,
  onAskAboutLook,
  attachedLookId,
  paged = false,
}: BundleCarouselProps) {
  // A look whose pieces are all unknown renders nothing, and must not leave a blank page behind.
  const shown = bundles.filter((bundle) => bundle.productIds.some((id) => knownProducts[id]));
  const card = (bundle: BundleSuggestion, index: number) => (
    <BundleSuggestionCard
      bundle={bundle}
      index={index}
      cartItemIds={cartItemIds}
      pendingCartItemIds={pendingCartItemIds}
      isGenerating={isGenerating}
      knownProducts={knownProducts}
      isAttached={bundle.id === attachedLookId}
      isBusy={isBusy}
      onRender={() => onRenderBundle?.(bundle.productIds)}
      onAddAllToCart={() => onAddBundleToCart?.(bundle.productIds)}
      onRemoveAllFromCart={onRemoveBundleFromCart ? () => onRemoveBundleFromCart(bundle.productIds) : undefined}
      onAsk={onAskAboutLook && bundle.slots ? () => onAskAboutLook(bundle) : undefined}
    />
  );

  if (shown.length === 0) return null;

  if (paged) {
    return (
      <div className="mt-2 w-full">
        <PagedCarousel label="looks" arrowTop="24%">
          {shown.map((bundle, index) => (
            <div key={bundle.id} className="h-full">
              {card(bundle, index)}
            </div>
          ))}
        </PagedCarousel>
      </div>
    );
  }

  return (
    <div className="flex w-full gap-3 mt-1 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:thin]">
      {shown.map((bundle, index) => (
        <div key={bundle.id} className="shrink-0 w-[min(320px,82vw)] snap-start">
          {card(bundle, index)}
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
  isAttached?: boolean;
  isBusy?: boolean;
  onRender: () => void;
  onAddAllToCart: () => void;
  /** Pressing the button again once every piece is in the cart takes the whole look back out. */
  onRemoveAllFromCart?: () => void;
  onAsk?: () => void;
}

function BundleSuggestionCard({
  bundle,
  index,
  cartItemIds,
  pendingCartItemIds = [],
  isGenerating,
  knownProducts,
  isAttached = false,
  isBusy = false,
  onRender,
  onAddAllToCart,
  onRemoveAllFromCart,
  onAsk,
}: BundleSuggestionCardProps) {
  // The per-piece list is folded away until asked for: with it open a look is taller than the
  // chat on a phone, and the buttons would sit below the fold.
  const [detailsOpen, setDetailsOpen] = React.useState(false);
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
    <div className={cn("relative flex h-full w-full flex-col", onAsk && "pt-4")}>
    {onAsk && <CardAskButton onAsk={onAsk} isAttached={isAttached} disabled={isBusy} subject="look" />}
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col rounded-[var(--radius-xl)] border bg-[var(--color-surface-card)] overflow-hidden transition-colors",
        isAttached
          ? "border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]"
          : "border-[var(--color-border)]"
      )}
    >
      <div className="shrink-0">
        <BundleStrip products={products} bundleIndex={index} />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold leading-snug text-[var(--color-text-primary)] line-clamp-1">
              {bundle.label}
            </p>
            <span className="shrink-0 text-sm font-bold leading-snug text-[var(--color-text-primary)]">
              {formatPrice(total, currency)}
            </span>
          </div>
          {bundle.rationale && (
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-muted)] line-clamp-2">{bundle.rationale}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="-my-0.5 flex items-center justify-between gap-2 rounded-[var(--radius-md)] px-1 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand)] transition-colors"
        >
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            {products.length} pieces
            {products.some((p) => p.fitSizes?.length) && (
              <span className="rounded-full bg-[var(--color-brand-light)] px-1.5 py-px text-[10px] font-semibold text-[var(--color-brand)]">
                Your sizes
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-medium text-[var(--color-brand)]">
            {detailsOpen ? "Hide details" : "Details"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")} />
          </span>
        </button>

        {detailsOpen && (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          {products.map((product) => {
            const category = itemsByProductId.get(product.id)?.category;
            const inCart = cartItemIds.includes(product.id);
            return (
              <li key={product.id} className="flex items-center gap-2.5 px-2 py-1.5">
                <Thumb product={product} className="h-10 w-10 shrink-0 border border-[var(--color-border)]" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium leading-snug text-[var(--color-text-primary)]">{product.name}</p>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] text-[var(--color-text-muted)]">
                    {product.fitSizes?.length ? (
                      <span className="shrink-0 rounded-full bg-[var(--color-brand-light)] px-1.5 py-px font-semibold text-[var(--color-brand)]">
                        Size {product.fitSizes[0]}
                      </span>
                    ) : null}
                    {category && <span className="min-w-0 truncate capitalize">{category}</span>}
                    {inCart && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[var(--color-brand)]">
                        <Check className="h-2.5 w-2.5" /> In cart
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-text-primary)]">
                  {formatPrice(product.price, product.currency)}
                </span>
              </li>
            );
          })}
        </ul>
        )}

        <div className="mt-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onRender}
            disabled={isGenerating}
            className="h-9 min-w-0 flex-1 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full gradient-brand text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Wear full look
              </>
            )}
          </button>
          <CardCartButton
            inCart={allInCart}
            isPending={anyPending}
            disabled={anyPending || (allInCart && !onRemoveAllFromCart)}
            removable={Boolean(onRemoveAllFromCart)}
            inStock
            label="Add all"
            onClick={allInCart ? onRemoveAllFromCart : onAddAllToCart}
          />
        </div>
      </div>
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

/** The pieces of a look side by side in one short row: every piece is visible at a glance, and
 *  the card stays a fixed, small height whatever the number of pieces (a 2×2 collage was as tall
 *  as the card is wide, which pushed the buttons off the screen on a phone). A look of five or
 *  more pieces scrolls sideways instead of squeezing them. */
function BundleStrip({ products, bundleIndex }: { products: Product[]; bundleIndex: number }) {
  const many = products.length > 4;
  return (
    <div className="relative bg-[var(--color-surface-base)] p-1.5">
      <span className="absolute left-2.5 top-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
        {bundleIndex + 1}
      </span>
      <div
        className={cn(
          "flex gap-1.5",
          many && "overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {products.map((p) => (
          <Thumb key={p.id} product={p} className={cn("h-28", many ? "w-[84px] shrink-0" : "min-w-0 flex-1")} />
        ))}
      </div>
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
  const strings = widgetStrings(useWidgetLocale());
  const lastStageIndex = strings.scanStages.length - 1;
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <div className="h-8 w-8 rounded-full gradient-violet flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Search className="h-4 w-4 text-white" />
      </div>
      <div className="w-72 max-w-full rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span dir="auto" className="text-xs font-semibold text-[var(--color-text-primary)]">{strings.scanTitle}</span>
          <Loader2 className="h-3.5 w-3.5 text-[var(--color-brand)] animate-spin" />
        </div>
        <div className="space-y-1.5">
          {strings.scanStages.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i < stageIndex ? (
                <CheckCircle2 className="h-3 w-3 text-[var(--color-success)] shrink-0" />
              ) : i === stageIndex ? (
                <Loader2 className="h-3 w-3 animate-spin text-[var(--color-brand)] shrink-0" />
              ) : (
                <span className="h-3 w-3 rounded-full border border-[var(--color-border)] shrink-0" />
              )}
              <span
                dir="auto"
                className={cn(
                  "text-[11px]",
                  i <= stageIndex ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"
                )}
              >
                {i === lastStageIndex && typeof resultCount === "number" ? strings.scanResultCount(resultCount) : label}
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
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-card)] overflow-hidden shadow-sm w-72 max-w-full min-w-0 mt-1">
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3.5 w-3.5 text-[var(--color-brand)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Recommended Sizes</span>
        </div>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.productId} className="flex min-w-0 items-center justify-between">
              <span className="min-w-0 truncate pr-2 text-xs text-[var(--color-text-secondary)]">{item.name}</span>
              <span className="text-xs font-bold text-[var(--color-brand)] shrink-0 bg-[var(--color-brand-light)] px-2 py-0.5 rounded-full">
                {recommendedSizes[item.productId] ?? item.selectedVariant ?? "M"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-success-light)] px-2.5 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)] mt-0.5 shrink-0" />
          <p className="min-w-0 break-words text-[11px] text-[var(--color-success)] leading-relaxed">{fitNotes}</p>
        </div>
      </div>
    </div>
  );
}

/** Only the stages that are worth naming. The opening stretch before any tool has run is short
 *  enough that three dots say everything, and labelling it would be guessing at what the model
 *  is about to decide. */
const TYPING_STAGE_LABELS: Partial<Record<TypingStage, "searching" | "composing">> = {
  searching: "searching",
  composing: "composing",
};

export function WearableTypingIndicator({ stage = "thinking" }: { stage?: TypingStage }) {
  const strings = widgetStrings(useWidgetLocale());
  const labelKey = TYPING_STAGE_LABELS[stage];
  const label = labelKey ? strings[labelKey] : null;

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
        {label && <span dir="auto" className="text-[11px] text-[var(--color-text-muted)]">{label}</span>}
      </div>
    </div>
  );
}
