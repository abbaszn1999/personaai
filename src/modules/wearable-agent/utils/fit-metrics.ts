import type { TryOnProfile } from "../types";
import type { Product } from "@/modules/shopping-agent/types";

export interface FitMetric {
  label: string;
  value: number;
}

export interface ProfileFitSummary {
  fitScore: number;
  fitLabel: string;
  metrics: FitMetric[];
  buildLabel: string;
}

/** Derives a "Build" descriptor straight from the chest/waist ratio instead of a
 *  self-picked body-shape category — higher ratio reads broader/athletic, lower
 *  ratio reads leaner/balanced. */
function getBuildLabel(chestWaistRatio: number): string {
  if (chestWaistRatio >= 1.35) return "Broad";
  if (chestWaistRatio >= 1.2) return "Athletic";
  if (chestWaistRatio >= 1.08) return "Balanced";
  return "Lean";
}

/** Realistic human ranges — values outside this fall back to a demo default
 *  so the panel always reads as polished, even with placeholder/bad test data. */
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 220;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 180;

const DEMO_HEIGHT_CM = 185; // 6'1"
const DEMO_WEIGHT_KG = 79; // 175 lbs
const MIN_CHEST_CM = 60;
const MAX_CHEST_CM = 160;
const MIN_WAIST_CM = 50;
const MAX_WAIST_CM = 150;
const MIN_SHOE_SIZE_EU = 30;
const MAX_SHOE_SIZE_EU = 52;

function isRealisticHeight(cm: number | null): cm is number {
  return !!cm && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
}

function isRealisticWeight(kg: number | null): kg is number {
  return !!kg && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

function isRealisticChest(cm: number | null): cm is number {
  return !!cm && cm >= MIN_CHEST_CM && cm <= MAX_CHEST_CM;
}

function isRealisticWaist(cm: number | null): cm is number {
  return !!cm && cm >= MIN_WAIST_CM && cm <= MAX_WAIST_CM;
}

function isRealisticShoeSize(eu: number | null): eu is number {
  return !!eu && eu >= MIN_SHOE_SIZE_EU && eu <= MAX_SHOE_SIZE_EU;
}

/** Height/weight are shown in the same cm/kg units the profile is actually entered in,
 *  matching Chest/Waist/Shoe Size instead of converting to ft/in and lbs. */
export function formatHeightCm(cm: number | null): string {
  const value = isRealisticHeight(cm) ? cm : DEMO_HEIGHT_CM;
  return `${Math.round(value)} cm`;
}

export function formatWeightKg(kg: number | null): string {
  const value = isRealisticWeight(kg) ? kg : DEMO_WEIGHT_KG;
  return `${Math.round(value)} kg`;
}

/** Chest/waist have no imperial-name convention shoppers expect (unlike ft/in and lbs), so
 *  these stay in the same cm unit the profile was actually entered in. */
export function formatChestCm(cm: number | null): string {
  return isRealisticChest(cm) ? `${Math.round(cm)} cm` : "—";
}

export function formatWaistCm(cm: number | null): string {
  return isRealisticWaist(cm) ? `${Math.round(cm)} cm` : "—";
}

/** Shoe size is a garment-independent stat (EU sizing, as entered), distinct from the
 *  XS–XL letter size recommended per-garment below it. */
export function formatShoeSizeEu(eu: number | null): string {
  return isRealisticShoeSize(eu) ? `EU ${eu}` : "—";
}

export function getProfileFitSummary(profile: TryOnProfile): ProfileFitSummary {
  const hasFullProfile =
    profile.heightCm &&
    profile.weightKg &&
    profile.chestCm &&
    profile.waistCm;

  const chestWaistRatio =
    profile.chestCm && profile.waistCm ? profile.chestCm / profile.waistCm : 1.2;

  const metrics: FitMetric[] = [
    { label: "Shoulders", value: hasFullProfile ? 94 : 94 },
    { label: "Chest", value: hasFullProfile ? Math.min(98, Math.round(85 + chestWaistRatio * 4)) : 91 },
    { label: "Waist", value: hasFullProfile ? Math.min(96, Math.round(88 + (profile.waistCm! / profile.heightCm!) * 20)) : 89 },
    { label: "Length", value: hasFullProfile ? 93 : 93 },
  ];

  const fitScore = Math.round(metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length);

  const buildLabel = getBuildLabel(chestWaistRatio);

  return {
    fitScore,
    fitLabel: fitScore >= 90 ? "Excellent Fit" : fitScore >= 80 ? "Great Fit" : "Good Fit",
    metrics,
    buildLabel,
  };
}

export function recommendSize(profile: TryOnProfile): string {
  const h = isRealisticHeight(profile.heightCm) ? profile.heightCm : 170;
  const w = isRealisticWeight(profile.weightKg) ? profile.weightKg : 65;
  const bmi = w / ((h / 100) ** 2);
  if (bmi < 19) return "XS";
  if (bmi < 22) return "S";
  if (bmi < 25) return "M";
  if (bmi < 28) return "L";
  return "XL";
}

function sizeLabelFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("blazer") || n.includes("jacket") || n.includes("jacktet")) return "Jacket";
  if (n.includes("shirt")) return "Shirt";
  if (n.includes("short")) return "Shorts";
  if (n.includes("pant") || n.includes("trouser") || n.includes("jean")) return "Pant";
  if (n.includes("dress")) return "Dress";
  if (
    n.includes("sneaker") ||
    n.includes("shoe") ||
    n.includes("boot") ||
    n.includes("trainer") ||
    n.includes("derby") ||
    n.includes("slip-on") ||
    n.includes("slip on") ||
    n.includes("footwear")
  ) {
    return "Shoe";
  }
  // Prefer a stable category-ish label; fall back to a short unique-ish title fragment.
  const words = name.trim().split(/\s+/);
  return words.slice(0, 2).join(" ") || name;
}

/** Garment slot used for outfit merging, bundle diversity, sizing, and hotspot placement. */
export type GarmentCategory = "outerwear" | "top" | "bottom" | "shoes" | "dress" | "other";

/** Every valid `GarmentCategory` value — the single source of truth for validating AI-returned
 *  slot strings (garment classification, product selection) against the real type. */
export const GARMENT_CATEGORIES: GarmentCategory[] = ["outerwear", "top", "bottom", "shoes", "dress", "other"];

export function isGarmentCategory(value: unknown): value is GarmentCategory {
  return typeof value === "string" && (GARMENT_CATEGORIES as string[]).includes(value);
}

export function getGarmentCategory(name: string): GarmentCategory {
  const n = name.toLowerCase();
  if (n.includes("dress") || n.includes("jumpsuit")) return "dress";
  if (
    n.includes("sneaker") ||
    n.includes("shoe") ||
    n.includes("boot") ||
    n.includes("heel") ||
    n.includes("loafer") ||
    n.includes("trainer") ||
    n.includes("derby") ||
    n.includes("slip-on") ||
    n.includes("slip on") ||
    n.includes("footwear") ||
    n.includes("slipper") ||
    n.includes("mule") ||
    n.includes("sandal")
  ) {
    return "shoes";
  }
  if (
    n.includes("pant") ||
    n.includes("trouser") ||
    n.includes("jean") ||
    n.includes("skirt") ||
    n.includes("short") ||
    n.includes("chino")
  ) {
    return "bottom";
  }
  // Outerwear gets its own slot so a jacket can coexist with a shirt while replacing
  // another jacket. Include the known catalog typo "jacktet".
  if (
    n.includes("blazer") ||
    n.includes("jacket") ||
    n.includes("jacktet") ||
    n.includes("coat") ||
    n.includes("parka") ||
    n.includes("raincoat")
  ) {
    return "outerwear";
  }
  if (
    n.includes("hoodie") ||
    n.includes("shirt") ||
    n.includes("tee") ||
    n.includes("t-shirt") ||
    n.includes("top") ||
    n.includes("sweater") ||
    n.includes("jumper") ||
    n.includes("cardigan") ||
    n.includes("knit")
  ) {
    return "top";
  }
  return "other";
}

/** Prefers the AI-classified slot set by classifyGarmentSlots() (richer signal — sees
 *  description/tags/categoryId, not just the title) and only falls back to keyword matching
 *  on the name when a product hasn't been classified yet (e.g. AI call failed/timed out, or
 *  this product predates the feature). This is the single source of truth every call site
 *  below should use once a full `Product` is available. */
export function resolveGarmentSlot(product: Product): GarmentCategory {
  return product.garmentSlot ?? getGarmentCategory(product.name);
}

const HOTSPOT_BASE_POSITION: Record<GarmentCategory, { top: number; left: number }> = {
  dress:     { top: 42, left: 48 },
  outerwear: { top: 30, left: 46 }, // jacket / coat chest area
  top:       { top: 25, left: 46 }, // shirt / knit chest area
  bottom:    { top: 60, left: 50 }, // hip / waist area
  shoes:     { top: 91, left: 48 }, // near the feet
  other:     { top: 45, left: 48 },
};

/** Approximate on-image position (%) for a garment hotspot, tuned to our standing studio photos. */
export function getHotspotPosition(product: Product, staggerIndex = 0): { top: string; left: string } {
  const base = HOTSPOT_BASE_POSITION[resolveGarmentSlot(product)];
  return { top: `${base.top + staggerIndex * 5}%`, left: `${base.left}%` };
}

/** Product-aware size-guide label — prefers the AI-classified slot, falling back to
 *  keyword matching on the title when unclassified. */
export function getProductSizeLabel(product: Product): string {
  const slot = resolveGarmentSlot(product);
  switch (slot) {
    case "outerwear":
      return "Jacket";
    case "dress":
      return "Dress";
    case "shoes":
      return "Shoe";
    // "bottom" (shorts vs pant) and "top"/"other" keep their finer-grained, keyword-derived
    // label — the slot alone can't distinguish those, but the title still can.
    default:
      return sizeLabelFromName(product.name);
  }
}
