"use client";

import * as React from "react";
import Image from "next/image";
import {
  Check,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  ShoppingBag,
  X,
} from "lucide-react";
import type { GeneratedTryOn } from "../hooks/use-try-on-agent";
import type { TryOnProfile } from "../types";
import type { Product } from "@/modules/commerce/types";
import { formatPrice } from "@/modules/commerce/constants";
import { DEFAULT_MANNEQUIN_IMAGE, STUDIO_BACKDROPS } from "../constants";
import {
  formatChestCm,
  formatHeightCm,
  formatShoeSizeEu,
  formatWaistCm,
  formatWeightKg,
  getHotspotPosition,
  getProductSizeLabel,
  resolveGarmentSlot,
  getProfileFitSummary,
  recommendSize,
} from "../utils/fit-metrics";
import { EditModelStatsModal } from "./edit-model-stats-modal";
import { AvatarWearScanOverlay } from "./avatar-wear-scan-overlay";
import { GarmentHotspot, type ActiveLookItem } from "./garment-hotspot";
import { SizeGuideModal } from "./size-guide-modal";
import { cn } from "@/lib/utils/cn";
import { useWearableTheme } from "../theme-context";
import { useWearableBranding } from "../branding-context";
import { MOBILE_SURFACE, NO_IOS_ZOOM_TEXT, SAFE_BOTTOM, SHEET_H } from "../mobile-surface";
import type { EmbedRuntimeConfig } from "../hooks/use-try-on-agent";
import { useRealtimeTryOn } from "../hooks/use-realtime-tryon";
import { RealtimeTryOnOverlay } from "./realtime-tryon-overlay";
import { LiveProductPicker } from "./live-product-picker";
import { LiveProductStack } from "./live-product-stack";

interface AvatarMannequinPanelProps {
  profile: TryOnProfile;
  outfitItems: Product[];
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  currentTryOn: GeneratedTryOn | null;
  isGenerating: boolean;
  isRegeneratingAvatar: boolean;
  cartItems: Product[];
  /** IDs currently mid-flight to the real cart — shown as a spinner so a slow (but working)
   *  sync never looks like a silent failure. */
  pendingCartItemIds?: string[];
  onPrev: () => void;
  onNext: () => void;
  onSelectImage: (index: number) => void;
  onRemoveFromOutfit: (id: string) => void;
  onSaveMeasurements: (patch: Partial<TryOnProfile>) => void;
  onAddToCart: (product: Product) => void;
  /** Bulk "Add all to cart" — bypasses the variant picker and keeps today's
   *  auto-pick-first-in-stock-variant behavior. Falls back to `onAddToCart` when omitted. */
  onBulkAddToCart?: (product: Product) => void;
  onChangeBackdrop: (url: string) => void;
  onUploadBackdrop: (file: File) => void;
  isUploadingBackdrop: boolean;
  backdropUploadError: string | null;
  mobile?: boolean;
  /** Mobile only — asks the parent to collapse the chat sheet. A full-cover panel (Fit
   *  Analysis, Edit Stats, Size Guide) is unusable in the sliver left above an expanded
   *  sheet, so opening one reclaims the frame first. */
  onRequestSpace?: () => void;
  embed?: EmbedRuntimeConfig;
  workspaceId?: string;
}

/** Toolbar action that applies to the static 2D photo. Zoom was deliberately removed:
 *  shoppers scroll the host page over this large image, so any image zoom/pan interaction
 *  competes with the page's primary gesture and feels like the widget hijacked scrolling. */
const TOOLBAR_ACTIONS = [
  { id: "fullscreen", icon: Maximize2, label: "Fullscreen" },
] as const;

/** Right edge of the info column, so other absolute elements (nav chevrons etc.) can
 *  clear it. The glass cards themselves use `right-4 w-[240px]`. */
const INFO_COLUMN_SPACE = 260;

/** Panel color that frames the studio photo (blends the photo edge + vignettes) — follows
 *  the active wearable theme so the frame matches the chat panel next to it. */
const PANEL_BG_BY_THEME = { dark: "#0d0b14", light: "#f2f0f5" } as const;

/** Floating controls over the photo: glass that reads on both a dark and a light studio. */
const PANEL_TONE = {
  dark: {
    rail: "border-white/[0.12] bg-black/50 shadow-[0_8px_28px_rgba(0,0,0,0.5)]",
    railIdle: "text-white/50 hover:text-white/90 hover:bg-white/[0.08]",
    railActive: "text-white bg-white/[0.14] ring-1 ring-[var(--color-brand)]",
    divider: "bg-white/[0.1]",
    popover: "border-white/[0.1] bg-[rgba(12,10,18,0.96)] shadow-[0_16px_48px_rgba(0,0,0,0.6)]",
    label: "text-white/35",
    tile: "border-white/15 hover:border-white/40",
    soft: "bg-white/[0.08] text-white/80",
    secondary: "border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.06]",
    note: "text-white/25",
    nav: "bg-black/45 border-white/15 text-white hover:bg-black/60",
  },
  light: {
    rail: "border-black/[0.08] bg-white/90 shadow-[0_8px_28px_rgba(23,18,29,0.12)]",
    railIdle: "text-[#17121d]/55 hover:text-[#17121d] hover:bg-black/[0.05]",
    railActive: "text-[#17121d] bg-black/[0.06] ring-1 ring-[var(--color-brand)]",
    divider: "bg-black/[0.08]",
    popover: "border-black/[0.08] bg-[rgba(255,255,255,0.97)] shadow-[0_16px_48px_rgba(23,18,29,0.16)]",
    label: "text-[#17121d]/45",
    tile: "border-black/10 hover:border-black/30",
    soft: "bg-black/[0.04] text-[#17121d]/80",
    secondary: "border-black/[0.1] text-[#17121d]/70 hover:text-[#17121d] hover:bg-black/[0.04]",
    note: "text-[#17121d]/40",
    nav: "bg-white/90 border-black/10 text-[#17121d] hover:bg-white shadow-[0_4px_16px_rgba(23,18,29,0.12)]",
  },
} as const;

/** Matches the reference card style: dark near-opaque background, very subtle border,
 *  enough backdrop blur so the card reads as a premium glass surface. */
const INFO_CARD_TONE = {
  dark: {
    "--ic-fg": "#ffffff",
    "--ic-strong": "rgba(255,255,255,0.85)",
    "--ic-muted": "rgba(255,255,255,0.45)",
    "--ic-faint": "rgba(255,255,255,0.35)",
    "--ic-line": "rgba(255,255,255,0.08)",
  },
  light: {
    "--ic-fg": "#17121d",
    "--ic-strong": "rgba(23,18,29,0.85)",
    "--ic-muted": "rgba(23,18,29,0.55)",
    "--ic-faint": "rgba(23,18,29,0.42)",
    "--ic-line": "rgba(23,18,29,0.09)",
  },
} as const;

function InfoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const theme = useWearableTheme();
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border backdrop-blur-2xl",
        theme === "light"
          ? "border-black/[0.06] bg-[rgba(255,255,255,0.88)] shadow-[0_12px_40px_rgba(23,18,29,0.12)]"
          : "border-white/[0.07] bg-[rgba(13,11,20,0.82)] shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
        className
      )}
      style={INFO_CARD_TONE[theme] as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function AvatarMannequinPanel({
  profile,
  outfitItems,
  tryOnImages,
  currentImageIndex,
  currentTryOn,
  isGenerating,
  isRegeneratingAvatar,
  cartItems,
  pendingCartItemIds = [],
  onPrev,
  onNext,
  onSelectImage,
  onRemoveFromOutfit,
  onSaveMeasurements,
  onAddToCart,
  onBulkAddToCart,
  mobile = false,
  onRequestSpace,
  embed,
  workspaceId,
}: AvatarMannequinPanelProps) {
  const handleBulkAddToCart = onBulkAddToCart ?? onAddToCart;
  const theme = useWearableTheme();
  const { liveTryOnEnabled, studioBackdropId } = useWearableBranding();
  const studioBackdropUrl =
    STUDIO_BACKDROPS.find((bg) => bg.id === studioBackdropId)?.url ?? STUDIO_BACKDROPS[0].url;
  const panelBg = PANEL_BG_BY_THEME[theme];
  const tone = PANEL_TONE[theme];
  const [activeSwatchIndex, setActiveSwatchIndex] = React.useState(0);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [justAddedAll, setJustAddedAll] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"photo" | "live">("photo");
  const realtime = useRealtimeTryOn({ embed, workspaceId });

  const fullscreenCloseRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!isFullscreen) return;
    // Single-control dialog — the close button is the only focusable element, so trapping
    // focus just means grabbing it on open and pulling it back on every Tab press rather
    // than letting focus escape to whatever sits behind the overlay.
    fullscreenCloseRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
      else if (e.key === "Tab") {
        e.preventDefault();
        fullscreenCloseRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  function handleToolbarAction(id: string) {
    if (id === "fullscreen") setIsFullscreen(true);
    // "3d" is disabled — coming soon, intentionally not wired up.
  }

  const fit = getProfileFitSummary(profile);
  const defaultSize = recommendSize(profile);
  const total = tryOnImages.length;
  const hasPrev = currentImageIndex > 0;
  const hasNext = currentImageIndex < total - 1;
  const hasGeneratedLooks = total > 0;

  const displayImage = currentTryOn?.imageUrl || profile.avatarUrl || DEFAULT_MANNEQUIN_IMAGE;
  const [imgSrc, setImgSrc] = React.useState(displayImage);

  React.useEffect(() => {
    setImgSrc(displayImage);
  }, [displayImage]);

  function handleImageError() {
    if (imgSrc !== DEFAULT_MANNEQUIN_IMAGE) {
      setImgSrc(DEFAULT_MANNEQUIN_IMAGE);
    }
  }

  // Real Persona Agent renders are subject-only cutouts on a transparent background —
  // they need their paired fixed backdrop plate layered underneath. Mock/default/custom
  // images are already complete baked photos, so they render as a single flat layer.
  const hasFixedBackdrop = Boolean(profile.backdropUrl) && imgSrc !== DEFAULT_MANNEQUIN_IMAGE;

  const cartItemIds = React.useMemo(() => new Set(cartItems.map((p) => p.id)), [cartItems]);
  const pendingCartIds = React.useMemo(() => new Set(pendingCartItemIds), [pendingCartItemIds]);

  /** Garments on the avatar — only real try-on results or the live outfit being built. */
  const activeItems: ActiveLookItem[] = React.useMemo(() => {
    const source: Product[] =
      currentTryOn && currentTryOn.outfitProducts.length > 0
        ? currentTryOn.outfitProducts
        : outfitItems;

    const categoryCounts: Partial<Record<string, number>> = {};

    return source.map((product) => {
      const category = resolveGarmentSlot(product);
      const staggerIndex = categoryCounts[category] ?? 0;
      categoryCounts[category] = staggerIndex + 1;
      // Shoes are sized in EU numbers from the real profile stat, not the XS–XL letter
      // size every other garment gets from BMI — showing "S" for a shoe made no sense.
      const fallbackSize = category === "shoes" ? formatShoeSizeEu(profile.shoeSizeEu) : defaultSize;
      return {
        product,
        size: currentTryOn?.recommendedSizes[product.id] ?? fallbackSize,
        position: getHotspotPosition(product, staggerIndex),
      };
    });
  }, [currentTryOn, outfitItems, defaultSize, profile.shoeSizeEu]);
  const liveProducts = React.useMemo(() => {
    const byId = new Map<string, Product>();
    for (const version of tryOnImages) {
      for (const product of version.outfitProducts) byId.set(product.id, product);
    }
    for (const product of outfitItems) byId.set(product.id, product);
    return Array.from(byId.values());
  }, [tryOnImages, outfitItems]);

  // Auto-preview the first catalog item as soon as the live camera connects, so the
  // shopper sees a result immediately instead of having to pick a product themselves first.
  React.useEffect(() => {
    if (realtime.status !== "live" || realtime.activeProductId || liveProducts.length === 0) return;
    void realtime.switchProduct(liveProducts[0]);
  }, [realtime.status, realtime.activeProductId, liveProducts, realtime.switchProduct]);

  function changeViewMode(next: "photo" | "live") {
    if (next === "live" && !liveTryOnEnabled) return;
    if (next === "photo" && viewMode === "live") realtime.stop("photo-mode");
    setViewMode(next);
  }

  const stopRealtime = realtime.stop;
  React.useEffect(() => {
    if (liveTryOnEnabled || viewMode !== "live") return;
    stopRealtime("live-disabled");
    setViewMode("photo");
  }, [liveTryOnEnabled, viewMode, stopRealtime]);

  const lookLabel = hasGeneratedLooks
    ? `Style ${currentImageIndex + 1} of ${total}`
    : outfitItems.length > 0
      ? "Your Outfit"
      : "Your Avatar";

  const outfitSwatches = hasGeneratedLooks
    ? tryOnImages.map((tryOn, i) => ({
        id: tryOn.id,
        // A version swatch represents the generated look, not one garment's catalog photo.
        thumb: tryOn.imageUrl,
        active: i === currentImageIndex,
        onClick: () => onSelectImage(i),
      }))
    : outfitItems.map((p, i) => ({
        id: p.id,
        thumb: p.imageUrl,
        active: i === activeSwatchIndex,
        onClick: () => setActiveSwatchIndex(i),
      }));

  const anyPendingInCart = activeItems.some((item) => pendingCartIds.has(item.product.id));
  const cartTotal = activeItems.reduce((sum, item) => sum + item.product.price, 0);
  const currency = activeItems[0]?.product.currency ?? "USD";

  const sizeRows = activeItems.map((item) => ({
    id: item.product.id,
    label: getProductSizeLabel(item.product),
    size: item.size,
  }));

  const bulkAddingRef = React.useRef(false);

  function handleAddAllToCart() {
    bulkAddingRef.current = true;
    activeItems.forEach((item) => handleBulkAddToCart(item.product));
  }

  // Confirms "Added to Cart" against the actual cart state once every item this click
  // started has finished settling — not a blind timer, so a real add failure (surfaced via
  // agent.cartSyncError elsewhere) never gets papered over with a false success message.
  React.useEffect(() => {
    if (!bulkAddingRef.current || anyPendingInCart) return;
    bulkAddingRef.current = false;
    const allAdded = activeItems.length > 0 && activeItems.every((item) => cartItemIds.has(item.product.id));
    if (!allAdded) return;
    setJustAddedAll(true);
    const timer = setTimeout(() => setJustAddedAll(false), 2000);
    return () => clearTimeout(timer);
  }, [anyPendingInCart, cartItemIds, activeItems]);

  // ─── Mobile avatar strip ─────────────────────────────────────────────────
  if (mobile) {
    return (
      <MobileAvatarStrip
        imgSrc={imgSrc}
        backdropUrl={hasFixedBackdrop ? studioBackdropUrl : null}
        onImageError={handleImageError}
        fit={fit}
        profile={profile}
        sizeRows={sizeRows}
        cartTotal={cartTotal}
        currency={currency}
        justAddedAll={justAddedAll}
        activeItems={activeItems}
        cartItemIds={cartItemIds}
        pendingCartIds={pendingCartIds}
        isGenerating={isGenerating}
        isRegeneratingAvatar={isRegeneratingAvatar}
        hasGeneratedLooks={hasGeneratedLooks}
        tryOnImages={tryOnImages}
        outfitItems={outfitItems}
        currentImageIndex={currentImageIndex}
        activeSwatchIndex={activeSwatchIndex}
        setActiveSwatchIndex={setActiveSwatchIndex}
        onSelectImage={onSelectImage}
        onRemoveFromOutfit={onRemoveFromOutfit}
        onAddToCart={onAddToCart}
        handleAddAllToCart={handleAddAllToCart}
        lookLabel={lookLabel}
        onSaveMeasurements={onSaveMeasurements}
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        liveTryOnEnabled={liveTryOnEnabled}
        realtime={realtime}
        liveProducts={liveProducts}
        onRequestSpace={onRequestSpace}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative w-full h-full min-h-0 rounded-[var(--radius-2xl)] overflow-hidden border transition-colors duration-700",
        theme === "light"
          ? "border-black/[0.06] shadow-[0_32px_80px_rgba(23,18,29,0.14)]"
          : "border-white/[0.06] shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
      )}
      style={{ background: panelBg }}
    >
      {/* ── Layer 0: Studio photo — fills full height, natural width, left-anchored.
          Draggable to pan once zoomed in (pointer handlers no-op at 1x zoom). ── */}
      {viewMode === "live" ? (
        <div className="absolute inset-y-0 left-0 right-[300px] overflow-hidden">
          <RealtimeTryOnOverlay
            status={realtime.status}
            stream={realtime.remoteStream}
            remainingSeconds={realtime.remainingSeconds}
            activeProductId={realtime.activeProductId}
            errorMessage={realtime.errorMessage}
            hasProducts={liveProducts.length > 0}
            facingMode={realtime.facingMode}
            isRecording={realtime.isRecording}
            recordingSeconds={realtime.recordingSeconds}
            onStart={realtime.start}
            onStop={() => realtime.stop("stop-button")}
            onFlipCamera={realtime.flipCamera}
            onStartRecording={realtime.startRecording}
            onStopRecording={realtime.stopRecording}
          />
        </div>
      ) : hasFixedBackdrop ? (
        <div
          className="absolute inset-y-0 left-0 h-full select-none"
          style={{ aspectRatio: "3 / 4" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={studioBackdropUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover select-none" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt="Standing avatar in studio"
            onError={handleImageError}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover select-none"
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt="Standing avatar in studio"
          onError={handleImageError}
          draggable={false}
          className="absolute inset-y-0 left-0 h-full w-auto select-none"
        />
      )}

      {/* ── Layer 1: Right-side fade — blends photo edge into the dark panel bg ── */}
      {viewMode === "photo" && <div className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background: `linear-gradient(to right, transparent 52%, ${panelBg}CC 64%, ${panelBg} 72%)`,
        }}
      />}

      {/* ── Layer 2: Top vignette — keeps Save/Share legible ── */}
      <div className="absolute inset-x-0 top-0 h-24 z-[3] pointer-events-none"
        style={{ background: theme === "light" ? "linear-gradient(to bottom, rgba(242,240,245,0.55), transparent)" : "linear-gradient(to bottom, rgba(0,0,0,0.42), transparent)" }}
      />

      {/* ── Hotspots — mapped to exact photo aspect ratio. pointer-events-none on the
          wrapper so empty space lets clicks/drags reach the photo underneath (e.g. panning);
          each hotspot dot opts back in with its own pointer-events-auto. ── */}
      {viewMode === "photo" && !isGenerating && !isRegeneratingAvatar && (
        <div className="absolute inset-y-0 left-0 z-[18] pointer-events-none" style={{ aspectRatio: "1024 / 1536" }}>
          {activeItems.map((item) => (
            <GarmentHotspot
              key={item.product.id}
              item={item}
              inCart={cartItemIds.has(item.product.id)}
              isPending={pendingCartIds.has(item.product.id)}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}

      {/* ── Left toolbar ── */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-[20] flex flex-col items-center gap-3">
        <div
          className={cn("relative flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-[var(--radius-xl)] border backdrop-blur-2xl", tone.rail)}
        >
          {viewMode === "photo" && (
            <>
              {TOOLBAR_ACTIONS.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.label}
                  aria-label={mode.label}
                  onClick={() => handleToolbarAction(mode.id)}
                  className={cn("relative h-9 w-9 rounded-[var(--radius-md)] flex items-center justify-center transition-all active:scale-90", tone.railIdle)}
                >
                  <mode.icon className="h-[17px] w-[17px]" strokeWidth={1.6} />
                </button>
              ))}
              {liveTryOnEnabled && <div className={cn("h-px w-5", tone.divider)} />}
            </>
          )}

          {liveTryOnEnabled && (
            <button
              type="button"
              title={viewMode === "live" ? "Back to photo" : "Live camera"}
              aria-label={viewMode === "live" ? "Back to photo" : "Live camera"}
              onClick={() => changeViewMode(viewMode === "live" ? "photo" : "live")}
              className={cn("h-9 w-9 rounded-[var(--radius-md)] flex items-center justify-center transition-all active:scale-90", tone.railIdle)}
            >
              {viewMode === "live" ? (
                <ImageIcon className="h-[17px] w-[17px]" strokeWidth={1.6} />
              ) : (
                <Camera className="h-[17px] w-[17px]" strokeWidth={1.6} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Right info column ── */}
      {viewMode === "live" ? (
        <aside className="absolute inset-y-0 right-0 z-[20] w-[300px] border-l border-[var(--color-border)] bg-[var(--color-surface-base)] px-4 pt-5">
          <LiveProductPicker
            products={liveProducts}
            activeProductId={realtime.activeProductId}
            cartItemIds={cartItemIds}
            pendingCartIds={pendingCartIds}
            onSelect={realtime.switchProduct}
            onAddToCart={onAddToCart}
          />
        </aside>
      ) : <div className="absolute top-5 right-5 z-[20] w-[252px] flex flex-col gap-3">

        {/* Fit Analysis card */}
        <InfoCard className="p-4">
          <p className="text-[13px] font-semibold text-[var(--ic-fg)] mb-3">Fit Analysis</p>

          {/* Circular gauge — centered */}
          <div className="flex flex-col items-center gap-1 mb-4">
            <p className="text-[10px] text-[var(--ic-faint)] font-medium">Fit Score</p>
            <div className="relative h-[88px] w-[88px] my-1">
              <svg className="h-[88px] w-[88px] -rotate-90" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="none" stroke="var(--ic-line)" strokeWidth="6" />
                <circle
                  cx="44" cy="44" r="36" fill="none"
                  stroke="url(#fitGaugeGrad)" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(fit.fitScore / 100) * 226} 226`}
                />
                <defs>
                  <linearGradient id="fitGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--color-brand-from)" />
                    <stop offset="100%" stopColor="var(--color-brand-to)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold text-[var(--ic-fg)] leading-none">{fit.fitScore}%</span>
              </div>
            </div>
            <p className="text-[12px] font-semibold text-[var(--ic-strong)]">{fit.fitLabel}</p>
          </div>

          {/* Metric bars */}
          <div className="space-y-2.5">
            {fit.metrics.map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--ic-muted)]">{m.label}</span>
                  <span className="text-[var(--ic-strong)] font-semibold">{m.value}%</span>
                </div>
                <div className="h-[3px] rounded-full bg-[var(--ic-line)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${m.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </InfoCard>

        {/* Model Stats + Size Recommendation card */}
        <InfoCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-semibold text-[var(--ic-fg)]">Model Stats</p>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-brand)] hover:opacity-80 transition-all"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <div className="space-y-2">
            {[
              { label: "Height", value: formatHeightCm(profile.heightCm) },
              { label: "Weight", value: formatWeightKg(profile.weightKg) },
              { label: "Chest", value: formatChestCm(profile.chestCm) },
              { label: "Waist", value: formatWaistCm(profile.waistCm) },
              { label: "Shoe Size", value: formatShoeSizeEu(profile.shoeSizeEu) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--ic-muted)]">{label}</span>
                <span className="text-[12px] text-[var(--ic-fg)] font-semibold">{value}</span>
              </div>
            ))}
          </div>

          <div className="my-3.5 h-px bg-[var(--ic-line)]" />

          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ic-faint)] mb-3">Size Recommendation</p>
          {sizeRows.length > 0 ? (
            <>
              <div className="space-y-2">
                {sizeRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between">
                    <span className="text-[12px] text-[var(--ic-muted)]">{row.label}</span>
                    <span className="text-[12px] text-[var(--ic-fg)] font-semibold">{row.size}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsSizeGuideOpen(true)}
                className="mt-3 text-[11px] font-medium text-[var(--color-brand)] hover:opacity-80 transition-all"
              >
                View Size Guide
              </button>
            </>
          ) : (
            <p className="text-[12px] text-[var(--ic-faint)]">Add items to see size recommendations.</p>
          )}
        </InfoCard>

        {/* Add All to Cart */}
        {activeItems.length > 0 && (
        <button
          type="button"
          onClick={handleAddAllToCart}
          disabled={anyPendingInCart}
          className={cn(
            "w-full h-[54px] rounded-[var(--radius-lg)] font-semibold text-[13px] flex items-center justify-between px-5 transition-all",
            "text-white",
            "shadow-[var(--shadow-glow)] hover:brightness-110 active:scale-[0.98] disabled:cursor-wait"
          )}
          style={{ background: "linear-gradient(to right, var(--color-brand-from), var(--color-brand-to))" }}
        >
          <span className="flex items-center gap-2">
            {anyPendingInCart ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : justAddedAll ? (
              <Check className="h-4 w-4" />
            ) : (
              <ShoppingBag className="h-4 w-4" />
            )}
            {anyPendingInCart ? "Adding to Cart…" : justAddedAll ? "Added to Cart" : "Add All to Cart"}
          </span>
          <span className="text-[15px] font-bold">{formatPrice(cartTotal, currency)}</span>
        </button>
        )}
      </div>}

      {/* Wear scan — top-to-bottom garment fitting animation */}
      {viewMode === "photo" && isGenerating && !isRegeneratingAvatar && (
        <AvatarWearScanOverlay
          itemLabel={
            outfitItems.length > 0
              ? outfitItems.map((p) => p.name).join(" · ")
              : activeItems.map((i) => i.product.name).join(" · ")
          }
        />
      )}

      {/* Avatar regeneration overlay */}
      {viewMode === "photo" && isRegeneratingAvatar && (
        <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-sm font-medium text-white">Regenerating your avatar…</p>
          <p className="text-xs text-white/50 max-w-[200px] text-center">
            Applying your updated measurements
          </p>
        </div>
      )}

      {/* Preview navigation */}
      {viewMode === "photo" && total > 1 && !isGenerating && (
        <>
          {hasPrev && (
            <button type="button" onClick={onPrev}
              className={cn("absolute left-5 top-[22%] z-[20] h-9 w-9 rounded-full border flex items-center justify-center backdrop-blur-md transition-colors", tone.nav)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {hasNext && (
            <button type="button" onClick={onNext}
              className={cn("absolute right-[270px] top-[22%] z-[20] h-9 w-9 rounded-full border flex items-center justify-center backdrop-blur-md transition-colors", tone.nav)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      {/* Swatches — bottom-left (only real try-ons / outfit items) */}
      {viewMode === "photo" && outfitSwatches.length > 0 && (
      <div className="absolute bottom-5 left-5 z-[20] flex items-center gap-2">
        {outfitSwatches.map((sw) => (
          <button
            key={sw.id}
            type="button"
            onClick={sw.onClick}
            className={cn(
              "relative h-[52px] w-[52px] rounded-[var(--radius-md)] overflow-hidden border-2 transition-all duration-200",
              sw.active
                ? "border-[var(--color-brand)] shadow-[var(--shadow-glow)]"
                : "border-white/25 opacity-70 hover:opacity-100 hover:border-white/50"
            )}
          >
            <Image src={sw.thumb} alt="" fill className="object-cover" unoptimized />
          </button>
        ))}
      </div>
      )}

      {isEditOpen && (
        <EditModelStatsModal
          profile={profile}
          onClose={() => setIsEditOpen(false)}
          onSave={onSaveMeasurements}
        />
      )}

      {isSizeGuideOpen && (
        <SizeGuideModal
          lookLabel={lookLabel}
          items={activeItems}
          cartItemIds={cartItemIds}
          onAddToCart={onAddToCart}
          onClose={() => setIsSizeGuideOpen(false)}
        />
      )}

      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen avatar preview"
          className={cn(
            "fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-md p-6",
            theme === "light" ? "bg-[rgba(242,240,245,0.94)]" : "bg-black/90"
          )}
          onClick={() => setIsFullscreen(false)}
        >
          {hasFixedBackdrop ? (
            <div
              className="relative h-[85vh] max-h-full max-w-[90vw] aspect-[3/4] rounded-[var(--radius-2xl)] shadow-[0_24px_80px_rgba(0,0,0,0.35)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={studioBackdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt="Standing avatar in studio — fullscreen" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt="Standing avatar in studio — fullscreen"
              className="max-h-full max-w-full object-contain rounded-[var(--radius-2xl)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <button
            ref={fullscreenCloseRef}
            type="button"
            onClick={() => setIsFullscreen(false)}
            title="Close (Esc)"
            aria-label="Close fullscreen preview"
            className={cn("absolute top-5 right-5 h-11 w-11 rounded-full border flex items-center justify-center backdrop-blur-md transition-colors", tone.nav)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mobile-only compact avatar strip ───────────────────────────────────────
interface MobileAvatarStripProps {
  imgSrc: string;
  backdropUrl: string | null;
  onImageError: () => void;
  fit: ReturnType<typeof getProfileFitSummary>;
  profile: TryOnProfile;
  sizeRows: { id: string; label: string; size: string }[];
  cartTotal: number;
  currency: string;
  justAddedAll: boolean;
  activeItems: ActiveLookItem[];
  cartItemIds: Set<string>;
  pendingCartIds: Set<string>;
  isGenerating: boolean;
  isRegeneratingAvatar: boolean;
  hasGeneratedLooks: boolean;
  tryOnImages: GeneratedTryOn[];
  outfitItems: Product[];
  currentImageIndex: number;
  activeSwatchIndex: number;
  setActiveSwatchIndex: (i: number) => void;
  onSelectImage: (i: number) => void;
  onRemoveFromOutfit: (id: string) => void;
  onAddToCart: (p: Product) => void;
  handleAddAllToCart: () => void;
  lookLabel: string;
  onSaveMeasurements: (patch: Partial<TryOnProfile>) => void;
  viewMode: "photo" | "live";
  onViewModeChange: (mode: "photo" | "live") => void;
  liveTryOnEnabled: boolean;
  realtime: ReturnType<typeof useRealtimeTryOn>;
  liveProducts: Product[];
  onRequestSpace?: () => void;
}

/** What sub-panel is open over the avatar on mobile. */
type MobilePanel = "details" | "edit" | "size-guide" | null;

function MobileAvatarStrip({
  imgSrc,
  backdropUrl,
  onImageError,
  fit,
  profile,
  sizeRows,
  cartTotal,
  currency,
  justAddedAll,
  activeItems,
  cartItemIds,
  pendingCartIds,
  isGenerating,
  isRegeneratingAvatar,
  hasGeneratedLooks,
  tryOnImages,
  outfitItems,
  currentImageIndex,
  activeSwatchIndex,
  setActiveSwatchIndex,
  onSelectImage,
  onAddToCart,
  handleAddAllToCart,
  lookLabel,
  onSaveMeasurements,
  viewMode,
  onViewModeChange,
  liveTryOnEnabled,
  realtime,
  liveProducts,
  onRequestSpace,
}: MobileAvatarStripProps) {
  const theme = useWearableTheme();
  const panelBg = PANEL_BG_BY_THEME[theme];
  const styles = MOBILE_SURFACE[theme];
  const [panel, setPanel] = React.useState<MobilePanel>(null);
  const [editDraft, setEditDraft] = React.useState<TryOnProfile>(profile);

  /** Every path that opens a full-cover panel goes through here so the chat sheet is always
   *  collapsed out of the way first. */
  const openPanel = React.useCallback(
    (next: MobilePanel) => {
      setPanel(next);
      if (next) onRequestSpace?.();
    },
    [onRequestSpace]
  );

  // Keep draft in sync if profile changes externally
  React.useEffect(() => { setEditDraft(profile); }, [profile]);

  function handleSaveEdit() {
    // Measurements only — see EditModelStatsModal's desktop counterpart.
    onSaveMeasurements({
      heightCm: editDraft.heightCm,
      weightKg: editDraft.weightKg,
      chestCm: editDraft.chestCm,
      waistCm: editDraft.waistCm,
      hipsCm: editDraft.hipsCm,
      shoeSizeEu: editDraft.shoeSizeEu,
    });
    setPanel(null);
  }

  return (
    // `touch-action: pan-x pan-y` is the actual fix for the reported "zoom on scroll": with
    // no restriction, a two-finger touch anywhere on this full-screen photo is the browser's
    // own pinch-zoom gesture, and double-tapping it zooms the page too — neither goes through
    // React at all, so there is no state to turn off, only this CSS to stop the browser from
    // ever starting the gesture here in the first place. Panning/scrolling stays allowed.
    <div
      className="relative w-full h-full min-h-0 overflow-hidden [touch-action:pan-x_pan-y]"
      style={{ background: panelBg }}
    >
      {/* ── Avatar photo — object-cover fills the full frame; since the container is
           taller than a 2:3 image scaled to width, object-cover scales by height so
           the full body (head → feet) is always visible, sides trimmed slightly.
           Real Persona Agent renders are subject-only cutouts, so their paired fixed
           backdrop plate is layered underneath first. ── */}
      {viewMode === "live" ? (
        <div className="absolute inset-0 overflow-hidden">
          <RealtimeTryOnOverlay
            status={realtime.status}
            stream={realtime.remoteStream}
            remainingSeconds={realtime.remainingSeconds}
            activeProductId={realtime.activeProductId}
            errorMessage={realtime.errorMessage}
            hasProducts={liveProducts.length > 0}
            facingMode={realtime.facingMode}
            isRecording={realtime.isRecording}
            recordingSeconds={realtime.recordingSeconds}
            onStart={realtime.start}
            onStop={() => realtime.stop("stop-button")}
            onFlipCamera={realtime.flipCamera}
            onStartRecording={realtime.startRecording}
            onStopRecording={realtime.stopRecording}
          />
        </div>
      ) : (
        <>
          {backdropUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-center select-none" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt="Avatar"
            onError={onImageError}
            // Anchored above centre: when the host page gives the widget a frame shorter than
            // a 2:3 figure, `cover` has to crop vertically, and cropping the feet is far
            // better than cropping the head and the garment being tried on.
            className="absolute inset-0 w-full h-full object-cover select-none [object-position:50%_15%]"
          />
        </>
      )}

      {/* ── Hotspot pins — absolute inset-0 matches the cover-filled image exactly ── */}
      {viewMode === "photo" && !isGenerating && !isRegeneratingAvatar && (
        <div className="absolute inset-0 z-[18] pointer-events-none">
          {activeItems.map((item) => (
            <GarmentHotspot
              key={item.product.id}
              item={item}
              inCart={cartItemIds.has(item.product.id)}
              isPending={pendingCartIds.has(item.product.id)}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}

      {/* Top gradient — just enough to seat the badges, kept off the model's face */}
      <div className="absolute inset-x-0 top-0 h-16 z-[9] pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)" }}
      />
      {/* Bottom gradient — rides on top of the sheet so it always seats the controls below */}
      <div className="absolute inset-x-0 h-16 z-[9] pointer-events-none"
        style={{ bottom: SHEET_H, background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}
      />

      {/* ── Top row: Fit badge + Details button ── */}
      {viewMode === "photo" && <div className="absolute top-3 inset-x-3 z-[10] flex items-center justify-between gap-2">
        <div className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/[0.12] px-3">
          <div className="h-2 w-2 shrink-0 rounded-full" style={{
            background: fit.fitScore >= 90 ? "#22c55e" : fit.fitScore >= 75 ? "#f76d01" : "#ef4444",
          }} />
          <span className="text-[12px] font-bold text-white">{fit.fitScore}% Fit</span>
          <span className="ml-0.5 truncate text-[12px] text-white/55">{lookLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => openPanel(panel === "details" ? null : "details")}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-black/50 backdrop-blur-md border border-white/[0.12] px-3.5 text-[12px] font-medium text-white/80 hover:text-white transition-colors"
        >
          Details
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", panel === "details" && "rotate-180")} />
        </button>
      </div>}

      {liveTryOnEnabled && (
      <div
        className="absolute left-3 z-[16] flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-white/[0.12] bg-black/50 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
        style={{ top: `calc((100% - ${SHEET_H}) / 2)` }}
      >
        <button
          type="button"
          title={viewMode === "live" ? "Back to photo" : "Live camera"}
          aria-label={viewMode === "live" ? "Back to photo" : "Live camera"}
          onClick={() => onViewModeChange(viewMode === "live" ? "photo" : "live")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/[0.08] hover:text-white"
        >
          {viewMode === "live" ? <ImageIcon className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        </button>
      </div>
      )}

      {/* ── Bottom row: swatches + cart — only when there is a real outfit / try-on ── */}
      {viewMode === "photo" && (hasGeneratedLooks || activeItems.length > 0) && (
      <div
        className="absolute inset-x-0 z-[10] flex items-center justify-between px-3 gap-2"
        style={{ bottom: `calc(${SHEET_H} + 10px)` }}
      >
        {/* Style swatches */}
        <div className="flex items-center gap-2 overflow-x-auto flex-1 scrollbar-none overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          {(hasGeneratedLooks ? tryOnImages : activeItems.map((i) => i.product)).map((item, idx) => {
            const isGenerated = hasGeneratedLooks;
            const imgUrl = isGenerated
              ? (item as GeneratedTryOn).imageUrl
              : (item as Product).imageUrl;
            return (
              <button key={idx} type="button"
                aria-label={isGenerated ? `Look ${idx + 1}` : undefined}
                onClick={() => isGenerated ? onSelectImage(idx) : undefined}
                className={cn(
                  "h-11 w-11 shrink-0 rounded-[var(--radius-md)] overflow-hidden border-2 transition-all",
                  (isGenerated ? currentImageIndex : activeSwatchIndex) === idx
                    ? "border-[var(--color-brand)] scale-105" : "border-white/20 opacity-70"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
        {/* Cart pill */}
        {activeItems.length > 0 && (() => {
          const anyPending = activeItems.some((item) => pendingCartIds.has(item.product.id));
          return (
            <button type="button" onClick={handleAddAllToCart} disabled={anyPending}
              className={cn(
                "h-11 shrink-0 flex items-center gap-1.5 rounded-[var(--radius-md)] px-3.5 text-[12px] font-semibold transition-all",
                "text-white shadow-[var(--shadow-glow)]",
                "hover:brightness-110 active:scale-[0.97] disabled:opacity-70"
              )}
              style={{ background: "linear-gradient(to right, var(--color-brand-from), var(--color-brand-to))" }}
            >
              {anyPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : justAddedAll ? <Check className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
              {anyPending ? "Adding…" : justAddedAll ? "Added" : `Cart · ${formatPrice(cartTotal, currency)}`}
            </button>
          );
        })()}
      </div>
      )}

      {viewMode === "live" && realtime.status === "live" && liveProducts.length > 0 && (
        <LiveProductStack
          products={liveProducts}
          activeProductId={realtime.activeProductId}
          cartItemIds={cartItemIds}
          pendingCartIds={pendingCartIds}
          onSelect={realtime.switchProduct}
          onAddToCart={onAddToCart}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          INLINE PANELS — all use absolute inset-0 so they stay inside the
          phone frame (never escape via fixed positioning)
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Fit Analysis / Details ── */}
      {viewMode === "photo" && panel === "details" && (
        <MobileInlinePanel title="Fit Analysis" onClose={() => setPanel(null)}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full border-2 border-[var(--color-brand)] flex items-center justify-center shrink-0">
              <span className={cn("text-[15px] font-black", styles.panelValue)}>{fit.fitScore}%</span>
            </div>
            <div>
              <p className={cn("text-[13px] font-bold", styles.panelValue)}>{fit.fitLabel}</p>
            </div>
          </div>
          <div className="space-y-2.5 mb-4">
            {fit.metrics.map((m) => (
              <div key={m.label} className="flex items-center gap-2">
                <span className={cn("w-20 shrink-0 text-[12px]", styles.panelLabel)}>{m.label}</span>
                <div className={cn("flex-1 h-1.5 rounded-full", styles.panelTrack)}>
                  <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${m.value}%` }} />
                </div>
                <span className={cn("w-8 text-right text-[12px] font-semibold", styles.panelValue)}>{m.value}%</span>
              </div>
            ))}
          </div>
          <div className={cn("h-px mb-4", styles.panelDivider)} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5">
            {[
              { id: "height", label: "Height", value: formatHeightCm(profile.heightCm) },
              { id: "weight", label: "Weight", value: formatWeightKg(profile.weightKg) },
              { id: "chest", label: "Chest", value: formatChestCm(profile.chestCm) },
              { id: "waist", label: "Waist", value: formatWaistCm(profile.waistCm) },
              { id: "shoe", label: "Shoe Size", value: formatShoeSizeEu(profile.shoeSizeEu) },
              ...sizeRows.map((r) => ({ id: `size-${r.id}`, label: r.label, value: r.size })),
            ].map(({ id, label, value }) => (
              <div key={id} className="flex flex-col">
                <span className={cn("text-[11px] uppercase tracking-[0.12em]", styles.panelLabel)}>{label}</span>
                <span className={cn("mt-0.5 text-[13px] font-semibold", styles.panelValue)}>{value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPanel("edit")}
              className={cn("flex-1 h-11 rounded-[var(--radius-md)] border text-[13px] font-medium transition-colors", styles.panelSecondaryButton)}>
              Edit Stats
            </button>
            <button type="button" onClick={() => setPanel("size-guide")}
              className={cn("flex-1 h-11 rounded-[var(--radius-md)] border text-[13px] font-medium transition-colors", styles.panelSecondaryButton)}>
              Size Guide
            </button>
          </div>
        </MobileInlinePanel>
      )}

      {/* ── Edit Stats ── */}
      {viewMode === "photo" && panel === "edit" && (
        <MobileInlinePanel title="Edit Model Stats" onClose={() => setPanel("details")}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {([
              { key: "heightCm", label: "Height", unit: "cm" },
              { key: "weightKg", label: "Weight", unit: "kg" },
              { key: "chestCm",  label: "Chest",  unit: "cm" },
              { key: "waistCm",  label: "Waist",  unit: "cm" },
              { key: "shoeSizeEu", label: "Shoe Size", unit: "EU" },
            ] as const).map(({ key, label, unit }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className={cn("text-[11px] uppercase tracking-wide", styles.panelLabel)}>{label}</span>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editDraft[key] ?? ""}
                    onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value ? Number(e.target.value) : null }))}
                    className={cn(
                      "w-full h-11 pl-3 pr-9 rounded-[var(--radius-md)] border transition-colors focus:outline-none focus:border-[var(--color-brand)]",
                      NO_IOS_ZOOM_TEXT,
                      styles.panelField
                    )}
                  />
                  <span className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-[11px]", styles.panelMuted)}>{unit}</span>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPanel("details")}
              className={cn("flex-1 h-11 rounded-[var(--radius-md)] border text-[13px] transition-colors", styles.panelSecondaryButton)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className={cn(
                "flex-1 h-11 rounded-[var(--radius-md)] text-[13px] font-semibold text-white flex items-center justify-center gap-1.5",
                "gradient-violet bg-[var(--color-violet-from)]"
              )}
            >
              Save
            </button>
          </div>
        </MobileInlinePanel>
      )}

      {/* ── Size Guide ── */}
      {viewMode === "photo" && panel === "size-guide" && (
        <MobileInlinePanel title="Size Guide" onClose={() => setPanel("details")}>
          {activeItems.length === 0 ? (
            <p className={cn("py-8 text-center text-[13px]", styles.panelMuted)}>Add items to see size recommendations.</p>
          ) : (
            <div className="space-y-3">
              {activeItems.map((item) => {
                const inCart = cartItemIds.has(item.product.id);
                const isPending = pendingCartIds.has(item.product.id);
                const sizeVariants = item.product.variants.filter((v) => v.type === "size");
                const scale = sizeVariants.length > 0 ? sizeVariants.map((v) => v.label) : ["XS","S","M","L","XL"];
                return (
                  <div key={item.product.id} className={cn("rounded-xl border p-3", styles.panelCard)}>
                    <div className="flex items-start gap-2.5 mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.product.imageUrl} alt={item.product.name}
                        className="h-12 w-12 rounded-lg object-cover shrink-0 border border-white/10" />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-[13px] font-semibold leading-snug", styles.panelValue)}>{item.product.name}</p>
                        <p className={cn("mt-0.5 text-[12px]", styles.panelMuted)}>{formatPrice(item.product.price, item.product.currency)}</p>
                      </div>
                      <button type="button" onClick={() => onAddToCart(item.product)} disabled={inCart || isPending}
                        className={cn(
                          "h-10 shrink-0 px-3 rounded-[var(--radius-md)] text-[12px] font-semibold flex items-center gap-1 transition-all",
                          inCart
                            ? cn("border", styles.panelSecondaryButton)
                            : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-[var(--color-brand-contrast)]"
                        )}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : inCart ? <Check className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                        {isPending ? "Adding…" : inCart ? "Added" : "Add"}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {scale.map((size) => (
                        <div key={size} className={cn(
                          "flex-1 h-9 rounded-[var(--radius-md)] flex items-center justify-center text-[12px] font-bold",
                          size === item.size
                            ? "bg-[var(--color-brand)] text-[var(--color-brand-contrast)]"
                            : cn("border", styles.sizeChipIdle)
                        )}>{size}</div>
                      ))}
                    </div>
                    <p className={cn("mt-2 text-[11px]", styles.panelMuted)}>
                      Recommended: <span className="text-[var(--color-brand)] font-semibold">{item.size}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </MobileInlinePanel>
      )}

      {/* ── Wear scan / regenerating overlays ── */}
      {viewMode === "photo" && isGenerating && !isRegeneratingAvatar && (
        <AvatarWearScanOverlay
          mobile
          itemLabel={
            outfitItems.length > 0
              ? outfitItems.map((p) => p.name).join(" · ")
              : activeItems.map((i) => i.product.name).join(" · ")
          }
        />
      )}
      {viewMode === "photo" && isRegeneratingAvatar && (
        <div
          className="absolute inset-x-0 top-0 z-[19] flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm"
          style={{ bottom: SHEET_H }}
        >
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-sm font-medium text-white">Regenerating…</p>
        </div>
      )}
    </div>
  );
}

/** Reusable full-cover overlay panel for mobile. Stays inside the widget frame, and stops at
 *  the top of the chat sheet so its footer buttons are never covered by it. */
function MobileInlinePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const styles = MOBILE_SURFACE[useWearableTheme()];
  return (
    <div
      className={cn("absolute inset-x-0 top-0 z-[20] flex flex-col backdrop-blur-2xl", styles.panel)}
      style={{ bottom: SHEET_H }}
    >
      <div className={cn("flex items-center justify-between gap-2 border-b px-4 pt-4 pb-3 shrink-0", styles.panelBorder)}>
        <p className={cn("text-[14px] font-bold", styles.panelTitle)}>{title}</p>
        <button type="button" onClick={onClose} aria-label="Close"
          className={cn("h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-colors", styles.panelClose)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className={cn("flex-1 overflow-y-auto overscroll-contain scrollbar-none px-4 py-4", SAFE_BOTTOM)}>
        {children}
      </div>
    </div>
  );
}
