import {
  ParentCategoryType,
  StandardParentCategoryType,
  SizingSystemOption,
  CategorySizingTable,
  MultiSystemSizingData,
  CustomParentCategory,
  MockProduct,
  BrandResearchedCategoryChart,
  PathChartAssignment,
  SkuChartOverride,
  FinalSkuChartResult,
  ResearchedChartVariant,
} from '../types';

export const STANDARD_PARENT_CATEGORIES: StandardParentCategoryType[] = [
  'Tops',
  'Outerwear / Jackets',
  'Bottoms',
  'Dresses / Full-body',
  'Footwear',
];

export const PARENT_CATEGORIES: StandardParentCategoryType[] = STANDARD_PARENT_CATEGORIES;

export interface CategoryTemplateMetadata {
  category: ParentCategoryType;
  requiredFields: string[];
  optionalFields: string[];
  notes?: string;
  isCustom?: boolean;
}

export const CATEGORY_TEMPLATE_METADATA: Record<StandardParentCategoryType, CategoryTemplateMetadata> = {
  Tops: {
    category: 'Tops',
    requiredFields: ['Size', 'Chest Min (cm)', 'Chest Max (cm)'],
    optionalFields: ['Waist Min (cm)', 'Waist Max (cm)', 'Body Length (cm)'],
    notes: 'Required: Size, Chest Min, Chest Max. Optional: Waist Min/Max, Body Length.',
  },
  'Outerwear / Jackets': {
    category: 'Outerwear / Jackets',
    requiredFields: ['Size', 'Chest Min (cm)', 'Chest Max (cm)'],
    optionalFields: ['Waist Min (cm)', 'Waist Max (cm)', 'Sleeve Length (cm)', 'Body Length (cm)'],
    notes: 'Required: Size, Chest Min, Chest Max. Optional: Waist Min/Max, Sleeve Length, Body Length.',
  },
  Bottoms: {
    category: 'Bottoms',
    requiredFields: ['Size', 'Waist Min (cm)', 'Waist Max (cm)'],
    optionalFields: ['Hip Min (cm)', 'Hip Max (cm)', 'Inseam (cm)'],
    notes: 'Required: Size, Waist Min, Waist Max. Optional: Hip Min/Max, Inseam.',
  },
  'Dresses / Full-body': {
    category: 'Dresses / Full-body',
    requiredFields: ['Size', 'Chest Min (cm)', 'Chest Max (cm)'],
    optionalFields: ['Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Dress Length (cm)'],
    notes: 'Required: Size, Chest Min, Chest Max. Optional (recommended for accurate joint-checking): Waist Min/Max, Hip Min/Max, Dress Length.',
  },
  Footwear: {
    category: 'Footwear',
    requiredFields: ['Size (US)', 'Foot Length (cm)'],
    optionalFields: [],
    notes: 'Required: Size, Foot Length. No other fields apply.',
  },
};

// Preset custom category templates to make it fast and easy for merchants
export const CUSTOM_CATEGORY_PRESETS: Omit<CustomParentCategory, 'id'>[] = [
  {
    name: 'Swimwear & Beachwear',
    description: 'Bikinis, one-pieces, swim trunks & rashguards',
    requiredFields: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)'],
    optionalFields: ['Waist Min (cm)', 'Waist Max (cm)', 'Torso Length (cm)'],
    color: 'teal',
    icon: 'Waves',
    notes: 'Required: Size, Chest Min/Max, Hip Min/Max. Optional: Waist Min/Max, Torso Length.',
  },
  {
    name: 'Headwear / Hats & Caps',
    description: 'Beanies, caps, fedoras, sun hats & visors',
    requiredFields: ['Size', 'Head Circumference (cm)'],
    optionalFields: ['Crown Height (cm)', 'Brim Width (cm)'],
    color: 'amber',
    icon: 'Crown',
    notes: 'Required: Size, Head Circumference. Optional: Crown Height, Brim Width.',
  },
  {
    name: 'Gloves & Handwear',
    description: 'Winter gloves, mittens, driving & sport gloves',
    requiredFields: ['Size', 'Hand Circumference (cm)', 'Palm Length (cm)'],
    optionalFields: ['Wrist Width (cm)'],
    color: 'indigo',
    icon: 'Hand',
    notes: 'Required: Size, Hand Circumference, Palm Length. Optional: Wrist Width.',
  },
  {
    name: 'Underwear & Intimates',
    description: 'Bras, bralettes, boxers, briefs & shapewear',
    requiredFields: ['Size', 'Band Size', 'Cup Size / Underbust (cm)'],
    optionalFields: ['Waist Min (cm)', 'Hip Min (cm)'],
    color: 'rose',
    icon: 'Heart',
    notes: 'Required: Size, Band Size, Underbust. Optional: Waist, Hip.',
  },
  {
    name: 'Wetsuits & Neoprene',
    description: 'Surfing, diving wetsuits & drysuits',
    requiredFields: ['Size', 'Height Min (cm)', 'Height Max (cm)', 'Weight Min (kg)', 'Weight Max (kg)', 'Chest (cm)'],
    optionalFields: ['Waist (cm)', 'Hip (cm)'],
    color: 'cyan',
    icon: 'Compass',
    notes: 'Required: Size, Height range, Weight range, Chest. Optional: Waist, Hip.',
  },
  {
    name: 'Rings & Fine Jewelry',
    description: 'Bands, fashion rings & engagement rings',
    requiredFields: ['Ring Size', 'Inside Circumference (mm)'],
    optionalFields: ['Inside Diameter (mm)'],
    color: 'purple',
    icon: 'Gem',
    notes: 'Required: Ring Size, Inside Circumference. Optional: Inside Diameter.',
  },
];

// Exact table structures and sample data as requested
export const STANDARD_CATEGORY_SIZING_TEMPLATES: Record<ParentCategoryType, MultiSystemSizingData> = {
  // 1. Tops
  Tops: {
    US: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Body Length (cm)'],
      rows: [
        { Size: 'XS', 'Chest Min (cm)': '80', 'Chest Max (cm)': '88', 'Waist Min (cm)': '65', 'Waist Max (cm)': '73', 'Body Length (cm)': '68' },
        { Size: 'S', 'Chest Min (cm)': '88', 'Chest Max (cm)': '96', 'Waist Min (cm)': '73', 'Waist Max (cm)': '81', 'Body Length (cm)': '70' },
        { Size: 'M', 'Chest Min (cm)': '96', 'Chest Max (cm)': '104', 'Waist Min (cm)': '81', 'Waist Max (cm)': '89', 'Body Length (cm)': '72' },
        { Size: 'L', 'Chest Min (cm)': '104', 'Chest Max (cm)': '112', 'Waist Min (cm)': '89', 'Waist Max (cm)': '97', 'Body Length (cm)': '74' },
        { Size: 'XL', 'Chest Min (cm)': '112', 'Chest Max (cm)': '124', 'Waist Min (cm)': '97', 'Waist Max (cm)': '109', 'Body Length (cm)': '76' },
        { Size: 'XXL', 'Chest Min (cm)': '124', 'Chest Max (cm)': '136', 'Waist Min (cm)': '109', 'Waist Max (cm)': '121', 'Body Length (cm)': '78' },
      ],
    },
    UK: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Body Length (cm)'],
      rows: [
        { Size: 'UK 34 (XS)', 'Chest Min (cm)': '80', 'Chest Max (cm)': '88', 'Waist Min (cm)': '65', 'Waist Max (cm)': '73', 'Body Length (cm)': '68' },
        { Size: 'UK 36 (S)', 'Chest Min (cm)': '88', 'Chest Max (cm)': '96', 'Waist Min (cm)': '73', 'Waist Max (cm)': '81', 'Body Length (cm)': '70' },
        { Size: 'UK 38 (M)', 'Chest Min (cm)': '96', 'Chest Max (cm)': '104', 'Waist Min (cm)': '81', 'Waist Max (cm)': '89', 'Body Length (cm)': '72' },
        { Size: 'UK 40 (L)', 'Chest Min (cm)': '104', 'Chest Max (cm)': '112', 'Waist Min (cm)': '89', 'Waist Max (cm)': '97', 'Body Length (cm)': '74' },
        { Size: 'UK 42 (XL)', 'Chest Min (cm)': '112', 'Chest Max (cm)': '124', 'Waist Min (cm)': '97', 'Waist Max (cm)': '109', 'Body Length (cm)': '76' },
        { Size: 'UK 44 (XXL)', 'Chest Min (cm)': '124', 'Chest Max (cm)': '136', 'Waist Min (cm)': '109', 'Waist Max (cm)': '121', 'Body Length (cm)': '78' },
      ],
    },
    EU: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Body Length (cm)'],
      rows: [
        { Size: 'EU 44 (XS)', 'Chest Min (cm)': '80', 'Chest Max (cm)': '88', 'Waist Min (cm)': '65', 'Waist Max (cm)': '73', 'Body Length (cm)': '68' },
        { Size: 'EU 46 (S)', 'Chest Min (cm)': '88', 'Chest Max (cm)': '96', 'Waist Min (cm)': '73', 'Waist Max (cm)': '81', 'Body Length (cm)': '70' },
        { Size: 'EU 48 (M)', 'Chest Min (cm)': '96', 'Chest Max (cm)': '104', 'Waist Min (cm)': '81', 'Waist Max (cm)': '89', 'Body Length (cm)': '72' },
        { Size: 'EU 50 (L)', 'Chest Min (cm)': '104', 'Chest Max (cm)': '112', 'Waist Min (cm)': '89', 'Waist Max (cm)': '97', 'Body Length (cm)': '74' },
        { Size: 'EU 52 (XL)', 'Chest Min (cm)': '112', 'Chest Max (cm)': '124', 'Waist Min (cm)': '97', 'Waist Max (cm)': '109', 'Body Length (cm)': '76' },
        { Size: 'EU 54 (XXL)', 'Chest Min (cm)': '124', 'Chest Max (cm)': '136', 'Waist Min (cm)': '109', 'Waist Max (cm)': '121', 'Body Length (cm)': '78' },
      ],
    },
  },

  // 2. Outerwear / Jackets
  'Outerwear / Jackets': {
    US: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Sleeve Length (cm)', 'Body Length (cm)'],
      rows: [
        { Size: 'S', 'Chest Min (cm)': '90', 'Chest Max (cm)': '98', 'Waist Min (cm)': '76', 'Waist Max (cm)': '84', 'Sleeve Length (cm)': '62', 'Body Length (cm)': '71' },
        { Size: 'M', 'Chest Min (cm)': '98', 'Chest Max (cm)': '106', 'Waist Min (cm)': '84', 'Waist Max (cm)': '92', 'Sleeve Length (cm)': '64', 'Body Length (cm)': '73' },
        { Size: 'L', 'Chest Min (cm)': '106', 'Chest Max (cm)': '114', 'Waist Min (cm)': '92', 'Waist Max (cm)': '100', 'Sleeve Length (cm)': '66', 'Body Length (cm)': '75' },
        { Size: 'XL', 'Chest Min (cm)': '114', 'Chest Max (cm)': '122', 'Waist Min (cm)': '100', 'Waist Max (cm)': '108', 'Sleeve Length (cm)': '68', 'Body Length (cm)': '77' },
      ],
    },
    UK: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Sleeve Length (cm)', 'Body Length (cm)'],
      rows: [
        { Size: 'UK 36 (S)', 'Chest Min (cm)': '90', 'Chest Max (cm)': '98', 'Waist Min (cm)': '76', 'Waist Max (cm)': '84', 'Sleeve Length (cm)': '62', 'Body Length (cm)': '71' },
        { Size: 'UK 38 (M)', 'Chest Min (cm)': '98', 'Chest Max (cm)': '106', 'Waist Min (cm)': '84', 'Waist Max (cm)': '92', 'Sleeve Length (cm)': '64', 'Body Length (cm)': '73' },
        { Size: 'UK 40 (L)', 'Chest Min (cm)': '106', 'Chest Max (cm)': '114', 'Waist Min (cm)': '92', 'Waist Max (cm)': '100', 'Sleeve Length (cm)': '66', 'Body Length (cm)': '75' },
        { Size: 'UK 42 (XL)', 'Chest Min (cm)': '114', 'Chest Max (cm)': '122', 'Waist Min (cm)': '100', 'Waist Max (cm)': '108', 'Sleeve Length (cm)': '68', 'Body Length (cm)': '77' },
      ],
    },
    EU: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Sleeve Length (cm)', 'Body Length (cm)'],
      rows: [
        { Size: 'EU 46 (S)', 'Chest Min (cm)': '90', 'Chest Max (cm)': '98', 'Waist Min (cm)': '76', 'Waist Max (cm)': '84', 'Sleeve Length (cm)': '62', 'Body Length (cm)': '71' },
        { Size: 'EU 48 (M)', 'Chest Min (cm)': '98', 'Chest Max (cm)': '106', 'Waist Min (cm)': '84', 'Waist Max (cm)': '92', 'Sleeve Length (cm)': '64', 'Body Length (cm)': '73' },
        { Size: 'EU 50 (L)', 'Chest Min (cm)': '106', 'Chest Max (cm)': '114', 'Waist Min (cm)': '92', 'Waist Max (cm)': '100', 'Sleeve Length (cm)': '66', 'Body Length (cm)': '75' },
        { Size: 'EU 52 (XL)', 'Chest Min (cm)': '114', 'Chest Max (cm)': '122', 'Waist Min (cm)': '100', 'Waist Max (cm)': '108', 'Sleeve Length (cm)': '68', 'Body Length (cm)': '77' },
      ],
    },
  },

  // 3. Bottoms
  Bottoms: {
    US: {
      headers: ['Size', 'Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Inseam (cm)'],
      rows: [
        { Size: '28', 'Waist Min (cm)': '71', 'Waist Max (cm)': '76', 'Hip Min (cm)': '85', 'Hip Max (cm)': '90', 'Inseam (cm)': '80.0' },
        { Size: '30', 'Waist Min (cm)': '76', 'Waist Max (cm)': '81', 'Hip Min (cm)': '90', 'Hip Max (cm)': '95', 'Inseam (cm)': '81.0' },
        { Size: '32', 'Waist Min (cm)': '81', 'Waist Max (cm)': '86', 'Hip Min (cm)': '95', 'Hip Max (cm)': '100', 'Inseam (cm)': '81.5' },
        { Size: '34', 'Waist Min (cm)': '86', 'Waist Max (cm)': '91', 'Hip Min (cm)': '100', 'Hip Max (cm)': '105', 'Inseam (cm)': '82.0' },
        { Size: '36', 'Waist Min (cm)': '91', 'Waist Max (cm)': '96', 'Hip Min (cm)': '105', 'Hip Max (cm)': '110', 'Inseam (cm)': '82.5' },
      ],
    },
    UK: {
      headers: ['Size', 'Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Inseam (cm)'],
      rows: [
        { Size: 'UK 28', 'Waist Min (cm)': '71', 'Waist Max (cm)': '76', 'Hip Min (cm)': '85', 'Hip Max (cm)': '90', 'Inseam (cm)': '80.0' },
        { Size: 'UK 30', 'Waist Min (cm)': '76', 'Waist Max (cm)': '81', 'Hip Min (cm)': '90', 'Hip Max (cm)': '95', 'Inseam (cm)': '81.0' },
        { Size: 'UK 32', 'Waist Min (cm)': '81', 'Waist Max (cm)': '86', 'Hip Min (cm)': '95', 'Hip Max (cm)': '100', 'Inseam (cm)': '81.5' },
        { Size: 'UK 34', 'Waist Min (cm)': '86', 'Waist Max (cm)': '91', 'Hip Min (cm)': '100', 'Hip Max (cm)': '105', 'Inseam (cm)': '82.0' },
        { Size: 'UK 36', 'Waist Min (cm)': '91', 'Waist Max (cm)': '96', 'Hip Min (cm)': '105', 'Hip Max (cm)': '110', 'Inseam (cm)': '82.5' },
      ],
    },
    EU: {
      headers: ['Size', 'Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Inseam (cm)'],
      rows: [
        { Size: 'EU 38 (28)', 'Waist Min (cm)': '71', 'Waist Max (cm)': '76', 'Hip Min (cm)': '85', 'Hip Max (cm)': '90', 'Inseam (cm)': '80.0' },
        { Size: 'EU 40 (30)', 'Waist Min (cm)': '76', 'Waist Max (cm)': '81', 'Hip Min (cm)': '90', 'Hip Max (cm)': '95', 'Inseam (cm)': '81.0' },
        { Size: 'EU 42 (32)', 'Waist Min (cm)': '81', 'Waist Max (cm)': '86', 'Hip Min (cm)': '95', 'Hip Max (cm)': '100', 'Inseam (cm)': '81.5' },
        { Size: 'EU 44 (34)', 'Waist Min (cm)': '86', 'Waist Max (cm)': '91', 'Hip Min (cm)': '100', 'Hip Max (cm)': '105', 'Inseam (cm)': '82.0' },
        { Size: 'EU 46 (36)', 'Waist Min (cm)': '91', 'Waist Max (cm)': '96', 'Hip Min (cm)': '105', 'Hip Max (cm)': '110', 'Inseam (cm)': '82.5' },
      ],
    },
  },

  // 4. Dresses / Full-body
  'Dresses / Full-body': {
    US: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Dress Length (cm)'],
      rows: [
        { Size: 'XS', 'Chest Min (cm)': '78', 'Chest Max (cm)': '84', 'Waist Min (cm)': '60', 'Waist Max (cm)': '66', 'Hip Min (cm)': '84', 'Hip Max (cm)': '90', 'Dress Length (cm)': '92' },
        { Size: 'S', 'Chest Min (cm)': '84', 'Chest Max (cm)': '90', 'Waist Min (cm)': '66', 'Waist Max (cm)': '72', 'Hip Min (cm)': '90', 'Hip Max (cm)': '96', 'Dress Length (cm)': '94' },
        { Size: 'M', 'Chest Min (cm)': '90', 'Chest Max (cm)': '96', 'Waist Min (cm)': '72', 'Waist Max (cm)': '78', 'Hip Min (cm)': '96', 'Hip Max (cm)': '102', 'Dress Length (cm)': '96' },
        { Size: 'L', 'Chest Min (cm)': '96', 'Chest Max (cm)': '102', 'Waist Min (cm)': '78', 'Waist Max (cm)': '84', 'Hip Min (cm)': '102', 'Hip Max (cm)': '108', 'Dress Length (cm)': '98' },
        { Size: 'XL', 'Chest Min (cm)': '102', 'Chest Max (cm)': '108', 'Waist Min (cm)': '84', 'Waist Max (cm)': '90', 'Hip Min (cm)': '108', 'Hip Max (cm)': '114', 'Dress Length (cm)': '100' },
      ],
    },
    UK: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Dress Length (cm)'],
      rows: [
        { Size: 'UK 6 (XS)', 'Chest Min (cm)': '78', 'Chest Max (cm)': '84', 'Waist Min (cm)': '60', 'Waist Max (cm)': '66', 'Hip Min (cm)': '84', 'Hip Max (cm)': '90', 'Dress Length (cm)': '92' },
        { Size: 'UK 8/10 (S)', 'Chest Min (cm)': '84', 'Chest Max (cm)': '90', 'Waist Min (cm)': '66', 'Waist Max (cm)': '72', 'Hip Min (cm)': '90', 'Hip Max (cm)': '96', 'Dress Length (cm)': '94' },
        { Size: 'UK 12/14 (M)', 'Chest Min (cm)': '90', 'Chest Max (cm)': '96', 'Waist Min (cm)': '72', 'Waist Max (cm)': '78', 'Hip Min (cm)': '96', 'Hip Max (cm)': '102', 'Dress Length (cm)': '96' },
        { Size: 'UK 16 (L)', 'Chest Min (cm)': '96', 'Chest Max (cm)': '102', 'Waist Min (cm)': '78', 'Waist Max (cm)': '84', 'Hip Min (cm)': '102', 'Hip Max (cm)': '108', 'Dress Length (cm)': '98' },
        { Size: 'UK 18 (XL)', 'Chest Min (cm)': '102', 'Chest Max (cm)': '108', 'Waist Min (cm)': '84', 'Waist Max (cm)': '90', 'Hip Min (cm)': '108', 'Hip Max (cm)': '114', 'Dress Length (cm)': '100' },
      ],
    },
    EU: {
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)', 'Waist Min (cm)', 'Waist Max (cm)', 'Hip Min (cm)', 'Hip Max (cm)', 'Dress Length (cm)'],
      rows: [
        { Size: 'EU 34 (XS)', 'Chest Min (cm)': '78', 'Chest Max (cm)': '84', 'Waist Min (cm)': '60', 'Waist Max (cm)': '66', 'Hip Min (cm)': '84', 'Hip Max (cm)': '90', 'Dress Length (cm)': '92' },
        { Size: 'EU 36/38 (S)', 'Chest Min (cm)': '84', 'Chest Max (cm)': '90', 'Waist Min (cm)': '66', 'Waist Max (cm)': '72', 'Hip Min (cm)': '90', 'Hip Max (cm)': '96', 'Dress Length (cm)': '94' },
        { Size: 'EU 40/42 (M)', 'Chest Min (cm)': '90', 'Chest Max (cm)': '96', 'Waist Min (cm)': '72', 'Waist Max (cm)': '78', 'Hip Min (cm)': '96', 'Hip Max (cm)': '102', 'Dress Length (cm)': '96' },
        { Size: 'EU 44 (L)', 'Chest Min (cm)': '96', 'Chest Max (cm)': '102', 'Waist Min (cm)': '78', 'Waist Max (cm)': '84', 'Hip Min (cm)': '102', 'Hip Max (cm)': '108', 'Dress Length (cm)': '98' },
        { Size: 'EU 46 (XL)', 'Chest Min (cm)': '102', 'Chest Max (cm)': '108', 'Waist Min (cm)': '84', 'Waist Max (cm)': '90', 'Hip Min (cm)': '108', 'Hip Max (cm)': '114', 'Dress Length (cm)': '100' },
      ],
    },
  },

  // 5. Footwear
  Footwear: {
    US: {
      headers: ['Size (US)', 'Foot Length (cm)'],
      rows: [
        { 'Size (US)': '7', 'Foot Length (cm)': '25.4' },
        { 'Size (US)': '8', 'Foot Length (cm)': '26.0' },
        { 'Size (US)': '9', 'Foot Length (cm)': '26.7' },
        { 'Size (US)': '10', 'Foot Length (cm)': '27.3' },
        { 'Size (US)': '11', 'Foot Length (cm)': '27.9' },
        { 'Size (US)': '12', 'Foot Length (cm)': '28.6' },
      ],
    },
    UK: {
      headers: ['Size (UK)', 'Foot Length (cm)'],
      rows: [
        { 'Size (UK)': '6', 'Foot Length (cm)': '25.4' },
        { 'Size (UK)': '7', 'Foot Length (cm)': '26.0' },
        { 'Size (UK)': '8', 'Foot Length (cm)': '26.7' },
        { 'Size (UK)': '9', 'Foot Length (cm)': '27.3' },
        { 'Size (UK)': '10', 'Foot Length (cm)': '27.9' },
        { 'Size (UK)': '11', 'Foot Length (cm)': '28.6' },
      ],
    },
    EU: {
      headers: ['Size (EU)', 'Foot Length (cm)'],
      rows: [
        { 'Size (EU)': '40', 'Foot Length (cm)': '25.4' },
        { 'Size (EU)': '41', 'Foot Length (cm)': '26.0' },
        { 'Size (EU)': '42.5', 'Foot Length (cm)': '26.7' },
        { 'Size (EU)': '44', 'Foot Length (cm)': '27.3' },
        { 'Size (EU)': '45', 'Foot Length (cm)': '27.9' },
        { 'Size (EU)': '46.5', 'Foot Length (cm)': '28.6' },
      ],
    },
  },
};

export function normalizeToParentCategory(rawCategory: string): StandardParentCategoryType {
  const text = rawCategory.toLowerCase();
  if (text.includes('footwear') || text.includes('shoe') || text.includes('sneaker') || text.includes('runner') || text.includes('boot') || text.includes('deck') || text.includes('loafer')) {
    return 'Footwear';
  }
  if (text.includes('dress') || text.includes('skirt') || text.includes('full-body') || text.includes('jumpsuit') || text.includes('dungaree') || text.includes('overall')) {
    return 'Dresses / Full-body';
  }
  if (text.includes('outerwear') || text.includes('jacket') || text.includes('coat') || text.includes('blazer') || text.includes('suit') || text.includes('parka') || text.includes('windbreaker') || text.includes('puffer')) {
    return 'Outerwear / Jackets';
  }
  if (text.includes('bottom') || text.includes('pant') || text.includes('jean') || text.includes('denim') || text.includes('trouser') || text.includes('short')) {
    return 'Bottoms';
  }
  return 'Tops';
}

export function getCategoryMetadata(
  category: string,
  customCategories: CustomParentCategory[] = []
): CategoryTemplateMetadata {
  if (category in CATEGORY_TEMPLATE_METADATA) {
    return CATEGORY_TEMPLATE_METADATA[category as StandardParentCategoryType];
  }
  const found = customCategories.find((c) => c.name.toLowerCase() === category.toLowerCase() || c.id === category);
  if (found) {
    return {
      category: found.name,
      requiredFields: found.requiredFields,
      optionalFields: found.optionalFields,
      notes: found.notes || `Custom Category: ${found.name}`,
      isCustom: true,
    };
  }
  return {
    category,
    requiredFields: ['Size'],
    optionalFields: ['Measurement 1 (cm)', 'Measurement 2 (cm)'],
    notes: `Custom Category: ${category}`,
    isCustom: true,
  };
}

export function generateDefaultCustomSizingTemplate(category: CustomParentCategory): MultiSystemSizingData {
  const headers = ['Size', ...category.requiredFields.filter((f) => f !== 'Size'), ...category.optionalFields];
  const sampleSizes = ['XS', 'S', 'M', 'L', 'XL'];
  const rows = sampleSizes.map((sz, idx) => {
    const row: Record<string, string> = { Size: sz };
    headers.forEach((h) => {
      if (h !== 'Size') {
        row[h] = String(60 + idx * 8);
      }
    });
    return row;
  });

  return {
    US: { headers, rows },
    UK: { headers, rows },
    EU: { headers, rows },
  };
}

export function getCategorySizingTable(
  parentCategory: ParentCategoryType,
  system: SizingSystemOption,
  customCategories: CustomParentCategory[] = [],
  customMultiSystem?: MultiSystemSizingData
): CategorySizingTable {
  if (customMultiSystem && customMultiSystem[system]) {
    return customMultiSystem[system]!;
  }
  const customCat = customCategories.find(
    (c) => c.name.toLowerCase() === parentCategory.toLowerCase() || c.id === parentCategory
  );
  if (customCat?.defaultSizingTemplates?.[system]) {
    return customCat.defaultSizingTemplates[system]!;
  }
  const categoryTemplates =
    STANDARD_CATEGORY_SIZING_TEMPLATES[parentCategory as StandardParentCategoryType] ||
    STANDARD_CATEGORY_SIZING_TEMPLATES['Tops'];
  return categoryTemplates[system] || categoryTemplates['US'];
}

export function getCanonicalSizes(product: { sizes: string[]; canonicalSizes?: string[] }): string[] {
  if (product.canonicalSizes && product.canonicalSizes.length > 0) {
    return product.canonicalSizes;
  }
  if (!product.sizes || product.sizes.length === 0) return [];
  return product.sizes.map((sz) => {
    if (sz.includes('/')) {
      const parts = sz.split('/');
      const usPart = parts.find((p) => p.toLowerCase().includes('us'));
      if (usPart) return usPart.trim();
      return parts[0].trim();
    }
    return sz.trim();
  });
}

export function getAvailableVariantsForBrandAndCategory(
  brand: string,
  parentCategory: StandardParentCategoryType | string,
  brandCharts: BrandResearchedCategoryChart[] = []
): ResearchedChartVariant[] {
  const brandLower = (brand || '').toLowerCase().trim();
  const cat = parentCategory as StandardParentCategoryType;

  const matched = brandCharts.find(
    (c) => c.brand.toLowerCase() === brandLower && c.parentCategory === cat
  ) || brandCharts.find(
    (c) => c.brand.toLowerCase() === brandLower
  ) || brandCharts.find(
    (c) => c.parentCategory === cat
  );

  if (matched && matched.variants && matched.variants.length > 0) {
    return matched.variants;
  }

  // Fallback variants if none found in research
  return [
    {
      id: `var-default-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      variantName: 'Standard Variant',
      parentCategory: cat,
      headers: ['Size', 'Chest Min (cm)', 'Chest Max (cm)'],
      rows: [
        { Size: 'S', 'Chest Min (cm)': '88', 'Chest Max (cm)': '96' },
        { Size: 'M', 'Chest Min (cm)': '96', 'Chest Max (cm)': '104' },
        { Size: 'L', 'Chest Min (cm)': '104', 'Chest Max (cm)': '112' },
        { Size: 'XL', 'Chest Min (cm)': '112', 'Chest Max (cm)': '124' },
      ],
      confidence: 95,
    },
  ];
}

export function resolveFinalSkuChart(
  product: MockProduct,
  storeSizeType: string = 'US',
  brandCharts: BrandResearchedCategoryChart[] = [],
  pathAssignments: PathChartAssignment[] = [],
  skuOverrides: Record<string, SkuChartOverride> = {}
): FinalSkuChartResult {
  const brandName = product.brand?.trim() || 'Unbranded / No Brand';
  const merchantPath = product.category || 'Apparel';
  const parentCategory: StandardParentCategoryType =
    (product.parentCategory as StandardParentCategoryType) ||
    (normalizeToParentCategory(merchantPath) as StandardParentCategoryType);

  // 1. Check for SKU Override (Step 5)
  const override = skuOverrides[product.sku];
  let assignedVariantName = 'Standard';
  let isSkuOverride = false;
  let overrideReason: string | undefined = undefined;
  let assignedVariantId = '';

  if (override) {
    assignedVariantName = override.overriddenVariantName || override.targetVariantId || 'Custom Override';
    assignedVariantId = override.overriddenVariantId || override.targetVariantId || '';
    isSkuOverride = true;
    overrideReason = override.reason || 'Manual SKU Override';
  } else {
    // 2. Check for Merchant Path Assignment (Step 4)
    const matchedAssignment =
      pathAssignments.find(
        (a) =>
          a.brand.toLowerCase() === brandName.toLowerCase() &&
          a.merchantPath.toLowerCase() === merchantPath.toLowerCase()
      ) ||
      pathAssignments.find(
        (a) =>
          a.brand.toLowerCase() === brandName.toLowerCase() &&
          a.parentCategory === parentCategory
      ) ||
      pathAssignments.find(
        (a) => a.merchantPath.toLowerCase() === merchantPath.toLowerCase()
      );

    if (matchedAssignment) {
      assignedVariantName = matchedAssignment.assignedVariantName;
      assignedVariantId = matchedAssignment.assignedVariantId;
    } else {
      // Default heuristic based on path
      if (
        merchantPath.toLowerCase().includes('men') &&
        !merchantPath.toLowerCase().includes('women')
      ) {
        assignedVariantName = 'Men';
      } else if (merchantPath.toLowerCase().includes('women')) {
        assignedVariantName = 'Women';
      } else {
        assignedVariantName = 'Unisex';
      }
    }
  }

  // Check if assigned variant is unassigned / null / skipped
  const isUnassignedOrSkipped =
    !override &&
    (assignedVariantId === null ||
      assignedVariantId === '' ||
      assignedVariantName.toLowerCase().includes('unassigned') ||
      assignedVariantName.toLowerCase().includes('skip'));

  if (isUnassignedOrSkipped) {
    const canonicalSizes = getCanonicalSizes(product);
    return {
      sku: product.sku,
      productTitle: product.title,
      brand: brandName,
      merchantCategoryPath: merchantPath,
      parentCategory,
      chartName: 'No Size Chart (Skipped)',
      assignedVariantId: null,
      assignedVariantName: assignedVariantName || 'Unassigned / Skipped',
      isSkuOverride: false,
      hasNoChart: true,
      storeSizeType,
      selectedSizeType: storeSizeType,
      unit: 'cm',
      availableSizes: product.sizes,
      skuAvailableSizes: product.sizes,
      canonicalSizes,
      headers: [],
      rows: [],
      finalHeaders: [],
      finalRows: [],
      allResearchedVariants: [],
      confidence: 0,
      source: 'No size chart assigned for this path',
    };
  }

  // 3. Find Brand Researched Category Chart & Variant (Step 3)
  const matchedBrandChart =
    brandCharts.find(
      (c) =>
        c.brand.toLowerCase() === brandName.toLowerCase() &&
        c.parentCategory === parentCategory
    ) ||
    brandCharts.find((c) => c.brand.toLowerCase() === brandName.toLowerCase()) ||
    brandCharts.find((c) => c.parentCategory === parentCategory);

  let headers: string[] = ['Size', 'Chest Min (cm)', 'Chest Max (cm)'];
  let allRows: Record<string, string>[] = [];
  let source = `${brandName} Official Sizing Specification`;
  let confidence = 99.2;
  const allResearchedVariants: ResearchedChartVariant[] = matchedBrandChart?.variants || [];

  if (matchedBrandChart && matchedBrandChart.variants.length > 0) {
    const matchedVariant =
      matchedBrandChart.variants.find(
        (v) =>
          (assignedVariantId && v.id === assignedVariantId) ||
          v.variantName.toLowerCase() === assignedVariantName.toLowerCase()
      ) || matchedBrandChart.variants[0];

    headers = matchedVariant.headers;
    allRows = matchedVariant.rows;
    assignedVariantName = matchedVariant.variantName;
    assignedVariantId = matchedVariant.id;
    source = matchedVariant.sourceUrl || matchedBrandChart.source;
    confidence = matchedVariant.confidence || matchedBrandChart.confidence;
  } else {
    // Fallback standard template for the parent category & selected store size type
    const template = getCategorySizingTable(parentCategory, storeSizeType as SizingSystemOption);
    headers = template.headers;
    allRows = template.rows;
  }

  // 4. Filter to actual available SKU sizes (Final Chart Rule - Step 6)
  const canonicalSizes = getCanonicalSizes(product);
  const filteredRows = allRows.filter((row) => {
    const sizeVal =
      row['Size'] ||
      row['Size (US)'] ||
      row['Size (UK)'] ||
      row['Size (EU)'] ||
      Object.values(row)[0] ||
      '';
    return isSizeAvailableInItem(sizeVal, product.sizes, canonicalSizes);
  });

  const finalRows = filteredRows.length > 0 ? filteredRows : allRows;

  return {
    sku: product.sku,
    productTitle: product.title,
    brand: brandName,
    merchantCategoryPath: merchantPath,
    parentCategory,
    chartName: `${brandName} — ${assignedVariantName}`,
    assignedVariantId,
    assignedVariantName,
    isSkuOverride,
    overrideReason,
    storeSizeType,
    selectedSizeType: storeSizeType,
    unit: 'cm',
    availableSizes: product.sizes,
    skuAvailableSizes: product.sizes,
    canonicalSizes,
    headers,
    rows: allRows,
    finalHeaders: headers,
    finalRows: finalRows,
    allResearchedVariants,
    confidence,
    source,
  };
}

export function isSizeAvailableInItem(
  rowSize: string,
  itemSizes: string[] = [],
  canonicalSizes: string[] = []
): boolean {
  const combined = [...itemSizes, ...canonicalSizes];
  if (combined.length === 0) return true;

  const normalizedRow = rowSize.trim().toLowerCase();
  const cleanRowDigitsOnly = rowSize.replace(/[^0-9.]/g, '');
  const cleanRowAlphaOnly = rowSize.replace(/[^a-z]/gi, '').toLowerCase();

  return combined.some((s) => {
    const normalizedItem = s.trim().toLowerCase();
    if (normalizedItem === normalizedRow) return true;

    if (normalizedItem.includes(normalizedRow) || normalizedRow.includes(normalizedItem)) {
      return true;
    }

    const itemAlphaOnly = s.replace(/[^a-z]/gi, '').toLowerCase();
    if (cleanRowAlphaOnly && itemAlphaOnly && cleanRowAlphaOnly === itemAlphaOnly) {
      return true;
    }

    const itemDigits = s.replace(/[^0-9.]/g, '');
    if (cleanRowDigitsOnly && itemDigits) {
      if (itemDigits === cleanRowDigitsOnly || itemDigits.startsWith(cleanRowDigitsOnly)) {
        return true;
      }
    }

    return false;
  });
}
