"use client";

import * as React from "react";
import Image from "next/image";
import {
  Check,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  ImageUp,
  Loader2,
  Maximize2,
  Palette,
  Pencil,
  RotateCcw,
  Share2,
  ShoppingBag,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { GeneratedTryOn } from "../hooks/use-try-on-agent";
import type { TryOnProfile } from "../types";
import type { Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "@/modules/shopping-agent/constants";
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
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { useWearableTheme } from "../theme-context";
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
  onRegenerateAvatar: (patch: Partial<TryOnProfile>) => void;
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

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

/** Toolbar actions that actually do something useful on a static 2D photo —
 *  zoom + fullscreen only apply while viewing a photo. */
const TOOLBAR_ACTIONS = [
  { id: "zoom-in", icon: ZoomIn, label: "Zoom In" },
  { id: "zoom-out", icon: ZoomOut, label: "Zoom Out" },
  { id: "fullscreen", icon: Maximize2, label: "Fullscreen" },
] as const;

/** Image ⇄ Live mode switcher shown in the left toolbar (replaces the old
 *  disabled "3D — coming soon" slot; 3D will land in that same spot later). */
const MODE_TOGGLE_ACTIONS = [
  { id: "photo", icon: null, label: "Image" },
  { id: "live", icon: Camera, label: "Live" },
] as const;

/** Right edge of the info column, so other absolute elements (nav chevrons etc.) can
 *  clear it. The glass cards themselves use `right-4 w-[240px]`. */
const INFO_COLUMN_SPACE = 260;

/** Panel color that frames the studio photo (blends the photo edge + vignettes) — follows
 *  the active wearable theme so the frame matches the chat panel next to it. */
const PANEL_BG_BY_THEME = { dark: "#0d0b14", light: "#f2f0f5" } as const;

/** Matches the reference card style: dark near-opaque background, very subtle border,
 *  enough backdrop blur so the card reads as a premium glass surface. */
function InfoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-white/[0.07]",
        "bg-[rgba(13,11,20,0.82)] backdrop-blur-2xl",
        "shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
        className
      )}
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
  onRegenerateAvatar,
  onAddToCart,
  onBulkAddToCart,
  onChangeBackdrop,
  onUploadBackdrop,
  isUploadingBackdrop,
  backdropUploadError,
  mobile = false,
  onRequestSpace,
  embed,
  workspaceId,
}: AvatarMannequinPanelProps) {
  const handleBulkAddToCart = onBulkAddToCart ?? onAddToCart;
  const theme = useWearableTheme();
  const panelBg = PANEL_BG_BY_THEME[theme];
  const [activeSwatchIndex, setActiveSwatchIndex] = React.useState(0);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [justAddedAll, setJustAddedAll] = React.useState(false);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  /** Pan offset (px) applied on top of the zoom scale — lets the shopper drag around a
   *  zoomed-in photo instead of always scaling from the same fixed spot. */
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const photoAreaRef = React.useRef<HTMLElement | null>(null);
  const panDragRef = React.useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [isBgPickerOpen, setIsBgPickerOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"photo" | "live">("photo");
  const realtime = useRealtimeTryOn({ embed, workspaceId });
  const bgPickerRef = React.useRef<HTMLDivElement>(null);
  const backdropFileInputRef = React.useRef<HTMLInputElement>(null);

  const setPhotoAreaRef = React.useCallback((el: HTMLElement | null) => {
    photoAreaRef.current = el;
  }, []);

  /** Keeps the image from being dragged so far it leaves a visible gap at any edge —
   *  the further zoomed in, the more room there is to pan before hitting that limit. */
  const clampPan = React.useCallback((next: { x: number; y: number }, zoom: number) => {
    const rect = photoAreaRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const maxX = (rect.width * (zoom - 1)) / 2;
    const maxY = (rect.height * (zoom - 1)) / 2;
    return {
      x: maxX <= 0 ? 0 : Math.max(-maxX, Math.min(maxX, next.x)),
      y: maxY <= 0 ? 0 : Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, []);

  // Re-clamp whenever the zoom level changes so panning out then zooming out doesn't
  // leave the photo stuck off-center.
  React.useEffect(() => {
    setPan((p) => clampPan(p, zoomLevel));
  }, [zoomLevel, clampPan]);

  const handlePhotoPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (zoomLevel <= ZOOM_MIN) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
      setIsPanning(true);
    },
    [zoomLevel, pan.x, pan.y]
  );
  const handlePhotoPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!panDragRef.current) return;
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPan(clampPan({ x: panDragRef.current.startPanX + dx, y: panDragRef.current.startPanY + dy }, zoomLevel));
    },
    [clampPan, zoomLevel]
  );
  const handlePhotoPointerUp = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (panDragRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    panDragRef.current = null;
    setIsPanning(false);
  }, []);

  useClickOutside(bgPickerRef, React.useCallback(() => setIsBgPickerOpen(false), []), isBgPickerOpen);

  const canZoomIn = zoomLevel < ZOOM_MAX;
  const canZoomOut = zoomLevel > ZOOM_MIN;

  const handleZoomIn = React.useCallback(() => {
    setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);
  const handleZoomOut = React.useCallback(() => {
    setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);
  const handleResetZoom = React.useCallback(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }, []);

  React.useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  function handleToolbarAction(id: string) {
    if (id === "zoom-in") handleZoomIn();
    else if (id === "zoom-out") handleZoomOut();
    else if (id === "fullscreen") setIsFullscreen(true);
    // "3d" is disabled — coming soon, intentionally not wired up.
  }

  const wasRegeneratingRef = React.useRef(false);
  React.useEffect(() => {
    if (wasRegeneratingRef.current && !isRegeneratingAvatar) {
      setIsEditOpen(false);
    }
    wasRegeneratingRef.current = isRegeneratingAvatar;
  }, [isRegeneratingAvatar]);

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
    // New photo (new try-on render, regenerated avatar, etc.) — any previous pan offset
    // is meaningless for different content, so start fresh rather than showing it cropped.
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
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
  const isCustomBackdropActive =
    Boolean(profile.backdropUrl) && !STUDIO_BACKDROPS.some((bg) => bg.url === profile.backdropUrl);

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
    if (next === "photo" && viewMode === "live") realtime.stop("photo-mode");
    setViewMode(next);
  }

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

  function handleAddAllToCart() {
    activeItems.forEach((item) => handleBulkAddToCart(item.product));
    setJustAddedAll(true);
    setTimeout(() => setJustAddedAll(false), 2000);
  }

  // ─── Mobile avatar strip ─────────────────────────────────────────────────
  if (mobile) {
    return (
      <MobileAvatarStrip
        imgSrc={imgSrc}
        backdropUrl={hasFixedBackdrop ? profile.backdropUrl : null}
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
        onRegenerateAvatar={onRegenerateAvatar}
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        realtime={realtime}
        liveProducts={liveProducts}
        onRequestSpace={onRequestSpace}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative w-full h-full min-h-0 rounded-[22px] overflow-hidden",
        "border border-white/[0.06] shadow-[0_32px_80px_rgba(0,0,0,0.7)]",
        "bg-[#0d0b14] transition-colors duration-700"
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
          ref={setPhotoAreaRef}
          className={cn(
            "absolute inset-y-0 left-0 h-full select-none touch-none",
            isPanning ? "transition-none" : "transition-transform duration-300 ease-out",
            zoomLevel > ZOOM_MIN && (isPanning ? "cursor-grabbing" : "cursor-grab")
          )}
          style={{
            aspectRatio: "3 / 4",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            // Center-anchored so zoom scales in place — an off-center origin makes the
            // whole frame visibly shift on every zoom step, which reads as the panel "moving".
            transformOrigin: "50% 50%",
          }}
          onPointerDown={handlePhotoPointerDown}
          onPointerMove={handlePhotoPointerMove}
          onPointerUp={handlePhotoPointerUp}
          onPointerCancel={handlePhotoPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profile.backdropUrl!} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover select-none" />
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
          ref={setPhotoAreaRef}
          src={imgSrc}
          alt="Standing avatar in studio"
          onError={handleImageError}
          draggable={false}
          onPointerDown={handlePhotoPointerDown}
          onPointerMove={handlePhotoPointerMove}
          onPointerUp={handlePhotoPointerUp}
          onPointerCancel={handlePhotoPointerUp}
          className={cn(
            "absolute inset-y-0 left-0 h-full w-auto select-none touch-none",
            isPanning ? "transition-none" : "transition-transform duration-300 ease-out",
            zoomLevel > ZOOM_MIN && (isPanning ? "cursor-grabbing" : "cursor-grab")
          )}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`, transformOrigin: "50% 50%" }}
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
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.42), transparent)" }}
      />

      {/* ── Layer 3: Bottom vignette — keeps swatches legible ── */}
      <div className="absolute inset-x-0 bottom-0 h-40 z-[3] pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.60), transparent)" }}
      />

      {/* ── Hotspots — mapped to exact photo aspect ratio. pointer-events-none on the
          wrapper so empty space lets clicks/drags reach the photo underneath (e.g. panning);
          each hotspot dot opts back in with its own pointer-events-auto. ── */}
      {viewMode === "photo" && !isGenerating && !isRegeneratingAvatar && (
        <div className="absolute inset-y-0 left-0 z-[8] pointer-events-none" style={{ aspectRatio: "1024 / 1536" }}>
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

      {/* ── Top-right: Save / Share ── */}
      {viewMode === "photo" && <div className="absolute top-5 right-5 z-[20] flex items-center gap-2">
        {[
          { icon: Heart, label: "Save Look" },
          { icon: Share2, label: "Share" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-white/[0.15] bg-black/40 backdrop-blur-xl px-3 py-1.5 text-[11px] font-medium text-white/75 hover:text-white hover:bg-white/[0.12] transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>}

      {/* ── Left toolbar ── */}
      <div ref={bgPickerRef} className="absolute left-5 top-1/2 -translate-y-1/2 z-[20] flex flex-col items-center gap-3">
        <div
          className="relative flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-[20px] border border-white/[0.12] bg-black/50 backdrop-blur-2xl shadow-[0_8px_28px_rgba(0,0,0,0.5)]"
        >
          {viewMode === "photo" && (
            <>
              {/* Background picker */}
              <button
                type="button"
                title="Change background"
                onClick={() => setIsBgPickerOpen((v) => !v)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-all",
                  isBgPickerOpen ? "text-[var(--color-brand)] bg-white/[0.1]" : "text-white/50 hover:text-white/90 hover:bg-white/[0.08]"
                )}
              >
                <Palette className="h-[17px] w-[17px]" strokeWidth={1.6} />
              </button>

              <div className="h-px w-5 bg-white/[0.1]" />

              {/* Zoom + fullscreen */}
              {TOOLBAR_ACTIONS.map((mode) => {
                const isZoomDisabled = (mode.id === "zoom-in" && !canZoomIn) || (mode.id === "zoom-out" && !canZoomOut);
                return (
                  <button
                    key={mode.id}
                    type="button"
                    title={mode.label}
                    disabled={isZoomDisabled}
                    onClick={() => !isZoomDisabled && handleToolbarAction(mode.id)}
                    className={cn(
                      "relative h-9 w-9 rounded-full flex items-center justify-center transition-all",
                      isZoomDisabled
                        ? "text-white/20 cursor-not-allowed"
                        : "text-white/50 hover:text-white/90 hover:bg-white/[0.08] active:scale-90"
                    )}
                  >
                    <mode.icon className="h-[17px] w-[17px]" strokeWidth={1.6} />
                  </button>
                );
              })}

              <div className="h-px w-5 bg-white/[0.1]" />
            </>
          )}

          {/* Image ⇄ Live mode switch — replaces the old disabled "3D" slot */}
          {MODE_TOGGLE_ACTIONS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              title={mode.label}
              onClick={() => changeViewMode(mode.id)}
              className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center transition-all",
                viewMode === mode.id
                  ? "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-[var(--color-brand-contrast)] shadow-sm"
                  : "text-white/50 hover:text-white/90 hover:bg-white/[0.08]"
              )}
            >
              {mode.icon ? (
                <mode.icon className="h-[17px] w-[17px]" strokeWidth={1.6} />
              ) : (
                <ImageIcon className="h-[17px] w-[17px]" strokeWidth={1.6} />
              )}
            </button>
          ))}

          {/* Absolutely positioned (not a normal flex child) so it never changes the height
              of this toolbar pill — that was shifting the whole toolbar's vertical-centered
              position every time it appeared/disappeared on zoom. */}
          {zoomLevel !== 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="absolute left-1/2 top-full mt-2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/15 bg-black/50 backdrop-blur-xl px-2 py-1 text-[10px] font-semibold text-white/70 hover:text-white transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              {Math.round(zoomLevel * 100)}%
            </button>
          )}
        </div>

        {/* Background picker popover */}
        {viewMode === "photo" && isBgPickerOpen && (
          <div className="absolute left-full top-0 ml-3 z-[30] w-52 rounded-2xl border border-white/[0.1] bg-[rgba(12,10,18,0.96)] backdrop-blur-2xl p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
            <p className="px-1 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Studio Backdrop</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {STUDIO_BACKDROPS.map((bg) => {
                const isActive = profile.backdropUrl === bg.url;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    title={bg.label}
                    onClick={() => { onChangeBackdrop(bg.url); setIsBgPickerOpen(false); }}
                    className={cn(
                      "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all",
                      isActive ? "border-[var(--color-brand)]" : "border-white/15 hover:border-white/40"
                    )}
                  >
                    <Image src={bg.url} alt={bg.label} fill className="object-cover" unoptimized />
                    {isActive && (
                      <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-[var(--color-brand)] flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {isCustomBackdropActive && (
              <div className="flex items-center gap-2 mb-2 rounded-lg bg-white/[0.08] px-2 py-1.5">
                <span className="relative h-6 w-6 shrink-0 rounded-md overflow-hidden border border-[var(--color-brand)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={profile.backdropUrl!} alt="Custom background" className="h-full w-full object-cover" />
                </span>
                <span className="text-[11px] font-medium text-white/80 flex-1 truncate">Custom background</span>
                <Check className="h-3 w-3 text-[var(--color-brand)] shrink-0" />
              </div>
            )}

            <input
              ref={backdropFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadBackdrop(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => backdropFileInputRef.current?.click()}
              disabled={isUploadingBackdrop}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] px-2 py-2 text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-50"
            >
              {isUploadingBackdrop ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageUp className="h-3 w-3" />}
              {isUploadingBackdrop ? "Uploading…" : "Upload your own"}
            </button>
            {backdropUploadError && (
              <p className="mt-1.5 px-1 text-[10px] text-red-400 leading-snug">{backdropUploadError}</p>
            )}
            <p className="mt-1.5 px-1 text-[9px] text-white/25 leading-snug">Uploaded backgrounds are temporary and may be cleared on server restart.</p>
          </div>
        )}
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
          <p className="text-[13px] font-semibold text-white mb-3">Fit Analysis</p>

          {/* Circular gauge — centered */}
          <div className="flex flex-col items-center gap-1 mb-4">
            <p className="text-[10px] text-white/40 font-medium">Fit Score</p>
            <div className="relative h-[88px] w-[88px] my-1">
              <svg className="h-[88px] w-[88px] -rotate-90" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
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
                <span className="text-[22px] font-bold text-white leading-none">{fit.fitScore}%</span>
              </div>
            </div>
            <p className="text-[12px] font-semibold text-white/80">{fit.fitLabel}</p>
          </div>

          {/* Metric bars */}
          <div className="space-y-2.5">
            {fit.metrics.map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white/45">{m.label}</span>
                  <span className="text-white/85 font-semibold">{m.value}%</span>
                </div>
                <div className="h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${m.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </InfoCard>

        {/* Model Stats + Size Recommendation card */}
        <InfoCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-semibold text-white">Model Stats</p>
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
                <span className="text-[12px] text-white/45">{label}</span>
                <span className="text-[12px] text-white font-semibold">{value}</span>
              </div>
            ))}
          </div>

          <div className="my-3.5 h-px bg-white/[0.07]" />

          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35 mb-3">Size Recommendation</p>
          {sizeRows.length > 0 ? (
            <>
              <div className="space-y-2">
                {sizeRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between">
                    <span className="text-[12px] text-white/45">{row.label}</span>
                    <span className="text-[12px] text-white/90 font-semibold">{row.size}</span>
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
            <p className="text-[12px] text-white/40">Add items to see size recommendations.</p>
          )}
        </InfoCard>

        {/* Add All to Cart */}
        {activeItems.length > 0 && (
        <button
          type="button"
          onClick={handleAddAllToCart}
          disabled={anyPendingInCart}
          className={cn(
            "w-full h-[54px] rounded-[16px] font-semibold text-[13px] flex items-center justify-between px-5 transition-all",
            "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white",
            "shadow-[var(--shadow-glow)] hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
          )}
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
              className="absolute left-16 top-1/2 -translate-y-1/2 z-[20] h-9 w-9 rounded-full bg-black/45 border border-white/15 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/60 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {hasNext && (
            <button type="button" onClick={onNext}
              className="absolute right-[270px] top-1/2 -translate-y-1/2 z-[20] h-9 w-9 rounded-full bg-black/45 border border-white/15 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/60 transition-colors">
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
              "relative h-[52px] w-[52px] rounded-[12px] overflow-hidden border-2 transition-all duration-200",
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
          isRegenerating={isRegeneratingAvatar}
          onClose={() => setIsEditOpen(false)}
          onRegenerate={onRegenerateAvatar}
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
          onClick={() => setIsFullscreen(false)}
        >
          {hasFixedBackdrop ? (
            <div
              className="relative h-[85vh] max-h-full max-w-[90vw] aspect-[3/4] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.backdropUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt="Standing avatar in studio — fullscreen" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt="Standing avatar in studio — fullscreen"
              className="max-h-full max-w-full object-contain rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            title="Close (Esc)"
            className="absolute top-5 right-5 h-10 w-10 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center backdrop-blur-md hover:bg-white/20 transition-colors"
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
  onRegenerateAvatar: (patch: Partial<TryOnProfile>) => void;
  viewMode: "photo" | "live";
  onViewModeChange: (mode: "photo" | "live") => void;
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
  onRegenerateAvatar,
  viewMode,
  onViewModeChange,
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
    const {
      photoUrl: _p,
      photoBase64: _pb64,
      photoMimeType: _pmt,
      avatarUrl: _a,
      backdropUrl: _bg,
      ...measurements
    } = editDraft;
    onRegenerateAvatar(measurements);
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
        <div className="absolute inset-0 z-[8] pointer-events-none">
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

      {/* ── Left toolbar: Image ⇄ Live mode switch — same slot the "3D — coming soon"
           control will live in later, mirrors the desktop toolbar's left rail.
           Centred in the space left above the chat sheet, not in the frame, so it stays
           reachable at every snap point instead of sliding underneath. ── */}
      <div
        className="absolute left-3 z-[16] flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-white/[0.12] bg-black/50 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
        style={{ top: `calc((100% - ${SHEET_H}) / 2)` }}
      >
        {(["photo", "live"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            title={mode === "photo" ? "Image" : "Live"}
            aria-label={mode === "photo" ? "Image view" : "Live camera view"}
            onClick={() => onViewModeChange(mode)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all",
              viewMode === mode
                ? "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-[var(--color-brand-contrast)]"
                : "text-white/55 hover:text-white/90 hover:bg-white/[0.08]"
            )}
          >
            {mode === "live" ? <Camera className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          </button>
        ))}
      </div>

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
                  "h-11 w-11 shrink-0 rounded-[10px] overflow-hidden border-2 transition-all",
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
                "h-11 shrink-0 flex items-center gap-1.5 rounded-[12px] px-3.5 text-[12px] font-semibold transition-all",
                "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white shadow-[var(--shadow-glow)]",
                "hover:brightness-110 active:scale-[0.97] disabled:opacity-70"
              )}
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
              className={cn("flex-1 h-11 rounded-[12px] border text-[13px] font-medium transition-colors", styles.panelSecondaryButton)}>
              Edit Stats
            </button>
            <button type="button" onClick={() => setPanel("size-guide")}
              className={cn("flex-1 h-11 rounded-[12px] border text-[13px] font-medium transition-colors", styles.panelSecondaryButton)}>
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
                      "w-full h-11 pl-3 pr-9 rounded-[10px] border transition-colors focus:outline-none focus:border-[var(--color-brand)]",
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
              className={cn("flex-1 h-11 rounded-[12px] border text-[13px] transition-colors", styles.panelSecondaryButton)}>
              Cancel
            </button>
            <button type="button" onClick={handleSaveEdit} disabled={isRegeneratingAvatar}
              className={cn(
                "flex-1 h-11 rounded-[12px] text-[13px] font-semibold text-white flex items-center justify-center gap-1.5 transition-all",
                "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] shadow-[var(--shadow-glow)]",
                "disabled:opacity-60"
              )}>
              {isRegeneratingAvatar
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : "Regenerate Avatar"}
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
                          "h-10 shrink-0 px-3 rounded-[10px] text-[12px] font-semibold flex items-center gap-1 transition-all",
                          inCart
                            ? cn("border", styles.panelSecondaryButton)
                            : "bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] text-white"
                        )}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : inCart ? <Check className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                        {isPending ? "Adding…" : inCart ? "Added" : "Add"}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {scale.map((size) => (
                        <div key={size} className={cn(
                          "flex-1 h-9 rounded-[10px] flex items-center justify-center text-[12px] font-bold",
                          size === item.size
                            ? "bg-[var(--color-brand)] text-white"
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
        <AvatarWearScanOverlay itemLabel={
          outfitItems.length > 0
            ? outfitItems.map((p) => p.name).join(" · ")
            : activeItems.map((i) => i.product.name).join(" · ")
        } />
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
