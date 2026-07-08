"use client";

import * as React from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
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
import { MOCK_WEARABLE_PRODUCTS } from "@/lib/mock-api/catalog";
import { BODY_SHAPE_LABELS, DEFAULT_MANNEQUIN_IMAGE, MOCK_OUTFIT_SWATCHES } from "../constants";
import {
  formatHeightImperial,
  formatWeightImperial,
  getGarmentCategory,
  getHotspotPosition,
  getProductSizeLabel,
  getProfileFitSummary,
  recommendSize,
} from "../utils/fit-metrics";
import { EditModelStatsModal } from "./edit-model-stats-modal";
import { AvatarWearScanOverlay } from "./avatar-wear-scan-overlay";
import { GarmentHotspot, type ActiveLookItem } from "./garment-hotspot";
import { SizeGuideModal } from "./size-guide-modal";
import { cn } from "@/lib/utils/cn";

interface AvatarMannequinPanelProps {
  profile: TryOnProfile;
  outfitItems: Product[];
  tryOnImages: GeneratedTryOn[];
  currentImageIndex: number;
  currentTryOn: GeneratedTryOn | null;
  isGenerating: boolean;
  isRegeneratingAvatar: boolean;
  cartItems: Product[];
  onPrev: () => void;
  onNext: () => void;
  onSelectImage: (index: number) => void;
  onRemoveFromOutfit: (id: string) => void;
  onRegenerateAvatar: (patch: Partial<TryOnProfile>) => void;
  onAddToCart: (product: Product) => void;
  mobile?: boolean;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

/** Toolbar actions that actually do something useful on a static 2D photo —
 *  zoom + fullscreen work today; 3D is reserved for a future capture pipeline. */
const TOOLBAR_ACTIONS = [
  { id: "zoom-in", icon: ZoomIn, label: "Zoom In" },
  { id: "zoom-out", icon: ZoomOut, label: "Zoom Out" },
  { id: "fullscreen", icon: Maximize2, label: "Fullscreen" },
  { id: "3d", label: "3D", isText: true, disabled: true },
] as const;

/** Shown as a sensible default "look" before the shopper has added or generated anything. */
const DEMO_LOOK_PRODUCTS = MOCK_WEARABLE_PRODUCTS.filter((p) => ["p-w-002", "p-w-003"].includes(p.id));

/** Right edge of the info column, so other absolute elements (nav chevrons etc.) can
 *  clear it. The glass cards themselves use `right-4 w-[240px]`. */
const INFO_COLUMN_SPACE = 260;

/** The photo itself has one fixed background baked in — since we can't cleanly re-composite
 *  a new photographed scene behind the model, "changing the background" swaps a curated
 *  studio color wash instead. Every wash is a flat/gradient fill, so it always covers the
 *  full panel edge-to-edge with zero crop or seam artifacts, however the panel is resized. */
const BACKGROUND_THEMES = [
  {
    id: "charcoal",
    label: "Charcoal Studio",
    swatch: "#1a1820",
    panelBg: "#0d0b14",
    keyLight: "rgba(255,255,255,0.07)",
    gradient: "from-[#38353d] via-[#252229] to-[#141217]",
  },
  {
    id: "warm-loft",
    label: "Warm Loft",
    swatch: "#2a1f14",
    panelBg: "#150f09",
    keyLight: "rgba(255,210,160,0.10)",
    gradient: "from-[#6b5644] via-[#40332a] to-[#201914]",
  },
  {
    id: "midnight",
    label: "Midnight Runway",
    swatch: "#160f2e",
    panelBg: "#0b0818",
    keyLight: "rgba(160,140,255,0.10)",
    gradient: "from-[#39316b] via-[#221c3f] to-[#100d20]",
  },
  {
    id: "studio-white",
    label: "Studio White",
    swatch: "#3a3a42",
    panelBg: "#1c1c24",
    keyLight: "rgba(255,255,255,0.12)",
    gradient: "from-[#d9d9de] via-[#aaaab2] to-[#75757e]",
  },
] as const;

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
  onPrev,
  onNext,
  onSelectImage,
  onRemoveFromOutfit,
  onRegenerateAvatar,
  onAddToCart,
  mobile = false,
}: AvatarMannequinPanelProps) {
  const [activeSwatchIndex, setActiveSwatchIndex] = React.useState(0);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [justAddedAll, setJustAddedAll] = React.useState(false);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const [bgThemeId, setBgThemeId] = React.useState<string>(BACKGROUND_THEMES[0].id);
  const [isBgPickerOpen, setIsBgPickerOpen] = React.useState(false);
  const bgTheme = BACKGROUND_THEMES.find((t) => t.id === bgThemeId) ?? BACKGROUND_THEMES[0];
  const bgPickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isBgPickerOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (bgPickerRef.current && !bgPickerRef.current.contains(e.target as Node)) {
        setIsBgPickerOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isBgPickerOpen]);

  const canZoomIn = zoomLevel < ZOOM_MAX;
  const canZoomOut = zoomLevel > ZOOM_MIN;

  const handleZoomIn = React.useCallback(() => {
    setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);
  const handleZoomOut = React.useCallback(() => {
    setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);
  const handleResetZoom = React.useCallback(() => setZoomLevel(1), []);

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
  }, [displayImage]);

  function handleImageError() {
    if (imgSrc !== DEFAULT_MANNEQUIN_IMAGE) {
      setImgSrc(DEFAULT_MANNEQUIN_IMAGE);
    }
  }

  const cartItemIds = React.useMemo(() => new Set(cartItems.map((p) => p.id)), [cartItems]);

  /** The garments currently shown on the avatar — a real generated style, the
   *  outfit being built, or a sensible demo look so hotspots always have content. */
  const activeItems: ActiveLookItem[] = React.useMemo(() => {
    const source: Product[] =
      currentTryOn && currentTryOn.outfitProducts.length > 0
        ? currentTryOn.outfitProducts
        : outfitItems.length > 0
          ? outfitItems
          : DEMO_LOOK_PRODUCTS;

    const categoryCounts: Partial<Record<string, number>> = {};

    return source.map((product) => {
      const category = getGarmentCategory(product.name);
      const staggerIndex = categoryCounts[category] ?? 0;
      categoryCounts[category] = staggerIndex + 1;
      return {
        product,
        size: currentTryOn?.recommendedSizes[product.id] ?? defaultSize,
        position: getHotspotPosition(product.name, staggerIndex),
      };
    });
  }, [currentTryOn, outfitItems, defaultSize]);

  const lookLabel = hasGeneratedLooks
    ? `Style ${currentImageIndex + 1} of ${total}`
    : outfitItems.length > 0
      ? "Your Outfit"
      : "Suggested Look";

  const cartTotal = activeItems.reduce((sum, item) => sum + item.product.price, 0);
  const currency = activeItems[0]?.product.currency ?? "USD";

  const sizeRows = activeItems.map((item) => ({
    label: getProductSizeLabel(item.product.name),
    size: item.size,
  }));

  function handleAddAllToCart() {
    activeItems.forEach((item) => onAddToCart(item.product));
    setJustAddedAll(true);
    setTimeout(() => setJustAddedAll(false), 2000);
  }

  // ─── Mobile avatar strip ─────────────────────────────────────────────────
  if (mobile) {
    return (
      <MobileAvatarStrip
        imgSrc={imgSrc}
        onImageError={handleImageError}
        fit={fit}
        profile={profile}
        sizeRows={sizeRows}
        cartTotal={cartTotal}
        currency={currency}
        justAddedAll={justAddedAll}
        activeItems={activeItems}
        cartItemIds={cartItemIds}
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
      style={{ background: bgTheme.panelBg }}
    >
      {/* ── Layer 0: Studio photo — fills full height, natural width, left-anchored ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt="Standing avatar in studio"
        onError={handleImageError}
        className="absolute inset-y-0 left-0 h-full w-auto transition-transform duration-300 ease-out select-none"
        style={{ transform: `scale(${zoomLevel})`, transformOrigin: "30% 100%" }}
      />

      {/* ── Layer 1: Right-side fade — blends photo edge into the dark panel bg ── */}
      <div className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background: `linear-gradient(to right, transparent 52%, ${bgTheme.panelBg}CC 64%, ${bgTheme.panelBg} 72%)`,
        }}
      />

      {/* ── Layer 2: Top vignette — keeps Save/Share legible ── */}
      <div className="absolute inset-x-0 top-0 h-24 z-[3] pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.42), transparent)" }}
      />

      {/* ── Layer 3: Bottom vignette — keeps swatches legible ── */}
      <div className="absolute inset-x-0 bottom-0 h-40 z-[3] pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.60), transparent)" }}
      />

      {/* ── Hotspots — mapped to exact photo aspect ratio ── */}
      {!isGenerating && !isRegeneratingAvatar && (
        <div className="absolute inset-y-0 left-0 z-[8]" style={{ aspectRatio: "1024 / 1536" }}>
          {activeItems.map((item) => (
            <GarmentHotspot key={item.product.id} item={item} inCart={cartItemIds.has(item.product.id)} onAddToCart={onAddToCart} />
          ))}
        </div>
      )}

      {/* ── Top-right: Save / Share ── */}
      <div className="absolute top-5 right-5 z-[20] flex items-center gap-2">
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
      </div>

      {/* ── Left toolbar ── */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-[20] flex flex-col items-center gap-3">
        <div
          ref={bgPickerRef}
          className="relative flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-[20px] border border-white/[0.12] bg-black/50 backdrop-blur-2xl shadow-[0_8px_28px_rgba(0,0,0,0.5)]"
        >
          {/* Background picker */}
          <button
            type="button"
            title="Change background"
            onClick={() => setIsBgPickerOpen((v) => !v)}
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center transition-all",
              isBgPickerOpen ? "text-[#f76d01] bg-white/[0.1]" : "text-white/50 hover:text-white/90 hover:bg-white/[0.08]"
            )}
          >
            <Palette className="h-[17px] w-[17px]" strokeWidth={1.6} />
          </button>

          <div className="h-px w-5 bg-white/[0.1]" />

          {/* Zoom + fullscreen + 3D */}
          {TOOLBAR_ACTIONS.map((mode) => {
            const Icon = "icon" in mode ? mode.icon : null;
            const isDisabled = "disabled" in mode && mode.disabled;
            const isZoomDisabled = (mode.id === "zoom-in" && !canZoomIn) || (mode.id === "zoom-out" && !canZoomOut);
            const disabled = isDisabled || isZoomDisabled;
            return (
              <button
                key={mode.id}
                type="button"
                title={isDisabled ? `${mode.label} — coming soon` : mode.label}
                disabled={disabled}
                onClick={() => !disabled && handleToolbarAction(mode.id)}
                className={cn(
                  "relative h-9 w-9 rounded-full flex items-center justify-center transition-all",
                  mode.id === "3d"
                    ? "text-[#f76d01]/60 cursor-not-allowed text-[11px] font-bold"
                    : disabled
                      ? "text-white/20 cursor-not-allowed"
                      : "text-white/50 hover:text-white/90 hover:bg-white/[0.08] active:scale-90"
                )}
              >
                {"isText" in mode && mode.isText
                  ? <span className="text-[11px] font-bold">3D</span>
                  : Icon && <Icon className="h-[17px] w-[17px]" strokeWidth={1.6} />}
                {isDisabled && (
                  <span className="absolute -right-1 -top-0.5 rounded-full bg-white/[0.12] px-[3px] py-px text-[5.5px] font-bold uppercase tracking-wide text-white/60 leading-none">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {zoomLevel !== 1 && (
          <button
            type="button"
            onClick={handleResetZoom}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-black/50 backdrop-blur-xl px-2 py-1 text-[10px] font-semibold text-white/70 hover:text-white transition-colors"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            {Math.round(zoomLevel * 100)}%
          </button>
        )}

        {/* Background picker popover */}
        {isBgPickerOpen && (
          <div className="absolute left-full top-0 ml-3 z-[30] w-44 rounded-2xl border border-white/[0.1] bg-[rgba(12,10,18,0.96)] backdrop-blur-2xl p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
            <p className="px-1 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">Studio Backdrop</p>
            <div className="flex flex-col gap-0.5">
              {BACKGROUND_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => { setBgThemeId(theme.id); setIsBgPickerOpen(false); }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
                    theme.id === bgThemeId ? "bg-white/[0.1]" : "hover:bg-white/[0.05]"
                  )}
                >
                  <span className={cn("h-5 w-5 shrink-0 rounded-full border-2", theme.id === bgThemeId ? "border-[#f76d01]" : "border-white/20")}
                    style={{ backgroundColor: theme.swatch }} />
                  <span className="text-[11px] font-medium text-white/80">{theme.label}</span>
                  {theme.id === bgThemeId && <Check className="h-3 w-3 text-[#f76d01] ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right info column ── */}
      <div className="absolute top-5 right-5 z-[20] w-[252px] flex flex-col gap-3">

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
                    <stop offset="0%" stopColor="#f76d01" />
                    <stop offset="50%" stopColor="#c8304e" />
                    <stop offset="100%" stopColor="#6c28d9" />
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
                  <div className="h-full rounded-full bg-gradient-to-r from-[#f76d01] to-[#ff6b35]" style={{ width: `${m.value}%` }} />
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
              className="flex items-center gap-1 text-[11px] font-medium text-[#f76d01] hover:text-[#ff8a2b] transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <div className="space-y-2">
            {[
              { label: "Height", value: formatHeightImperial(profile.heightCm) },
              { label: "Weight", value: formatWeightImperial(profile.weightKg) },
              { label: "Build",  value: fit.buildLabel },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[12px] text-white/45">{label}</span>
                <span className="text-[12px] text-white font-semibold">{value}</span>
              </div>
            ))}
          </div>

          <div className="my-3.5 h-px bg-white/[0.07]" />

          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35 mb-3">Size Recommendation</p>
          <div className="space-y-2">
            {sizeRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[12px] text-white/45">{row.label}</span>
                <span className="text-[12px] text-white/90 font-semibold">{row.size}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setIsSizeGuideOpen(true)}
            className="mt-3 text-[11px] font-medium text-[#f76d01] hover:text-[#ff8a2b] transition-colors"
          >
            View Size Guide
          </button>
        </InfoCard>

        {/* Add All to Cart */}
        <button
          type="button"
          onClick={handleAddAllToCart}
          className={cn(
            "w-full h-[54px] rounded-[16px] font-semibold text-[13px] flex items-center justify-between px-5 transition-all",
            "bg-gradient-to-r from-[#f76d01] to-[#e05500] text-white",
            "shadow-[0_8px_28px_rgba(247,109,1,0.4)] hover:brightness-110 active:scale-[0.98]"
          )}
        >
          <span className="flex items-center gap-2">
            {justAddedAll ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
            {justAddedAll ? "Added to Cart" : "Add All to Cart"}
          </span>
          <span className="text-[15px] font-bold">{formatPrice(cartTotal, currency)}</span>
        </button>
      </div>

      {/* Wear scan — top-to-bottom garment fitting animation */}
      {isGenerating && !isRegeneratingAvatar && (
        <AvatarWearScanOverlay
          itemLabel={
            outfitItems.length > 0
              ? outfitItems.map((p) => p.name).join(" · ")
              : activeItems.map((i) => i.product.name).join(" · ")
          }
        />
      )}

      {/* Avatar regeneration overlay */}
      {isRegeneratingAvatar && (
        <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-sm font-medium text-white">Regenerating your avatar…</p>
          <p className="text-xs text-white/50 max-w-[200px] text-center">
            Applying your updated measurements
          </p>
        </div>
      )}

      {/* Preview navigation */}
      {total > 1 && !isGenerating && (
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

      {/* Swatches — bottom-left */}
      <div className="absolute bottom-5 left-5 z-[20] flex items-center gap-2">
        {(hasGeneratedLooks
          ? tryOnImages.map((tryOn, i) => ({ id: tryOn.id, thumb: tryOn.outfitProducts[0]?.imageUrl ?? tryOn.imageUrl, active: i === currentImageIndex, onClick: () => onSelectImage(i) }))
          : outfitItems.length > 0
            ? outfitItems.map((p, i) => ({ id: p.id, thumb: p.imageUrl, active: i === activeSwatchIndex, onClick: () => setActiveSwatchIndex(i) }))
            : MOCK_OUTFIT_SWATCHES.map((s, i) => ({ id: s.id, thumb: s.imageUrl, active: i === activeSwatchIndex, onClick: () => setActiveSwatchIndex(i) }))
        ).map((sw) => (
          <button
            key={sw.id}
            type="button"
            onClick={sw.onClick}
            className={cn(
              "relative h-[52px] w-[52px] rounded-[12px] overflow-hidden border-2 transition-all duration-200",
              sw.active
                ? "border-[#f76d01] shadow-[0_0_16px_rgba(247,109,1,0.6)]"
                : "border-white/25 opacity-70 hover:opacity-100 hover:border-white/50"
            )}
          >
            <Image src={sw.thumb} alt="" fill className="object-cover" unoptimized />
          </button>
        ))}
      </div>

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt="Standing avatar in studio — fullscreen"
            className="max-h-full max-w-full object-contain rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          />
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
  onImageError: () => void;
  fit: ReturnType<typeof getProfileFitSummary>;
  profile: TryOnProfile;
  sizeRows: { label: string; size: string }[];
  cartTotal: number;
  currency: string;
  justAddedAll: boolean;
  activeItems: ActiveLookItem[];
  cartItemIds: Set<string>;
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
}

/** What sub-panel is open over the avatar on mobile. */
type MobilePanel = "details" | "edit" | "size-guide" | null;

function MobileAvatarStrip({
  imgSrc,
  onImageError,
  fit,
  profile,
  sizeRows,
  cartTotal,
  currency,
  justAddedAll,
  activeItems,
  cartItemIds,
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
}: MobileAvatarStripProps) {
  const [panel, setPanel] = React.useState<MobilePanel>(null);
  const [editDraft, setEditDraft] = React.useState<TryOnProfile>(profile);

  // Keep draft in sync if profile changes externally
  React.useEffect(() => { setEditDraft(profile); }, [profile]);

  function handleSaveEdit() {
    const { photoUrl: _p, avatarUrl: _a, ...measurements } = editDraft;
    onRegenerateAvatar(measurements);
    setPanel(null);
  }

  return (
    <div className="relative w-full h-full min-h-0 overflow-hidden bg-[#0d0b14]">
      {/* ── Avatar photo — object-cover fills the full frame; since the container is
           taller than a 2:3 image scaled to width, object-cover scales by height so
           the full body (head → feet) is always visible, sides trimmed slightly. ── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt="Avatar"
        onError={onImageError}
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
      />

      {/* ── Hotspot pins — absolute inset-0 matches the cover-filled image exactly ── */}
      {!isGenerating && !isRegeneratingAvatar && (
        <div className="absolute inset-0 z-[8] pointer-events-none">
          {activeItems.map((item) => (
            <GarmentHotspot
              key={item.product.id}
              item={item}
              inCart={cartItemIds.has(item.product.id)}
              onAddToCart={onAddToCart}
            />
          ))}
        </div>
      )}

      {/* Top gradient */}
      <div className="absolute inset-x-0 top-0 h-20 z-[9] pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
      />
      {/* Bottom gradient — lighter since the sheet handle sits right below */}
      <div className="absolute inset-x-0 bottom-0 h-16 z-[9] pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}
      />

      {/* ── Top row: Fit badge + Details button ── */}
      <div className="absolute top-3 inset-x-3 z-[10] flex items-center justify-between">
        <div className="flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/[0.12] px-2.5 py-1">
          <div className="h-2 w-2 rounded-full" style={{
            background: fit.fitScore >= 90 ? "#22c55e" : fit.fitScore >= 75 ? "#f76d01" : "#ef4444",
          }} />
          <span className="text-[11px] font-bold text-white">{fit.fitScore}% Fit</span>
          <span className="text-[11px] text-white/50 ml-0.5">{lookLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setPanel(panel === "details" ? null : "details")}
          className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-md border border-white/[0.12] px-2.5 py-1 text-[11px] font-medium text-white/75 hover:text-white transition-colors"
        >
          Details
          <ChevronDown className={cn("h-3 w-3 transition-transform", panel === "details" && "rotate-180")} />
        </button>
      </div>

      {/* ── Bottom row: swatches + cart — sits just above the gradient so feet stay clear ── */}
      <div className="absolute inset-x-0 bottom-2 z-[10] flex items-center justify-between px-3 gap-2">
        {/* Style swatches */}
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 scrollbar-none">
          {(hasGeneratedLooks ? tryOnImages : activeItems.map((i) => i.product)).map((item, idx) => {
            const isGenerated = hasGeneratedLooks;
            const imgUrl = isGenerated
              ? (item as GeneratedTryOn).imageUrl
              : (item as Product).imageUrl;
            return (
              <button key={idx} type="button"
                onClick={() => isGenerated ? onSelectImage(idx) : undefined}
                className={cn(
                  "h-8 w-8 shrink-0 rounded-[7px] overflow-hidden border-2 transition-all",
                  (isGenerated ? currentImageIndex : activeSwatchIndex) === idx
                    ? "border-[#f76d01] scale-105" : "border-white/20 opacity-70"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
        {/* Cart pill */}
        <button type="button" onClick={handleAddAllToCart}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-all",
            "bg-gradient-to-r from-[#f76d01] to-[#e05500] text-white shadow-[0_3px_10px_rgba(247,109,1,0.45)]",
            "hover:brightness-110 active:scale-[0.97]"
          )}
        >
          {justAddedAll ? <Check className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
          {justAddedAll ? "Added" : `Cart · ${formatPrice(cartTotal, currency)}`}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          INLINE PANELS — all use absolute inset-0 so they stay inside the
          phone frame (never escape via fixed positioning)
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Fit Analysis / Details ── */}
      {panel === "details" && (
        <MobileInlinePanel title="Fit Analysis" onClose={() => setPanel(null)}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full border-2 border-[#f76d01] flex items-center justify-center shrink-0">
              <span className="text-[15px] font-black text-white">{fit.fitScore}%</span>
            </div>
            <div>
              <p className="text-[12px] font-bold text-white">{fit.fitLabel}</p>
              <p className="text-[11px] text-white/45">{fit.buildLabel}</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {fit.metrics.map((m) => (
              <div key={m.label} className="flex items-center gap-2">
                <span className="w-20 text-[11px] text-white/45 shrink-0">{m.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full" style={{ width: `${m.value}%`, background: "linear-gradient(90deg,#f76d01,#ff9a42)" }} />
                </div>
                <span className="text-[11px] font-semibold text-white/70 w-7 text-right">{m.value}%</span>
              </div>
            ))}
          </div>
          <div className="h-px bg-white/[0.07] mb-4" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5">
            {[
              { label: "Height", value: formatHeightImperial(profile.heightCm) },
              { label: "Weight", value: formatWeightImperial(profile.weightKg) },
              { label: "Build", value: fit.buildLabel },
              ...sizeRows.map((r) => ({ label: r.label, value: r.size })),
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] text-white/35 uppercase tracking-[0.12em]">{label}</span>
                <span className="text-[12px] font-semibold text-white mt-0.5">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPanel("edit")}
              className="flex-1 h-9 rounded-[10px] bg-white/[0.07] border border-white/[0.10] text-[12px] font-medium text-white/80 hover:bg-white/[0.12] transition-colors">
              Edit Stats
            </button>
            <button type="button" onClick={() => setPanel("size-guide")}
              className="flex-1 h-9 rounded-[10px] bg-white/[0.07] border border-white/[0.10] text-[12px] font-medium text-white/80 hover:bg-white/[0.12] transition-colors">
              Size Guide
            </button>
          </div>
        </MobileInlinePanel>
      )}

      {/* ── Edit Stats ── */}
      {panel === "edit" && (
        <MobileInlinePanel title="Edit Model Stats" onClose={() => setPanel("details")}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {([
              { key: "heightCm", label: "Height", unit: "cm" },
              { key: "weightKg", label: "Weight", unit: "kg" },
              { key: "chestCm",  label: "Chest",  unit: "cm" },
              { key: "waistCm",  label: "Waist",  unit: "cm" },
            ] as const).map(({ key, label, unit }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[10px] text-white/45 uppercase tracking-wide">{label}</span>
                <div className="relative">
                  <input
                    type="number"
                    value={editDraft[key] ?? ""}
                    onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full h-9 pl-3 pr-8 rounded-lg bg-white/[0.07] border border-white/[0.10] text-[13px] text-white focus:outline-none focus:border-[#f76d01] transition-colors"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30">{unit}</span>
                </div>
              </label>
            ))}
          </div>
          <div className="mb-5">
            <span className="text-[10px] text-white/45 uppercase tracking-wide block mb-2">Body Shape</span>
            <div className="flex flex-wrap gap-1.5">
              {(["rectangle","hourglass","pear","apple","inverted-triangle"] as const).map((shape) => (
                <button key={shape} type="button" onClick={() => setEditDraft((d) => ({ ...d, bodyShape: shape }))}
                  className={cn(
                    "text-[11px] rounded-full px-2.5 py-1 border transition-all",
                    editDraft.bodyShape === shape
                      ? "bg-gradient-to-r from-[#f76d01] to-[#c40000] text-white border-transparent"
                      : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/25"
                  )}>
                  {BODY_SHAPE_LABELS[shape]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPanel("details")}
              className="flex-1 h-9 rounded-[10px] border border-white/10 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSaveEdit} disabled={isRegeneratingAvatar}
              className={cn(
                "flex-1 h-9 rounded-[10px] text-[12px] font-semibold text-white flex items-center justify-center gap-1.5 transition-all",
                "bg-gradient-to-r from-[#f76d01] to-[#c40000] shadow-[0_4px_12px_rgba(247,109,1,0.35)]",
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
      {panel === "size-guide" && (
        <MobileInlinePanel title="Size Guide" onClose={() => setPanel("details")}>
          {activeItems.length === 0 ? (
            <p className="text-[12px] text-white/40 text-center py-8">Add items to see size recommendations.</p>
          ) : (
            <div className="space-y-3">
              {activeItems.map((item) => {
                const inCart = cartItemIds.has(item.product.id);
                const sizeVariants = item.product.variants.filter((v) => v.type === "size");
                const scale = sizeVariants.length > 0 ? sizeVariants.map((v) => v.label) : ["XS","S","M","L","XL"];
                return (
                  <div key={item.product.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="flex items-start gap-2.5 mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.product.imageUrl} alt={item.product.name}
                        className="h-12 w-12 rounded-lg object-cover shrink-0 border border-white/10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white leading-snug">{item.product.name}</p>
                        <p className="text-[11px] text-white/45 mt-0.5">{formatPrice(item.product.price, item.product.currency)}</p>
                      </div>
                      <button type="button" onClick={() => onAddToCart(item.product)} disabled={inCart}
                        className={cn(
                          "h-7 shrink-0 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all",
                          inCart ? "bg-white/10 text-white/50" : "bg-gradient-to-r from-[#f76d01] to-[#c40000] text-white"
                        )}>
                        {inCart ? <Check className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                        {inCart ? "Added" : "Add"}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {scale.map((size) => (
                        <div key={size} className={cn(
                          "flex-1 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold",
                          size === item.size
                            ? "bg-gradient-to-r from-[#f76d01] to-[#ff8a2b] text-white"
                            : "bg-white/[0.05] text-white/35 border border-white/[0.06]"
                        )}>{size}</div>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/30 mt-1.5">
                      Recommended: <span className="text-[#f76d01] font-semibold">{item.size}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </MobileInlinePanel>
      )}

      {/* ── Wear scan / regenerating overlays ── */}
      {isGenerating && !isRegeneratingAvatar && (
        <AvatarWearScanOverlay itemLabel={
          outfitItems.length > 0
            ? outfitItems.map((p) => p.name).join(" · ")
            : activeItems.map((i) => i.product.name).join(" · ")
        } />
      )}
      {isRegeneratingAvatar && (
        <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
          <p className="text-sm font-medium text-white">Regenerating…</p>
        </div>
      )}
    </div>
  );
}

/** Reusable full-cover overlay panel for mobile — stays within the phone frame. */
function MobileInlinePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-[20] bg-[#0a0910]/97 backdrop-blur-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0 border-b border-white/[0.07]">
        <p className="text-[13px] font-bold text-white">{title}</p>
        <button type="button" onClick={onClose}
          className="h-7 w-7 rounded-full bg-white/[0.10] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.16] transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {children}
      </div>
    </div>
  );
}
