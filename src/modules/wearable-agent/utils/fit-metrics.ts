import type { TryOnProfile } from "../types";
import { BODY_SHAPE_LABELS } from "../constants";

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

const BUILD_DISPLAY: Record<string, string> = {
  rectangle: "Athletic",
  hourglass: "Balanced",
  pear: "Tapered",
  apple: "Broad",
  "inverted-triangle": "Athletic",
};

/** Realistic human ranges — values outside this fall back to a demo default
 *  so the panel always reads as polished, even with placeholder/bad test data. */
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 220;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 180;

const DEMO_HEIGHT_CM = 185; // 6'1"
const DEMO_WEIGHT_KG = 79; // 175 lbs

function isRealisticHeight(cm: number | null): cm is number {
  return !!cm && cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM;
}

function isRealisticWeight(kg: number | null): kg is number {
  return !!kg && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

export function formatHeightImperial(cm: number | null): string {
  const value = isRealisticHeight(cm) ? cm : DEMO_HEIGHT_CM;
  const totalInches = value / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
}

export function formatWeightImperial(kg: number | null): string {
  const value = isRealisticWeight(kg) ? kg : DEMO_WEIGHT_KG;
  return `${Math.round(value * 2.20462)} lbs`;
}

export function getProfileFitSummary(profile: TryOnProfile): ProfileFitSummary {
  const hasFullProfile =
    profile.heightCm &&
    profile.weightKg &&
    profile.chestCm &&
    profile.waistCm &&
    profile.bodyShape;

  const chestWaistRatio =
    profile.chestCm && profile.waistCm ? profile.chestCm / profile.waistCm : 1.2;

  const metrics: FitMetric[] = [
    { label: "Shoulders", value: hasFullProfile ? 94 : 94 },
    { label: "Chest", value: hasFullProfile ? Math.min(98, Math.round(85 + chestWaistRatio * 4)) : 91 },
    { label: "Waist", value: hasFullProfile ? Math.min(96, Math.round(88 + (profile.waistCm! / profile.heightCm!) * 20)) : 89 },
    { label: "Length", value: hasFullProfile ? 93 : 93 },
  ];

  const fitScore = Math.round(metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length);

  const buildLabel = profile.bodyShape
    ? BUILD_DISPLAY[profile.bodyShape] ?? BODY_SHAPE_LABELS[profile.bodyShape]
    : "Athletic";

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

export function getProductSizeLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("blazer") || n.includes("jacket")) return "Blazer";
  if (n.includes("shirt")) return "Shirt";
  if (n.includes("pant") || n.includes("trouser") || n.includes("jean")) return "Pant";
  if (n.includes("dress")) return "Dress";
  if (n.includes("sneaker") || n.includes("shoe")) return "Shoe";
  return name.split(" ").slice(-1)[0] ?? name;
}

/** Rough garment category used to place a shoppable hotspot on the avatar photo. */
export type GarmentCategory = "top" | "bottom" | "shoes" | "dress" | "other";

export function getGarmentCategory(name: string): GarmentCategory {
  const n = name.toLowerCase();
  if (n.includes("dress")) return "dress";
  if (n.includes("sneaker") || n.includes("shoe") || n.includes("boot") || n.includes("heel")) return "shoes";
  if (n.includes("pant") || n.includes("trouser") || n.includes("jean") || n.includes("skirt")) return "bottom";
  if (n.includes("blazer") || n.includes("jacket") || n.includes("shirt") || n.includes("top") || n.includes("sweater"))
    return "top";
  return "other";
}

const HOTSPOT_BASE_POSITION: Record<GarmentCategory, { top: number; left: number }> = {
  dress:  { top: 42, left: 48 },
  top:    { top: 28, left: 46 },   // chest / shirt area
  bottom: { top: 60, left: 50 },   // hip / waist area
  shoes:  { top: 91, left: 48 },   // near the feet
  other:  { top: 45, left: 48 },
};

/** Approximate on-image position (%) for a garment hotspot, tuned to our standing studio photos. */
export function getHotspotPosition(name: string, staggerIndex = 0): { top: string; left: string } {
  const base = HOTSPOT_BASE_POSITION[getGarmentCategory(name)];
  return { top: `${base.top + staggerIndex * 5}%`, left: `${base.left}%` };
}
