import React, { useState, useMemo } from 'react';
import {
  User,
  Users,
  Baby,
  Sparkles,
  CheckCircle2,
  Ruler,
  Scale,
  RotateCcw,
  Shirt,
  Scissors,
  Footprints,
  Shield,
  HelpCircle,
  ArrowRight,
  SlidersHorizontal,
  Info,
  Globe,
  Building2,
  ChevronDown,
  Check,
  Layers,
  Tag,
  ExternalLink,
  Loader2,
  Eye,
  X,
} from 'lucide-react';
import { MOCK_PRODUCTS } from '../data/mockData';
import { MockProduct } from '../types';
import {
  TESTER_BRANDS,
  TesterBrand,
  SizingSystemMode,
  MultiSystemRow,
  BrandCategory,
  BrandSubCategory,
} from '../data/sizingTesterBrands';

export type PersonaTarget = 'men' | 'women' | 'kid';
export type UnitSystem = 'metric' | 'imperial';
export type ParentCategoryKey = 'tops' | 'bottoms' | 'footwear' | 'outerwear' | 'dresses';

interface SizingRow {
  size: string;
  subLabel?: string;
  chestMin?: number;
  chestMax?: number;
  waistMin?: number;
  waistMax?: number;
  hipsMin?: number;
  hipsMax?: number;
  heightMin?: number;
  heightMax?: number;
  weightMin?: number;
  weightMax?: number;
  footLengthMin?: number;
  footLengthMax?: number;
  ageMin?: number;
  ageMax?: number;
  displayColumns: Record<string, string>;
}

interface CategoryTemplate {
  key: ParentCategoryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  applicablePersonas: PersonaTarget[];
  headers: string[];
  rows: Record<PersonaTarget, SizingRow[]>;
}

// ---------------------------------------------------------------------------
// Realistic Size Matrix Data (Metric base cm & kg)
// ---------------------------------------------------------------------------
const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    key: 'tops',
    label: 'Tops',
    icon: Shirt,
    applicablePersonas: ['men', 'women', 'kid'],
    headers: ['Size', 'Chest (cm)', 'Waist (cm)', 'Length (cm)', 'US Standard', 'EU Standard'],
    rows: {
      men: [
        { size: 'XS', chestMin: 80, chestMax: 87, waistMin: 68, waistMax: 73, displayColumns: { 'Size': 'XS', 'Chest (cm)': '80–87', 'Waist (cm)': '68–73', 'Length (cm)': '68', 'US Standard': '34', 'EU Standard': '44' } },
        { size: 'S', chestMin: 88, chestMax: 95, waistMin: 74, waistMax: 80, displayColumns: { 'Size': 'S', 'Chest (cm)': '88–95', 'Waist (cm)': '74–80', 'Length (cm)': '70', 'US Standard': '36–38', 'EU Standard': '46–48' } },
        { size: 'M', chestMin: 96, chestMax: 103, waistMin: 81, waistMax: 88, displayColumns: { 'Size': 'M', 'Chest (cm)': '96–103', 'Waist (cm)': '81–88', 'Length (cm)': '72', 'US Standard': '40', 'EU Standard': '50' } },
        { size: 'L', chestMin: 104, chestMax: 111, waistMin: 89, waistMax: 96, displayColumns: { 'Size': 'L', 'Chest (cm)': '104–111', 'Waist (cm)': '89–96', 'Length (cm)': '74', 'US Standard': '42–44', 'EU Standard': '52–54' } },
        { size: 'XL', chestMin: 112, chestMax: 121, waistMin: 97, waistMax: 106, displayColumns: { 'Size': 'XL', 'Chest (cm)': '112–121', 'Waist (cm)': '97–106', 'Length (cm)': '76', 'US Standard': '46', 'EU Standard': '56' } },
        { size: 'XXL', chestMin: 122, chestMax: 132, waistMin: 107, waistMax: 118, displayColumns: { 'Size': 'XXL', 'Chest (cm)': '122–132', 'Waist (cm)': '107–118', 'Length (cm)': '78', 'US Standard': '48–50', 'EU Standard': '58–60' } },
      ],
      women: [
        { size: 'XS', chestMin: 78, chestMax: 83, waistMin: 60, waistMax: 65, hipsMin: 86, hipsMax: 91, displayColumns: { 'Size': 'XS', 'Chest (cm)': '78–83', 'Waist (cm)': '60–65', 'Length (cm)': '62', 'US Standard': '0–2', 'EU Standard': '32–34' } },
        { size: 'S', chestMin: 84, chestMax: 89, waistMin: 66, waistMax: 71, hipsMin: 92, hipsMax: 97, displayColumns: { 'Size': 'S', 'Chest (cm)': '84–89', 'Waist (cm)': '66–71', 'Length (cm)': '64', 'US Standard': '4–6', 'EU Standard': '36–38' } },
        { size: 'M', chestMin: 90, chestMax: 96, waistMin: 72, waistMax: 78, hipsMin: 98, hipsMax: 104, displayColumns: { 'Size': 'M', 'Chest (cm)': '90–96', 'Waist (cm)': '72–78', 'Length (cm)': '66', 'US Standard': '8–10', 'EU Standard': '40–42' } },
        { size: 'L', chestMin: 97, chestMax: 104, waistMin: 79, waistMax: 86, hipsMin: 105, hipsMax: 112, displayColumns: { 'Size': 'L', 'Chest (cm)': '97–104', 'Waist (cm)': '79–86', 'Length (cm)': '68', 'US Standard': '12–14', 'EU Standard': '44–46' } },
        { size: 'XL', chestMin: 105, chestMax: 114, waistMin: 87, waistMax: 96, hipsMin: 113, hipsMax: 122, displayColumns: { 'Size': 'XL', 'Chest (cm)': '105–114', 'Waist (cm)': '87–96', 'Length (cm)': '70', 'US Standard': '16–18', 'EU Standard': '48–50' } },
      ],
      kid: [
        { size: '3-4Y (104)', heightMin: 98, heightMax: 104, chestMin: 54, chestMax: 57, waistMin: 50, waistMax: 53, ageMin: 3, ageMax: 4, displayColumns: { 'Size': '3-4Y', 'Chest (cm)': '54–57', 'Waist (cm)': '50–53', 'Length (cm)': '42', 'US Standard': '4T', 'EU Standard': '104' } },
        { size: '5-6Y (116)', heightMin: 105, heightMax: 116, chestMin: 58, chestMax: 61, waistMin: 54, waistMax: 56, ageMin: 5, ageMax: 6, displayColumns: { 'Size': '5-6Y', 'Chest (cm)': '58–61', 'Waist (cm)': '54–56', 'Length (cm)': '46', 'US Standard': '5-6', 'EU Standard': '116' } },
        { size: '7-8Y (128)', heightMin: 117, heightMax: 128, chestMin: 62, chestMax: 66, waistMin: 57, waistMax: 60, ageMin: 7, ageMax: 8, displayColumns: { 'Size': '7-8Y', 'Chest (cm)': '62–66', 'Waist (cm)': '57–60', 'Length (cm)': '50', 'US Standard': '7-8', 'EU Standard': '128' } },
        { size: '9-10Y (140)', heightMin: 129, heightMax: 140, chestMin: 67, chestMax: 72, waistMin: 61, waistMax: 64, ageMin: 9, ageMax: 10, displayColumns: { 'Size': '9-10Y', 'Chest (cm)': '67–72', 'Waist (cm)': '61–64', 'Length (cm)': '54', 'US Standard': '10', 'EU Standard': '140' } },
        { size: '11-12Y (152)', heightMin: 141, heightMax: 152, chestMin: 73, chestMax: 78, waistMin: 65, waistMax: 68, ageMin: 11, ageMax: 12, displayColumns: { 'Size': '11-12Y', 'Chest (cm)': '73–78', 'Waist (cm)': '65–68', 'Length (cm)': '58', 'US Standard': '12', 'EU Standard': '152' } },
        { size: '13-14Y (164)', heightMin: 153, heightMax: 164, chestMin: 79, chestMax: 85, waistMin: 69, waistMax: 73, ageMin: 13, ageMax: 14, displayColumns: { 'Size': '13-14Y', 'Chest (cm)': '79–85', 'Waist (cm)': '69–73', 'Length (cm)': '62', 'US Standard': '14', 'EU Standard': '164' } },
      ],
    },
  },
  {
    key: 'bottoms',
    label: 'Bottoms',
    icon: Scissors,
    applicablePersonas: ['men', 'women', 'kid'],
    headers: ['Size', 'Waist (cm)', 'Hips (cm)', 'Inseam (cm)', 'US Size', 'EU Size'],
    rows: {
      men: [
        { size: '28', waistMin: 70, waistMax: 73, hipsMin: 85, hipsMax: 89, displayColumns: { 'Size': '28', 'Waist (cm)': '70–73', 'Hips (cm)': '85–89', 'Inseam (cm)': '78', 'US Size': '28W', 'EU Size': '44' } },
        { size: '30', waistMin: 74, waistMax: 78, hipsMin: 90, hipsMax: 94, displayColumns: { 'Size': '30', 'Waist (cm)': '74–78', 'Hips (cm)': '90–94', 'Inseam (cm)': '80', 'US Size': '30W', 'EU Size': '46' } },
        { size: '32', waistMin: 79, waistMax: 84, hipsMin: 95, hipsMax: 100, displayColumns: { 'Size': '32', 'Waist (cm)': '79–84', 'Hips (cm)': '95–100', 'Inseam (cm)': '81', 'US Size': '32W', 'EU Size': '48' } },
        { size: '34', waistMin: 85, waistMax: 90, hipsMin: 101, hipsMax: 106, displayColumns: { 'Size': '34', 'Waist (cm)': '85–90', 'Hips (cm)': '101–106', 'Inseam (cm)': '82', 'US Size': '34W', 'EU Size': '50' } },
        { size: '36', waistMin: 91, waistMax: 96, hipsMin: 107, hipsMax: 112, displayColumns: { 'Size': '36', 'Waist (cm)': '91–96', 'Hips (cm)': '107–112', 'Inseam (cm)': '83', 'US Size': '36W', 'EU Size': '52' } },
        { size: '38', waistMin: 97, waistMax: 103, hipsMin: 113, hipsMax: 118, displayColumns: { 'Size': '38', 'Waist (cm)': '97–103', 'Hips (cm)': '113–118', 'Inseam (cm)': '83', 'US Size': '38W', 'EU Size': '54' } },
      ],
      women: [
        { size: '25 (XS)', waistMin: 62, waistMax: 65, hipsMin: 87, hipsMax: 90, displayColumns: { 'Size': '25', 'Waist (cm)': '62–65', 'Hips (cm)': '87–90', 'Inseam (cm)': '76', 'US Size': '0–2', 'EU Size': '32' } },
        { size: '27 (S)', waistMin: 66, waistMax: 70, hipsMin: 91, hipsMax: 95, displayColumns: { 'Size': '27', 'Waist (cm)': '66–70', 'Hips (cm)': '91–95', 'Inseam (cm)': '77', 'US Size': '4–6', 'EU Size': '34–36' } },
        { size: '29 (M)', waistMin: 71, waistMax: 76, hipsMin: 96, hipsMax: 101, displayColumns: { 'Size': '29', 'Waist (cm)': '71–76', 'Hips (cm)': '96–101', 'Inseam (cm)': '78', 'US Size': '8–10', 'EU Size': '38–40' } },
        { size: '31 (L)', waistMin: 77, waistMax: 83, hipsMin: 102, hipsMax: 108, displayColumns: { 'Size': '31', 'Waist (cm)': '77–83', 'Hips (cm)': '102–108', 'Inseam (cm)': '79', 'US Size': '12', 'EU Size': '42' } },
        { size: '33 (XL)', waistMin: 84, waistMax: 92, hipsMin: 109, hipsMax: 116, displayColumns: { 'Size': '33', 'Waist (cm)': '84–92', 'Hips (cm)': '109–116', 'Inseam (cm)': '79', 'US Size': '14–16', 'EU Size': '44–46' } },
      ],
      kid: [
        { size: '3-4Y', heightMin: 98, heightMax: 104, waistMin: 50, waistMax: 53, hipsMin: 55, hipsMax: 59, ageMin: 3, ageMax: 4, displayColumns: { 'Size': '3-4Y', 'Waist (cm)': '50–53', 'Hips (cm)': '55–59', 'Inseam (cm)': '40', 'US Size': '4T', 'EU Size': '104' } },
        { size: '5-6Y', heightMin: 105, heightMax: 116, waistMin: 54, waistMax: 56, hipsMin: 60, hipsMax: 64, ageMin: 5, ageMax: 6, displayColumns: { 'Size': '5-6Y', 'Waist (cm)': '54–56', 'Hips (cm)': '60–64', 'Inseam (cm)': '48', 'US Size': '5-6', 'EU Size': '116' } },
        { size: '7-8Y', heightMin: 117, heightMax: 128, waistMin: 57, waistMax: 60, hipsMin: 65, hipsMax: 70, ageMin: 7, ageMax: 8, displayColumns: { 'Size': '7-8Y', 'Waist (cm)': '57–60', 'Hips (cm)': '65–70', 'Inseam (cm)': '56', 'US Size': '7-8', 'EU Size': '128' } },
        { size: '9-10Y', heightMin: 129, heightMax: 140, waistMin: 61, waistMax: 64, hipsMin: 71, hipsMax: 76, ageMin: 9, ageMax: 10, displayColumns: { 'Size': '9-10Y', 'Waist (cm)': '61–64', 'Hips (cm)': '71–76', 'Inseam (cm)': '63', 'US Size': '10', 'EU Size': '140' } },
        { size: '11-12Y', heightMin: 141, heightMax: 152, waistMin: 65, waistMax: 68, hipsMin: 77, hipsMax: 83, ageMin: 11, ageMax: 12, displayColumns: { 'Size': '11-12Y', 'Waist (cm)': '65–68', 'Hips (cm)': '77–83', 'Inseam (cm)': '69', 'US Size': '12', 'EU Size': '152' } },
      ],
    },
  },
  {
    key: 'footwear',
    label: 'Footwear',
    icon: Footprints,
    applicablePersonas: ['men', 'women', 'kid'],
    headers: ['US Size', 'UK Size', 'EUR Size', 'Foot Length (cm)', 'Fit Width'],
    rows: {
      men: [
        { size: 'US 8.0', footLengthMin: 25.5, footLengthMax: 26.2, displayColumns: { 'US Size': '8.0', 'UK Size': '7.0', 'EUR Size': '41.0', 'Foot Length (cm)': '25.8–26.2', 'Fit Width': 'Standard D' } },
        { size: 'US 9.0', footLengthMin: 26.3, footLengthMax: 27.0, displayColumns: { 'US Size': '9.0', 'UK Size': '8.0', 'EUR Size': '42.5', 'Foot Length (cm)': '26.3–27.0', 'Fit Width': 'Standard D' } },
        { size: 'US 10.0', footLengthMin: 27.1, footLengthMax: 27.8, displayColumns: { 'US Size': '10.0', 'UK Size': '9.0', 'EUR Size': '44.0', 'Foot Length (cm)': '27.1–27.8', 'Fit Width': 'Standard D' } },
        { size: 'US 10.5', footLengthMin: 27.9, footLengthMax: 28.3, displayColumns: { 'US Size': '10.5', 'UK Size': '9.5', 'EUR Size': '44.5', 'Foot Length (cm)': '27.9–28.3', 'Fit Width': 'Standard D' } },
        { size: 'US 11.0', footLengthMin: 28.4, footLengthMax: 29.0, displayColumns: { 'US Size': '11.0', 'UK Size': '10.0', 'EUR Size': '45.0', 'Foot Length (cm)': '28.4–29.0', 'Fit Width': 'Standard D' } },
        { size: 'US 12.0', footLengthMin: 29.1, footLengthMax: 29.8, displayColumns: { 'US Size': '12.0', 'UK Size': '11.0', 'EUR Size': '46.5', 'Foot Length (cm)': '29.1–29.8', 'Fit Width': 'Standard D' } },
      ],
      women: [
        { size: 'US 6.0', footLengthMin: 22.2, footLengthMax: 22.8, displayColumns: { 'US Size': '6.0', 'UK Size': '3.5', 'EUR Size': '36.5', 'Foot Length (cm)': '22.2–22.8', 'Fit Width': 'Standard B' } },
        { size: 'US 7.0', footLengthMin: 22.9, footLengthMax: 23.6, displayColumns: { 'US Size': '7.0', 'UK Size': '4.5', 'EUR Size': '37.5', 'Foot Length (cm)': '22.9–23.6', 'Fit Width': 'Standard B' } },
        { size: 'US 8.0', footLengthMin: 23.7, footLengthMax: 24.5, displayColumns: { 'US Size': '8.0', 'UK Size': '5.5', 'EUR Size': '39.0', 'Foot Length (cm)': '23.7–24.5', 'Fit Width': 'Standard B' } },
        { size: 'US 8.5', footLengthMin: 24.6, footLengthMax: 25.0, displayColumns: { 'US Size': '8.5', 'UK Size': '6.0', 'EUR Size': '39.5', 'Foot Length (cm)': '24.6–25.0', 'Fit Width': 'Standard B' } },
        { size: 'US 9.0', footLengthMin: 25.1, footLengthMax: 25.7, displayColumns: { 'US Size': '9.0', 'UK Size': '6.5', 'EUR Size': '40.5', 'Foot Length (cm)': '25.1–25.7', 'Fit Width': 'Standard B' } },
        { size: 'US 10.0', footLengthMin: 25.8, footLengthMax: 26.5, displayColumns: { 'US Size': '10.0', 'UK Size': '7.5', 'EUR Size': '41.5', 'Foot Length (cm)': '25.8–26.5', 'Fit Width': 'Standard B' } },
      ],
      kid: [
        { size: 'US 10C', footLengthMin: 15.5, footLengthMax: 16.5, displayColumns: { 'US Size': '10C', 'UK Size': '9.5', 'EUR Size': '27.0', 'Foot Length (cm)': '15.5–16.5', 'Fit Width': 'Kids Standard' } },
        { size: 'US 12C', footLengthMin: 16.6, footLengthMax: 18.0, displayColumns: { 'US Size': '12C', 'UK Size': '11.5', 'EUR Size': '29.5', 'Foot Length (cm)': '16.6–18.0', 'Fit Width': 'Kids Standard' } },
        { size: 'US 1Y', footLengthMin: 18.1, footLengthMax: 19.5, displayColumns: { 'US Size': '1Y', 'UK Size': '13.5', 'EUR Size': '32.0', 'Foot Length (cm)': '18.1–19.5', 'Fit Width': 'Youth Standard' } },
        { size: 'US 2.5Y', footLengthMin: 19.6, footLengthMax: 21.0, displayColumns: { 'US Size': '2.5Y', 'UK Size': '2.0', 'EUR Size': '34.0', 'Foot Length (cm)': '19.6–21.0', 'Fit Width': 'Youth Standard' } },
        { size: 'US 4Y', footLengthMin: 21.1, footLengthMax: 22.5, displayColumns: { 'US Size': '4Y', 'UK Size': '3.5', 'EUR Size': '36.0', 'Foot Length (cm)': '21.1–22.5', 'Fit Width': 'Youth Standard' } },
      ],
    },
  },
  {
    key: 'outerwear',
    label: 'Outerwear',
    icon: Shield,
    applicablePersonas: ['men', 'women', 'kid'],
    headers: ['Size', 'Chest (cm)', 'Torso Length (cm)', 'Sleeve (cm)', 'Layering Allowance'],
    rows: {
      men: [
        { size: 'S', chestMin: 88, chestMax: 95, displayColumns: { 'Size': 'S', 'Chest (cm)': '90–97', 'Torso Length (cm)': '71', 'Sleeve (cm)': '84', 'Layering Allowance': '+4 cm Relaxed' } },
        { size: 'M', chestMin: 96, chestMax: 103, displayColumns: { 'Size': 'M', 'Chest (cm)': '98–105', 'Torso Length (cm)': '73', 'Sleeve (cm)': '86', 'Layering Allowance': '+4 cm Relaxed' } },
        { size: 'L', chestMin: 104, chestMax: 111, displayColumns: { 'Size': 'L', 'Chest (cm)': '106–113', 'Torso Length (cm)': '75', 'Sleeve (cm)': '88', 'Layering Allowance': '+4 cm Relaxed' } },
        { size: 'XL', chestMin: 112, chestMax: 121, displayColumns: { 'Size': 'XL', 'Chest (cm)': '114–123', 'Torso Length (cm)': '77', 'Sleeve (cm)': '90', 'Layering Allowance': '+4 cm Relaxed' } },
        { size: 'XXL', chestMin: 122, chestMax: 132, displayColumns: { 'Size': 'XXL', 'Chest (cm)': '124–134', 'Torso Length (cm)': '79', 'Sleeve (cm)': '92', 'Layering Allowance': '+5 cm Relaxed' } },
      ],
      women: [
        { size: 'XS', chestMin: 78, chestMax: 83, displayColumns: { 'Size': 'XS', 'Chest (cm)': '82–87', 'Torso Length (cm)': '64', 'Sleeve (cm)': '79', 'Layering Allowance': '+3 cm Tailored' } },
        { size: 'S', chestMin: 84, chestMax: 89, displayColumns: { 'Size': 'S', 'Chest (cm)': '88–93', 'Torso Length (cm)': '66', 'Sleeve (cm)': '81', 'Layering Allowance': '+3 cm Tailored' } },
        { size: 'M', chestMin: 90, chestMax: 96, displayColumns: { 'Size': 'M', 'Chest (cm)': '94–100', 'Torso Length (cm)': '68', 'Sleeve (cm)': '83', 'Layering Allowance': '+4 cm Relaxed' } },
        { size: 'L', chestMin: 97, chestMax: 104, displayColumns: { 'Size': 'L', 'Chest (cm)': '101–108', 'Torso Length (cm)': '70', 'Sleeve (cm)': '85', 'Layering Allowance': '+4 cm Relaxed' } },
        { size: 'XL', chestMin: 105, chestMax: 114, displayColumns: { 'Size': 'XL', 'Chest (cm)': '109–118', 'Torso Length (cm)': '72', 'Sleeve (cm)': '87', 'Layering Allowance': '+4 cm Relaxed' } },
      ],
      kid: [
        { size: '3-4Y', heightMin: 98, heightMax: 104, chestMin: 54, chestMax: 57, displayColumns: { 'Size': '3-4Y', 'Chest (cm)': '58–62', 'Torso Length (cm)': '45', 'Sleeve (cm)': '41', 'Layering Allowance': '+4 cm Warmth' } },
        { size: '5-6Y', heightMin: 105, heightMax: 116, chestMin: 58, chestMax: 61, displayColumns: { 'Size': '5-6Y', 'Chest (cm)': '62–66', 'Torso Length (cm)': '49', 'Sleeve (cm)': '46', 'Layering Allowance': '+4 cm Warmth' } },
        { size: '7-8Y', heightMin: 117, heightMax: 128, chestMin: 62, chestMax: 66, displayColumns: { 'Size': '7-8Y', 'Chest (cm)': '67–71', 'Torso Length (cm)': '54', 'Sleeve (cm)': '51', 'Layering Allowance': '+5 cm Warmth' } },
        { size: '9-10Y', heightMin: 129, heightMax: 140, chestMin: 67, chestMax: 72, displayColumns: { 'Size': '9-10Y', 'Chest (cm)': '72–77', 'Torso Length (cm)': '58', 'Sleeve (cm)': '56', 'Layering Allowance': '+5 cm Warmth' } },
      ],
    },
  },
  {
    key: 'dresses',
    label: 'Dresses',
    icon: Sparkles,
    applicablePersonas: ['women', 'kid'],
    headers: ['Size', 'Bust (cm)', 'Waist (cm)', 'Hips (cm)', 'Dress Length (cm)', 'US Size'],
    rows: {
      men: [],
      women: [
        { size: 'XS (US 0-2)', chestMin: 78, chestMax: 83, waistMin: 60, waistMax: 65, hipsMin: 86, hipsMax: 91, displayColumns: { 'Size': 'XS', 'Bust (cm)': '78–83', 'Waist (cm)': '60–65', 'Hips (cm)': '86–91', 'Dress Length (cm)': '92', 'US Size': '0–2' } },
        { size: 'S (US 4-6)', chestMin: 84, chestMax: 89, waistMin: 66, waistMax: 71, hipsMin: 92, hipsMax: 97, displayColumns: { 'Size': 'S', 'Bust (cm)': '84–89', 'Waist (cm)': '66–71', 'Hips (cm)': '92–97', 'Dress Length (cm)': '94', 'US Size': '4–6' } },
        { size: 'M (US 8-10)', chestMin: 90, chestMax: 96, waistMin: 72, waistMax: 78, hipsMin: 98, hipsMax: 104, displayColumns: { 'Size': 'M', 'Bust (cm)': '90–96', 'Waist (cm)': '72–78', 'Hips (cm)': '98–104', 'Dress Length (cm)': '96', 'US Size': '8–10' } },
        { size: 'L (US 12-14)', chestMin: 97, chestMax: 104, waistMin: 79, waistMax: 86, hipsMin: 105, hipsMax: 112, displayColumns: { 'Size': 'L', 'Bust (cm)': '97–104', 'Waist (cm)': '79–86', 'Hips (cm)': '105–112', 'Dress Length (cm)': '98', 'US Size': '12–14' } },
        { size: 'XL (US 16)', chestMin: 105, chestMax: 114, waistMin: 87, waistMax: 96, hipsMin: 113, hipsMax: 122, displayColumns: { 'Size': 'XL', 'Bust (cm)': '105–114', 'Waist (cm)': '87–96', 'Hips (cm)': '113–122', 'Dress Length (cm)': '100', 'US Size': '16' } },
      ],
      kid: [
        { size: '3-4Y', heightMin: 98, heightMax: 104, chestMin: 54, chestMax: 57, waistMin: 50, waistMax: 53, hipsMin: 55, hipsMax: 59, ageMin: 3, ageMax: 4, displayColumns: { 'Size': '3-4Y', 'Bust (cm)': '54–57', 'Waist (cm)': '50–53', 'Hips (cm)': '55–59', 'Dress Length (cm)': '54', 'US Size': '4T' } },
        { size: '5-6Y', heightMin: 105, heightMax: 116, chestMin: 58, chestMax: 61, waistMin: 54, waistMax: 56, hipsMin: 60, hipsMax: 64, ageMin: 5, ageMax: 6, displayColumns: { 'Size': '5-6Y', 'Bust (cm)': '58–61', 'Waist (cm)': '54–56', 'Hips (cm)': '60–64', 'Dress Length (cm)': '62', 'US Size': '5-6' } },
        { size: '7-8Y', heightMin: 117, heightMax: 128, chestMin: 62, chestMax: 66, waistMin: 57, waistMax: 60, hipsMin: 65, hipsMax: 70, ageMin: 7, ageMax: 8, displayColumns: { 'Size': '7-8Y', 'Bust (cm)': '62–66', 'Waist (cm)': '57–60', 'Hips (cm)': '65–70', 'Dress Length (cm)': '70', 'US Size': '7-8' } },
        { size: '9-10Y', heightMin: 129, heightMax: 140, chestMin: 67, chestMax: 72, waistMin: 61, waistMax: 64, hipsMin: 71, hipsMax: 76, ageMin: 9, ageMax: 10, displayColumns: { 'Size': '9-10Y', 'Bust (cm)': '67–72', 'Waist (cm)': '61–64', 'Hips (cm)': '71–76', 'Dress Length (cm)': '78', 'US Size': '10' } },
      ],
    },
  },
];

export function SizingTesterView() {
  // Target Persona
  const [persona, setPersona] = useState<PersonaTarget>('men');

  // Units
  const [unit, setUnit] = useState<UnitSystem>('metric');

  // Adult Inputs (Men / Women) in Metric base
  const [adultChest, setAdultChest] = useState<number>(98);
  const [adultWaist, setAdultWaist] = useState<number>(84);
  const [adultHips, setAdultHips] = useState<number>(99);
  const [adultLength, setAdultLength] = useState<number>(178);
  const [adultWeight, setAdultWeight] = useState<number>(75);
  const [adultFootLength, setAdultFootLength] = useState<number>(27.0);

  // Kid Inputs in Metric base
  const [kidAge, setKidAge] = useState<number>(7);
  const [kidHeight, setKidHeight] = useState<number>(124);
  const [kidChest, setKidChest] = useState<number>(63);
  const [kidWaist, setKidWaist] = useState<number>(58);
  const [kidHips, setKidHips] = useState<number>(66);
  const [kidFootLength, setKidFootLength] = useState<number>(19.8);

  // Selected Brand on right
  const [selectedBrandId, setSelectedBrandId] = useState<string>('nike');

  // Selected Category on right
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<ParentCategoryKey>('tops');

  // Selected Subcategory on right
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('nike-tops-tees');

  // Sizing standard mode: US, EU, UK
  const [sizingMode, setSizingMode] = useState<SizingSystemMode>('us');

  // Search / Run trigger timestamp to indicate active search
  const [hasCalculated, setHasCalculated] = useState<boolean>(true);
  const [calculationPulse, setCalculationPulse] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Popup Modal for items with suitable size
  const [activeSizeItemsModal, setActiveSizeItemsModal] = useState<{
    sizeLabel: string;
    formattedSize: string;
    row: MultiSystemRow;
  } | null>(null);

  // Filter brands that support the current persona (or all brands if they have at least 1 category)
  const availableBrands = useMemo(() => {
    return TESTER_BRANDS.filter((brand) =>
      brand.categories.some((cat) =>
        cat.subcategories.some((sub) => sub.rowsByPersona[persona]?.length > 0)
      )
    );
  }, [persona]);

  // Current active brand
  const currentBrand = useMemo(() => {
    return (
      availableBrands.find((b) => b.id === selectedBrandId) ||
      availableBrands[0] ||
      TESTER_BRANDS[0]
    );
  }, [availableBrands, selectedBrandId]);

  // Ensure selected brand is in available brands
  React.useEffect(() => {
    if (!availableBrands.some((b) => b.id === selectedBrandId)) {
      if (availableBrands[0]) {
        setSelectedBrandId(availableBrands[0].id);
      }
    }
  }, [availableBrands, selectedBrandId]);

  // Available categories for current brand and persona
  const brandCategories = useMemo(() => {
    return currentBrand.categories.filter((cat) =>
      cat.subcategories.some((sub) => sub.rowsByPersona[persona]?.length > 0)
    );
  }, [currentBrand, persona]);

  // Ensure selected category is valid for this brand & persona
  React.useEffect(() => {
    if (!brandCategories.some((c) => c.key === selectedCategoryKey)) {
      if (brandCategories[0]) {
        setSelectedCategoryKey(brandCategories[0].key);
      }
    }
  }, [brandCategories, selectedCategoryKey]);

  // Active category object
  const currentCategory = useMemo(() => {
    return (
      brandCategories.find((c) => c.key === selectedCategoryKey) ||
      brandCategories[0]
    );
  }, [brandCategories, selectedCategoryKey]);

  // Available subcategories under the active category for current persona
  const availableSubcategories = useMemo(() => {
    if (!currentCategory) return [];
    return currentCategory.subcategories.filter(
      (sub) => sub.rowsByPersona[persona]?.length > 0
    );
  }, [currentCategory, persona]);

  // Ensure selected subcategory is valid
  React.useEffect(() => {
    if (!availableSubcategories.some((s) => s.id === selectedSubcategoryId)) {
      if (availableSubcategories[0]) {
        setSelectedSubcategoryId(availableSubcategories[0].id);
      }
    }
  }, [availableSubcategories, selectedSubcategoryId]);

  // Active subcategory object
  const currentSubcategory = useMemo(() => {
    return (
      availableSubcategories.find((s) => s.id === selectedSubcategoryId) ||
      availableSubcategories[0]
    );
  }, [availableSubcategories, selectedSubcategoryId]);

  // Rows for the active subcategory
  const activeRows: MultiSystemRow[] = useMemo(() => {
    if (!currentSubcategory) return [];
    return currentSubcategory.rowsByPersona[persona] || [];
  }, [currentSubcategory, persona]);

  // Helper conversions
  const cmToIn = (cm: number) => Number((cm / 2.54).toFixed(1));
  const inToCm = (inches: number) => Number((inches * 2.54).toFixed(1));
  const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
  const lbsToKg = (lbs: number) => Math.round(lbs / 2.20462);

  // Category Icon Resolver
  const getCategoryIcon = (key: ParentCategoryKey) => {
    switch (key) {
      case 'tops':
        return Shirt;
      case 'bottoms':
        return Scissors;
      case 'footwear':
        return Footprints;
      case 'outerwear':
        return Shield;
      case 'dresses':
        return Sparkles;
      default:
        return Shirt;
    }
  };

  // Sizing System Display Formatter
  const formatSizeForMode = (row: MultiSystemRow, mode: SizingSystemMode): string => {
    if (!row) return '—';
    if (mode === 'us') return row.usSize || row.sizeLabel;
    if (mode === 'eu') return row.euSize || row.sizeLabel;
    if (mode === 'uk') return row.ukSize || row.sizeLabel;
    return row.sizeLabel;
  };

  // Matching Engine: finds best row in a given row array
  const calculateBestMatch = (
    rows: MultiSystemRow[],
    catKey: ParentCategoryKey,
    brandName: string,
    subcatName: string
  ): { bestRowIndex: number; bestRow: MultiSystemRow | null; matchScore: number; reason: string } => {
    if (!rows || rows.length === 0) {
      return { bestRowIndex: -1, bestRow: null, matchScore: 0, reason: '' };
    }

    let bestIndex = 0;
    let minDistance = Number.MAX_VALUE;

    rows.forEach((row, index) => {
      let currentDistance = 0;
      let factorCount = 0;

      if (persona === 'kid') {
        if (row.heightMin && row.heightMax) {
          const mid = (row.heightMin + row.heightMax) / 2;
          currentDistance += Math.abs(kidHeight - mid) * 1.5;
          factorCount++;
        }
        if (row.ageMin && row.ageMax) {
          const mid = (row.ageMin + row.ageMax) / 2;
          currentDistance += Math.abs(kidAge - mid) * 3.8;
          factorCount++;
        }
        if (row.chestMin && row.chestMax) {
          const mid = (row.chestMin + row.chestMax) / 2;
          currentDistance += Math.abs(kidChest - mid) * 2.0;
          factorCount++;
        }
        if (row.waistMin && row.waistMax) {
          const mid = (row.waistMin + row.waistMax) / 2;
          currentDistance += Math.abs(kidWaist - mid) * 1.8;
          factorCount++;
        }
        if (catKey === 'footwear' && row.footLengthMin && row.footLengthMax) {
          const mid = (row.footLengthMin + row.footLengthMax) / 2;
          currentDistance = Math.abs(kidFootLength - mid) * 10;
          factorCount = 1;
        }
      } else {
        // Adult Men or Women
        if (catKey === 'footwear') {
          if (row.footLengthMin && row.footLengthMax) {
            const mid = (row.footLengthMin + row.footLengthMax) / 2;
            currentDistance = Math.abs(adultFootLength - mid) * 8.5;
            factorCount = 1;
          }
        } else if (catKey === 'bottoms') {
          if (row.waistMin && row.waistMax) {
            const mid = (row.waistMin + row.waistMax) / 2;
            currentDistance += Math.abs(adultWaist - mid) * 2.6;
            factorCount++;
          }
          if (row.hipsMin && row.hipsMax) {
            const mid = (row.hipsMin + row.hipsMax) / 2;
            currentDistance += Math.abs(adultHips - mid) * 1.6;
            factorCount++;
          }
        } else if (catKey === 'dresses') {
          if (row.chestMin && row.chestMax) {
            const mid = (row.chestMin + row.chestMax) / 2;
            currentDistance += Math.abs(adultChest - mid) * 2.2;
            factorCount++;
          }
          if (row.waistMin && row.waistMax) {
            const mid = (row.waistMin + row.waistMax) / 2;
            currentDistance += Math.abs(adultWaist - mid) * 2.0;
            factorCount++;
          }
          if (row.hipsMin && row.hipsMax) {
            const mid = (row.hipsMin + row.hipsMax) / 2;
            currentDistance += Math.abs(adultHips - mid) * 1.5;
            factorCount++;
          }
        } else {
          // Tops or Outerwear
          if (row.chestMin && row.chestMax) {
            const mid = (row.chestMin + row.chestMax) / 2;
            currentDistance += Math.abs(adultChest - mid) * 2.5;
            factorCount++;
          }
          if (row.waistMin && row.waistMax) {
            const mid = (row.waistMin + row.waistMax) / 2;
            currentDistance += Math.abs(adultWaist - mid) * 1.2;
            factorCount++;
          }
        }
      }

      const normalizedDist = factorCount > 0 ? currentDistance / factorCount : currentDistance;
      if (normalizedDist < minDistance) {
        minDistance = normalizedDist;
        bestIndex = index;
      }
    });

    const chosenRow = rows[bestIndex];
    if (!chosenRow) return { bestRowIndex: 0, bestRow: null, matchScore: 92, reason: '' };

    let bestReason = '';
    if (persona === 'kid') {
      bestReason =
        catKey === 'footwear'
          ? `Foot length ${kidFootLength} cm precisely matches ${brandName} ${chosenRow.sizeLabel}`
          : `Height ${kidHeight} cm & Age ${kidAge} align directly with ${brandName} ${chosenRow.sizeLabel}`;
    } else {
      if (catKey === 'footwear') {
        bestReason = `Foot length ${adultFootLength} cm aligns directly with ${brandName} ${chosenRow.sizeLabel}`;
      } else if (catKey === 'bottoms') {
        bestReason = `Waist ${adultWaist} cm & Hips ${adultHips} cm align with ${brandName} ${chosenRow.sizeLabel}`;
      } else {
        bestReason = `Chest ${adultChest} cm & Waist ${adultWaist} cm fit ${brandName} ${chosenRow.sizeLabel}`;
      }
    }

    const calculatedScore = Math.max(92, Math.min(99.5, Math.round((100 - minDistance * 1.1) * 10) / 10));

    return {
      bestRowIndex: bestIndex,
      bestRow: chosenRow,
      matchScore: calculatedScore,
      reason: bestReason,
    };
  };

  // Active subcategory recommendation
  const activeRecommendation = useMemo(() => {
    return calculateBestMatch(
      activeRows,
      selectedCategoryKey,
      currentBrand.name,
      currentSubcategory?.name || 'Selected Garment'
    );
  }, [
    activeRows,
    selectedCategoryKey,
    currentBrand.name,
    currentSubcategory?.name,
    persona,
    adultChest,
    adultWaist,
    adultHips,
    adultLength,
    adultWeight,
    adultFootLength,
    kidAge,
    kidHeight,
    kidChest,
    kidWaist,
    kidHips,
    kidFootLength,
  ]);

  // Precompute recommendations for all categories of the active brand
  const categoryRecommendations = useMemo(() => {
    const map: Record<
      string,
      { bestSizeLabel: string; formattedBestSize: string; matchScore: number; reason: string }
    > = {};

    brandCategories.forEach((cat) => {
      const firstSub = cat.subcategories.find((s) => s.rowsByPersona[persona]?.length > 0);
      if (firstSub) {
        const rows = firstSub.rowsByPersona[persona] || [];
        const result = calculateBestMatch(rows, cat.key, currentBrand.name, firstSub.name);
        map[cat.key] = {
          bestSizeLabel: result.bestRow?.sizeLabel || '—',
          formattedBestSize: result.bestRow ? formatSizeForMode(result.bestRow, sizingMode) : '—',
          matchScore: result.matchScore,
          reason: result.reason,
        };
      } else {
        map[cat.key] = {
          bestSizeLabel: '—',
          formattedBestSize: '—',
          matchScore: 0,
          reason: 'No data',
        };
      }
    });

    return map;
  }, [
    brandCategories,
    currentBrand.name,
    persona,
    sizingMode,
    adultChest,
    adultWaist,
    adultHips,
    adultLength,
    adultWeight,
    adultFootLength,
    kidAge,
    kidHeight,
    kidChest,
    kidWaist,
    kidHips,
    kidFootLength,
  ]);

  const handleRunTest = () => {
    setIsAnalyzing(true);
    setHasCalculated(true);
    setCalculationPulse((prev) => prev + 1);
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 650);
  };

  const handleResetDefaults = () => {
    if (persona === 'men') {
      setAdultChest(98);
      setAdultWaist(84);
      setAdultHips(99);
      setAdultLength(178);
      setAdultWeight(75);
      setAdultFootLength(27.0);
    } else if (persona === 'women') {
      setAdultChest(88);
      setAdultWaist(70);
      setAdultHips(95);
      setAdultLength(166);
      setAdultWeight(61);
      setAdultFootLength(24.2);
    } else {
      setKidAge(7);
      setKidHeight(124);
      setKidChest(63);
      setKidWaist(58);
      setKidHips(66);
      setKidFootLength(19.8);
    }
    setHasCalculated(true);
  };

  // Helper to find suitable items from catalog for a clicked row's size
  const getSuitableItemsForSize = (row: MultiSystemRow, formattedSize: string): MockProduct[] => {
    // Collect possible size tokens to match against
    const sizeTokens = new Set<string>();
    if (row.sizeLabel) sizeTokens.add(row.sizeLabel.toUpperCase().trim());
    if (formattedSize) sizeTokens.add(formattedSize.toUpperCase().trim());
    if (row.usSize) sizeTokens.add(row.usSize.toUpperCase().trim());
    if (row.euSize) sizeTokens.add(row.euSize.toUpperCase().trim());
    if (row.ukSize) sizeTokens.add(row.ukSize.toUpperCase().trim());

    // Normalize category keywords
    const catMap: Record<ParentCategoryKey, string[]> = {
      tops: ['tops', 'shirts', 'activewear', 'hoodies', 'sweatshirts', 'tees'],
      bottoms: ['bottoms', 'pants', 'jeans', 'denim', 'trousers', 'shorts'],
      footwear: ['footwear', 'sneakers', 'shoes', 'runners'],
      outerwear: ['outerwear', 'jackets', 'blazers', 'coats'],
      dresses: ['dresses', 'dress', 'full-body'],
    };
    const targetKeywords = catMap[selectedCategoryKey] || [];

    // Filter MOCK_PRODUCTS
    const matchingProducts = MOCK_PRODUCTS.filter((prod) => {
      // Check category match
      const pCat = (prod.parentCategory || '').toLowerCase();
      const pSub = (prod.subCategory || '').toLowerCase();
      const pFullCat = (prod.category || '').toLowerCase();
      const matchesCat =
        targetKeywords.some((kw) => pCat.includes(kw) || pSub.includes(kw) || pFullCat.includes(kw)) ||
        pCat === selectedCategoryKey.toLowerCase();

      // Check size match
      const productSizes = (prod.sizes || []).concat(prod.canonicalSizes || []).map((s) => s.toUpperCase());
      const hasSizeMatch = Array.from(sizeTokens).some((token) =>
        productSizes.some((ps) => {
          if (ps === token) return true;
          if (ps.includes(token) || token.includes(ps)) return true;
          // numeric match e.g. "32" in "32x32"
          const cleanPs = ps.replace(/[^a-zA-Z0-9]/g, ' ');
          const cleanTok = token.replace(/[^a-zA-Z0-9]/g, ' ');
          return cleanPs.split(' ').includes(token) || cleanTok.split(' ').includes(ps);
        })
      );

      // Prioritize brand match if possible, but allow catalog products in same category
      return matchesCat && hasSizeMatch;
    });

    // If exact category + size has results, return them
    if (matchingProducts.length > 0) {
      // Sort brand matches first
      return matchingProducts.sort((a, b) => {
        const aBrandMatch = a.brand.toLowerCase() === currentBrand.name.toLowerCase() ? -1 : 1;
        const bBrandMatch = b.brand.toLowerCase() === currentBrand.name.toLowerCase() ? -1 : 1;
        return aBrandMatch - bBrandMatch;
      });
    }

    // Fallback: any product in same parent category
    const catFallback = MOCK_PRODUCTS.filter((prod) => {
      const pCat = (prod.parentCategory || '').toLowerCase();
      const pSub = (prod.subCategory || '').toLowerCase();
      return targetKeywords.some((kw) => pCat.includes(kw) || pSub.includes(kw));
    });

    return catFallback.length > 0 ? catFallback : MOCK_PRODUCTS.slice(0, 4);
  };

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 bg-purple-100/90 px-2.5 py-0.5 rounded-full border border-purple-200">
              <Sparkles className="w-3 h-3 text-purple-600" />
              Interactive Sizing Engine
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs text-slate-500 font-medium">Smart Fit Matcher</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Sizing Tester &amp; Fit Simulator
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Test any body measurements against mapped brand sizing templates with real-time row highlighting.
          </p>
        </div>

        {/* Global Controls: Metric Standard & Reset */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 text-slate-700 border border-slate-200 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-purple-600" />
            <span>Metric (cm / kg)</span>
          </span>

          <button
            type="button"
            onClick={handleResetDefaults}
            title="Reset to sample body dimensions"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>
        </div>
      </div>

      {/* Main Grid: Left Side Controls | Right Side Size Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Persona Selection & Dimension Inputs                         */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
            {/* Step 1: Who is sizing for? */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                1. Sizing Target
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {/* Men */}
                <button
                  type="button"
                  onClick={() => {
                    setPersona('men');
                    setHasCalculated(true);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    persona === 'men'
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <User className={`w-5 h-5 mb-1.5 ${persona === 'men' ? 'text-purple-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold">Men</span>
                  <span className="text-[10px] text-slate-400">Adult Menswear</span>
                </button>

                {/* Women */}
                <button
                  type="button"
                  onClick={() => {
                    setPersona('women');
                    setHasCalculated(true);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    persona === 'women'
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Users className={`w-5 h-5 mb-1.5 ${persona === 'women' ? 'text-purple-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold">Women</span>
                  <span className="text-[10px] text-slate-400">Adult Fashion</span>
                </button>

                {/* Kid */}
                <button
                  type="button"
                  onClick={() => {
                    setPersona('kid');
                    setHasCalculated(true);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    persona === 'kid'
                      ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-2xs ring-2 ring-purple-200'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Baby className={`w-5 h-5 mb-1.5 ${persona === 'kid' ? 'text-purple-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold">Kid</span>
                  <span className="text-[10px] text-slate-400">Junior &amp; Toddler</span>
                </button>
              </div>
            </div>

            {/* Step 2: Input Dimensions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Body Dimensions (Metric cm, kg)
                </label>
                <span className="text-[11px] text-slate-400 font-medium">Real-time match</span>
              </div>

              {persona === 'kid' ? (
                /* KID INPUTS: Age, Height, Chest, Waist, Hip, Foot Length */
                <div className="space-y-3.5">
                  {/* Age */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Child Age</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="2"
                        max="16"
                        step="1"
                        value={kidAge}
                        onChange={(e) => setKidAge(Number(e.target.value))}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          min="2"
                          max="16"
                          value={kidAge}
                          onChange={(e) => setKidAge(Math.max(2, Math.min(16, Number(e.target.value))))}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">yr</span>
                      </div>
                    </div>
                  </div>

                  {/* Height */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Child Height</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 85 : 33}
                        max={unit === 'metric' ? 170 : 67}
                        step="1"
                        value={unit === 'metric' ? kidHeight : cmToIn(kidHeight)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidHeight(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidHeight : cmToIn(kidHeight)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidHeight(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Chest */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Chest Circumference</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 48 : 19}
                        max={unit === 'metric' ? 88 : 35}
                        step="1"
                        value={unit === 'metric' ? kidChest : cmToIn(kidChest)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidChest(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidChest : cmToIn(kidChest)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidChest(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Waist */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Waist</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 46 : 18}
                        max={unit === 'metric' ? 76 : 30}
                        step="1"
                        value={unit === 'metric' ? kidWaist : cmToIn(kidWaist)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidWaist(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidWaist : cmToIn(kidWaist)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidWaist(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hip */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Hips</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 50 : 20}
                        max={unit === 'metric' ? 88 : 35}
                        step="1"
                        value={unit === 'metric' ? kidHips : cmToIn(kidHips)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidHips(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? kidHips : cmToIn(kidHips)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidHips(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Foot Length */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Foot Length</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 14 : 5.5}
                        max={unit === 'metric' ? 24 : 9.5}
                        step="0.5"
                        value={unit === 'metric' ? kidFootLength : cmToIn(kidFootLength)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setKidFootLength(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          step="0.1"
                          value={unit === 'metric' ? kidFootLength : cmToIn(kidFootLength)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setKidFootLength(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* MEN / WOMEN INPUTS: Chest, Waist, Hips, Length, Weight, Foot Length */
                <div className="space-y-3.5">
                  {/* Chest / Bust */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">
                      {persona === 'women' ? 'Bust / Chest' : 'Chest Circumference'}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 75 : 30}
                        max={unit === 'metric' ? 135 : 54}
                        step="1"
                        value={unit === 'metric' ? adultChest : cmToIn(adultChest)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultChest(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultChest : cmToIn(adultChest)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultChest(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Waist */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Natural Waist</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 58 : 23}
                        max={unit === 'metric' ? 120 : 48}
                        step="1"
                        value={unit === 'metric' ? adultWaist : cmToIn(adultWaist)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultWaist(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultWaist : cmToIn(adultWaist)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultWaist(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Hips */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Hips / Seat</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 80 : 31}
                        max={unit === 'metric' ? 135 : 53}
                        step="1"
                        value={unit === 'metric' ? adultHips : cmToIn(adultHips)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultHips(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultHips : cmToIn(adultHips)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultHips(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Body Length / Height */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Body Height / Length</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 150 : 59}
                        max={unit === 'metric' ? 205 : 81}
                        step="1"
                        value={unit === 'metric' ? adultLength : cmToIn(adultLength)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultLength(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultLength : cmToIn(adultLength)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultLength(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Body Weight</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 45 : 99}
                        max={unit === 'metric' ? 130 : 286}
                        step="1"
                        value={unit === 'metric' ? adultWeight : kgToLbs(adultWeight)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultWeight(unit === 'metric' ? val : lbsToKg(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          value={unit === 'metric' ? adultWeight : kgToLbs(adultWeight)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultWeight(unit === 'metric' ? val : lbsToKg(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'kg' : 'lbs'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Foot Length */}
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold text-slate-700">Foot Length</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={unit === 'metric' ? 21.0 : 8.2}
                        max={unit === 'metric' ? 31.0 : 12.2}
                        step="0.2"
                        value={unit === 'metric' ? adultFootLength : cmToIn(adultFootLength)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdultFootLength(unit === 'metric' ? val : inToCm(val));
                        }}
                        className="w-24 accent-purple-600 cursor-pointer"
                      />
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-20 shadow-2xs">
                        <input
                          type="number"
                          step="0.1"
                          value={unit === 'metric' ? adultFootLength : cmToIn(adultFootLength)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAdultFootLength(unit === 'metric' ? val : inToCm(val));
                          }}
                          className="w-full text-center font-bold text-xs text-slate-800 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">
                          {unit === 'metric' ? 'cm' : 'in'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button: Found Sizes */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleRunTest}
                  disabled={isAnalyzing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all cursor-pointer transform active:scale-[0.99] disabled:opacity-85"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                      <span>Calibrating Brand Matrix...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Found Sizes</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Brand > Horizontal Categories > Subcategory & Size Chart   */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden relative min-h-[620px]">
            {isAnalyzing ? (
              <div className="py-32 px-6 flex flex-col items-center justify-center text-center bg-white min-h-[620px]">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200/90 flex items-center justify-center text-purple-600 shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  </div>
                  <div className="absolute -inset-2 rounded-3xl bg-purple-500/15 blur-lg -z-10 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-600 animate-bounce" />
                  <h3 className="text-base font-black text-slate-900">
                    Calibrating {currentBrand.name} Fit Sizing...
                  </h3>
                </div>
                <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                  Cross-referencing {persona.toUpperCase()} dimensions (Chest {persona === 'kid' ? kidChest : adultChest} cm, Waist {persona === 'kid' ? kidWaist : adultWaist} cm, Hips {persona === 'kid' ? kidHips : adultHips} cm) against verified {currentBrand.name} patterns in <strong className="text-purple-700">{sizingMode.toUpperCase()} Sizing Standard</strong>.
                </p>
                {/* Animated progress bar */}
                <div className="w-72 h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 mb-4">
                  <div className="h-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 rounded-full animate-pulse w-5/6" />
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400">
                  <span className="flex items-center gap-1 text-purple-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Grading Rules</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-purple-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Ease Allowances</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-purple-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Optimal Row</span>
                </div>
              </div>
            ) : (
              <>
                {/* Header Control Panel: Brand & Sizing Mode */}
                <div className="p-4 bg-slate-50/90 border-b border-slate-200/80 space-y-3">
                  {/* Top Row: Brand Picker & Mode Switcher */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Brand Selector */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-purple-600" />
                          <span>Brand Size Chart</span>
                        </label>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {currentBrand.confidence}% Verified • {currentBrand.skuCount} Patterns
                        </span>
                      </div>
                      <div className="relative">
                        <select
                          value={selectedBrandId}
                          onChange={(e) => setSelectedBrandId(e.target.value)}
                          className="w-full appearance-none bg-white border border-slate-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-3.5 py-2 pr-9 text-xs font-bold text-slate-900 shadow-2xs transition-all cursor-pointer"
                        >
                          {availableBrands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.type === 'global' ? 'Global Brand' : 'Private Label'})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {/* Sizing Standard Mode: US, EU, UK */}
                    <div className="sm:w-auto">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-purple-600" />
                        <span>Sizing Standard</span>
                      </label>
                      <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
                        {(['us', 'eu', 'uk'] as SizingSystemMode[]).map((mode) => {
                          const isActive = sizingMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setSizingMode(mode)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-purple-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                              }`}
                            >
                              {mode.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Quick Brand Badges for fast 1-click preview */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none">
                    <span className="text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap mr-1">
                      Popular:
                    </span>
                    {availableBrands.slice(0, 8).map((b) => {
                      const isSelected = b.id === selectedBrandId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBrandId(b.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-purple-100 text-purple-900 border border-purple-300 font-bold shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-slate-100 text-[9px] font-black flex items-center justify-center text-slate-700">
                            {b.logoInitials}
                          </span>
                          <span>{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* HORIZONTAL CATEGORIES BAR - Smart, Mature, Clean Layout */}
                <div className="bg-slate-50/80 border-b border-slate-200/80 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-600" />
                      <span>Garment Category</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {brandCategories.length} categories available
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {brandCategories.map((cat) => {
                      const Icon = getCategoryIcon(cat.key);
                      const isSelected = selectedCategoryKey === cat.key;
                      const rec = categoryRecommendations[cat.key];

                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setSelectedCategoryKey(cat.key)}
                          className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-white text-purple-950 border border-purple-300 shadow-xs ring-2 ring-purple-400/20'
                              : 'bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/80 shadow-2xs'
                          }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-600' : 'text-slate-400'}`} />
                          <span className="font-semibold">{cat.label}</span>
                          {rec?.formattedBestSize && rec.formattedBestSize !== '—' && (
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md font-mono ${
                                isSelected
                                  ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {rec.formattedBestSize}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subcategory Silhouette & Recommendation Bar */}
                <div className="px-5 py-3.5 bg-slate-50/50 border-b border-slate-200/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  {/* Subcategory selector */}
                  <div className="flex-1 min-w-0 max-w-sm">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-purple-600" />
                      <span>Subcategory Silhouette</span>
                    </label>
                    {availableSubcategories.length > 0 ? (
                      <div className="relative">
                        <select
                          value={selectedSubcategoryId}
                          onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                          className="w-full appearance-none bg-white border border-slate-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-3.5 py-2 pr-8 text-xs font-bold text-slate-800 shadow-2xs transition-all cursor-pointer"
                        >
                          {availableSubcategories.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name} ({sub.fitType})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 font-medium">Standard Fit Profile</div>
                    )}
                  </div>

                  {/* Recommendation Callout Badge */}
                  <div className="flex items-center gap-3 bg-emerald-50/95 border border-emerald-200/90 rounded-xl px-4 py-2.5 shadow-2xs self-stretch md:self-auto">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-emerald-950">
                          Best Fit:
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-700 text-white text-xs font-black tracking-wide shadow-2xs">
                          {activeRecommendation.bestRow
                            ? formatSizeForMode(activeRecommendation.bestRow, sizingMode)
                            : '—'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/90 text-emerald-950 border border-emerald-300">
                          {activeRecommendation.matchScore}% Match
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 font-medium truncate max-w-sm mt-0.5">
                        {activeRecommendation.reason}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subcategory Description Bar */}
                {currentSubcategory?.fitDescription && (
                  <div className="px-5 py-2 bg-slate-50/70 border-b border-slate-200/60 flex items-center gap-2 text-xs text-slate-600">
                    <Info className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    <span className="font-medium">
                      <strong className="text-slate-800">{currentSubcategory.name}:</strong> {currentSubcategory.fitDescription}
                    </span>
                  </div>
                )}

                {/* Size Chart Table with Sizing Standard & Highlighted Match Row */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    {/* Primary Size Column based on selected sizing standard */}
                    <th className="px-4 py-3 whitespace-nowrap text-purple-950 bg-purple-50/70 font-black">
                      {sizingMode.toUpperCase()} Size
                    </th>

                    {/* Age Column (Displayed specifically for kids persona) */}
                    {persona === 'kid' && (
                      <th className="px-4 py-3 whitespace-nowrap text-purple-900 bg-purple-50/30">
                        Age
                      </th>
                    )}

                    {/* Dimension Columns depending on category */}
                    {selectedCategoryKey === 'footwear' ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Foot Length ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Dual Dimension</th>
                      </>
                    ) : selectedCategoryKey === 'bottoms' ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Waist ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Hips ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Inseam</th>
                      </>
                    ) : selectedCategoryKey === 'dresses' ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Bust ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Waist ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Hips ({unit === 'metric' ? 'cm' : 'in'})</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">Chest ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Waist ({unit === 'metric' ? 'cm' : 'in'})</th>
                        <th className="px-4 py-3 whitespace-nowrap">Garment Length</th>
                      </>
                    )}

                    {/* Fit Silhouette Note */}
                    <th className="px-4 py-3 whitespace-nowrap">Fit Profile</th>

                    {/* Status Badge */}
                    <th className="px-4 py-3 text-right">Status</th>

                    {/* Action: View Suitable Items */}
                    <th className="px-4 py-3 text-center w-24">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeRows.map((row, idx) => {
                    const isHighlighted = idx === activeRecommendation.bestRowIndex;

                    // Formatted age label for kids
                    const ageDisplay = row.ageLabel
                      ? row.ageLabel
                      : row.ageMin && row.ageMax
                      ? row.ageMin === row.ageMax
                        ? `${row.ageMin} Yrs`
                        : `${row.ageMin}–${row.ageMax} Yrs`
                      : row.sizeLabel.match(/\d+-\d+Y|\d+Y/i)
                      ? row.sizeLabel.match(/\d+-\d+Y|\d+Y/i)?.[0]
                      : '—';

                    return (
                      <tr
                        key={row.sizeLabel + idx}
                        className={`transition-all duration-300 ${
                          isHighlighted
                            ? 'bg-emerald-50/95 hover:bg-emerald-100/90 font-semibold ring-2 ring-emerald-500 ring-inset shadow-xs'
                            : 'hover:bg-slate-50/70 text-slate-700'
                        }`}
                      >
                        {/* Primary Size Column (Formatted strictly for selected sizingMode) */}
                        <td
                          className={`px-4 py-3.5 whitespace-nowrap ${
                            isHighlighted
                              ? 'font-black text-emerald-950 text-sm bg-emerald-100/60'
                              : 'font-bold text-slate-900 bg-slate-50/40'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isHighlighted && (
                              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                            )}
                            <span>{formatSizeForMode(row, sizingMode)}</span>
                          </div>
                        </td>

                        {/* Age Column for Kids */}
                        {persona === 'kid' && (
                          <td className={`px-4 py-3.5 whitespace-nowrap font-medium ${isHighlighted ? 'text-emerald-950 font-bold' : 'text-slate-700'}`}>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              isHighlighted ? 'bg-emerald-200/70 text-emerald-950' : 'bg-purple-50 text-purple-900'
                            }`}>
                              {ageDisplay}
                            </span>
                          </td>
                        )}

                        {/* Dimension Columns */}
                        {selectedCategoryKey === 'footwear' ? (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.footLengthCm || '—'} cm` : `${row.footLengthIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                              {row.footLengthCm} cm / {row.footLengthIn}&quot;
                            </td>
                          </>
                        ) : selectedCategoryKey === 'bottoms' ? (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.waistCm || '—'} cm` : `${row.waistIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.hipsCm || '—'} cm` : `${row.hipsIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                              {row.inseamCm ? `${row.inseamCm} cm (${row.inseamIn}")` : 'Standard Inseam'}
                            </td>
                          </>
                        ) : selectedCategoryKey === 'dresses' ? (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.chestCm || '—'} cm` : `${row.chestIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.waistCm || '—'} cm` : `${row.waistIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.hipsCm || '—'} cm` : `${row.hipsIn || '—'}"`}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {unit === 'metric' ? `${row.chestCm || '—'} cm` : `${row.chestIn || '—'}"`}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                              {row.waistCm ? (unit === 'metric' ? `${row.waistCm} cm` : `${row.waistIn}"`) : '—'}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                              {row.lengthCm ? `${row.lengthCm} cm (${row.lengthIn}")` : 'Regular Cut'}
                            </td>
                          </>
                        )}

                        {/* Fit Profile Note */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            isHighlighted
                              ? 'bg-emerald-200/80 text-emerald-950 font-black'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.fitNote || 'Standard Fit'}
                          </span>
                        </td>

                        {/* Status Column */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {isHighlighted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-600 text-white shadow-2xs">
                              <Sparkles className="w-3 h-3" />
                              Best Fit
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">
                              {idx < activeRecommendation.bestRowIndex ? 'Smaller' : 'Larger'}
                            </span>
                          )}
                        </td>

                        {/* Action Column: Eye icon to view suitable products */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            id={`btn-view-items-${idx}`}
                            onClick={() => {
                              setActiveSizeItemsModal({
                                sizeLabel: row.sizeLabel,
                                formattedSize: formatSizeForMode(row, sizingMode),
                                row: row,
                              });
                            }}
                            title={`View items available in size ${formatSizeForMode(row, sizingMode)}`}
                            className={`inline-flex items-center justify-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-md border text-xs font-semibold transition-all duration-200 cursor-pointer ${
                              isHighlighted
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                : 'bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border-slate-200 hover:border-purple-300'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Items</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer: Brand Fit Philosophy & Multi-System Note */}
            <div className="p-4 bg-slate-50/90 border-t border-slate-200/80 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span>
                    <strong className="text-slate-800">{currentBrand.name} Fit Philosophy:</strong> {currentBrand.fitPhilosophy}
                  </span>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto font-mono text-[11px] whitespace-nowrap">
                  <span className="flex items-center gap-1 text-emerald-700 font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    Best Fit ({activeRecommendation.matchScore}%)
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>
                    Other Sizes
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-200/60">
                <span>
                  Source: <strong className="text-slate-600">{currentBrand.sourceNote}</strong> • Confidence Index: <strong className="text-emerald-700">{currentBrand.confidence}%</strong>
                </span>
                <span className="text-slate-500 font-medium">
                  Switching sizing standards (US, EU, UK) directly updates the size column and matching recommendations.
                </span>
              </div>
            </div>
          </>
        )}
          </div>
        </div>
      </div>

      {/* Popup Modal: Suitable Items Found for Clicked Size */}
      {activeSizeItemsModal && (
        <div
          id="modal-size-items-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setActiveSizeItemsModal(null)}
        >
          <div
            id="modal-size-items-content"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Suitable Catalog Items for Size: <span className="text-purple-700 font-extrabold">{activeSizeItemsModal.formattedSize}</span>
                    </h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold border border-purple-200">
                      {sizingMode.toUpperCase()} Standard
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentBrand.name} • {currentCategory?.label || selectedCategoryKey} • {currentSubcategory?.name || 'Garments'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-size-items-modal"
                onClick={() => setActiveSizeItemsModal(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                title="Close popup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Subheader: Size Dimensions & Fit Spec */}
            <div className="px-6 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 font-medium">
                <span className="text-slate-500">Size Spec:</span>
                {activeSizeItemsModal.row.chestCm && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                    Chest: <strong>{activeSizeItemsModal.row.chestCm} cm</strong>
                  </span>
                )}
                {activeSizeItemsModal.row.waistCm && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                    Waist: <strong>{activeSizeItemsModal.row.waistCm} cm</strong>
                  </span>
                )}
                {activeSizeItemsModal.row.footLengthCm && (
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                    Foot: <strong>{activeSizeItemsModal.row.footLengthCm} cm</strong>
                  </span>
                )}
                {activeSizeItemsModal.row.fitNote && (
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                    {activeSizeItemsModal.row.fitNote}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-purple-700 font-medium">
                {getSuitableItemsForSize(activeSizeItemsModal.row, activeSizeItemsModal.formattedSize).length} matching items found
              </span>
            </div>

            {/* Modal Body: List of Suitable Items */}
            <div className="p-6 overflow-y-auto space-y-3 divide-y divide-slate-100">
              {(() => {
                const items = getSuitableItemsForSize(activeSizeItemsModal.row, activeSizeItemsModal.formattedSize);
                if (items.length === 0) {
                  return (
                    <div className="text-center py-10">
                      <p className="text-sm font-semibold text-slate-700">No matching items currently stocked for size {activeSizeItemsModal.formattedSize}.</p>
                      <p className="text-xs text-slate-400 mt-1">Check back once supplier manifests refresh or try neighboring sizes.</p>
                    </div>
                  );
                }

                return items.map((product) => {
                  const isCurrentBrand = product.brand.toLowerCase() === currentBrand.name.toLowerCase();
                  return (
                    <div
                      key={product.id}
                      className="pt-3 first:pt-0 flex items-center justify-between gap-4 group hover:bg-slate-50/80 p-2.5 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0 bg-slate-100"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isCurrentBrand
                                ? 'bg-purple-100 text-purple-800 font-extrabold'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {product.brand || 'Store Brand'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">{product.sku}</span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 truncate mt-0.5 group-hover:text-purple-700 transition-colors">
                            {product.title}
                          </h4>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {product.subCategory || product.category}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-black text-slate-900">{product.price}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-500">
                              Available Sizes: {product.sizes?.join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Size {activeSizeItemsModal.formattedSize} Fits
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {product.stockQty} in stock
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Filtered strictly by size compatibility with <strong>{activeSizeItemsModal.formattedSize}</strong> ({activeSizeItemsModal.sizeLabel})
              </span>
              <button
                type="button"
                onClick={() => setActiveSizeItemsModal(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
