export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type SizingSystemOption = 'US' | 'UK' | 'EU' | 'Alpha' | 'Numeric' | string;

export type StandardParentCategoryType =
  | 'Tops'
  | 'Outerwear / Jackets'
  | 'Bottoms'
  | 'Dresses / Full-body'
  | 'Footwear';

export type ParentCategoryType = StandardParentCategoryType | string;

export interface ResearchedChartVariant {
  id: string;
  variantName: string; // e.g., 'Men', 'Women', 'Men Regular', 'Men Tall', 'Women Petite', 'Unisex'
  parentCategory: StandardParentCategoryType;
  gender?: string;
  fitType?: string;
  headers: string[];
  rows: Record<string, string>[];
  confidence: number;
  sourceUrl?: string;
  notes?: string;
}

export interface BrandResearchedCategoryChart {
  id: string;
  brand: string;
  parentCategory: StandardParentCategoryType;
  variants: ResearchedChartVariant[];
  status: 'done' | 'needs_research';
  confidence: number;
  lastUpdated: string;
  source: string;
}

export interface PathChartAssignment {
  id: string;
  brand: string;
  merchantPath: string;
  parentCategory: StandardParentCategoryType;
  assignedVariantId: string | null;
  assignedVariantName: string;
  skuCount: number;
  isAutoMatched?: boolean;
  status?: 'assigned' | 'unassigned';
}

export interface SkuChartOverride {
  sku: string;
  overriddenVariantId?: string;
  targetVariantId?: string;
  overriddenVariantName?: string;
  reason?: string;
}

export interface FinalSkuChartResult {
  sku: string;
  productTitle: string;
  brand: string;
  merchantCategoryPath: string;
  parentCategory: StandardParentCategoryType;
  chartName: string;
  assignedVariantId: string | null;
  assignedVariantName: string;
  isSkuOverride: boolean;
  overrideReason?: string;
  hasNoChart?: boolean;
  storeSizeType: string;
  selectedSizeType: string;
  unit: string;
  availableSizes: string[];
  skuAvailableSizes: string[];
  canonicalSizes: string[];
  headers: string[];
  rows: Record<string, string>[];
  finalHeaders: string[];
  finalRows: Record<string, string>[];
  allResearchedVariants: ResearchedChartVariant[];
  confidence: number;
  source: string;
}

export interface CustomParentCategory {
  id: string;
  name: string;
  description?: string;
  requiredFields: string[];
  optionalFields: string[];
  color?: string;
  icon?: string;
  notes?: string;
  defaultSizingTemplates?: MultiSystemSizingData;
}

export interface StoreSizingSystemConfig {
  defaultSystem: SizingSystemOption;
  brandOverrides: Record<string, SizingSystemOption>;
  sizeChart?: string;
}

export interface GoogleSchemaOption {
  value: string;
  label: string;
  description: string;
}

export interface AcsRequiredField {
  id: string;
  acsField: string;
  cmsField?: string;
  shopify?: string;
  wooCommerce?: string;
  description?: string;
  sample?: string;
}

export interface AcsNativeAttribute {
  id: string;
  acsField: string;
  cmsField?: string;
  shopify?: string;
  wooCommerce?: string;
  resolverRule?: string;
  sample?: string;
}

export interface AcsCustomAttribute {
  id: string;
  acsKey: string;
  name: string;
  type: 'text' | 'number' | 'boolean';
  indexable: boolean;
  searchable: boolean;
  sample: string;
  cmsField?: string;
  shopifySource?: string;
  wooCommerceSource?: string;
}

export interface StoreFieldMapping {
  id: string;
  storeField: string;
  sampleValue: string;
  selectedSchema: string;
  isAutoDetected: boolean;
  confidenceScore: number;
}

export interface MockProduct {
  id: string;
  sku: string;
  title: string;
  price: string;
  brand: string;
  brandType: 'global' | 'private' | 'null';
  parentCategory?: ParentCategoryType;
  category: string;
  subCategory: string;
  sizes: string[];
  canonicalSizes?: string[];
  description: string;
  imageUrl: string;
  stockQty: number;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface DiscoveredBrand {
  name: string;
  brandType: 'global' | 'private' | 'null';
  skuCount: number;
  percentage: number;
  isUnbranded?: boolean;
  status: 'Verified' | 'Pending Research' | 'Needs Review' | 'Excluded';
}

export interface CategorySizingTable {
  headers: string[];
  rows: Record<string, string>[];
}

export type MultiSystemSizingData = {
  [key in SizingSystemOption]?: CategorySizingTable;
};

export interface FoundSizeChart {
  id: string;
  brand: string;
  categories: string[];
  subCategories?: string[];
  skuCount?: number;
  region: string;
  confidence: number;
  lastUpdated: string;
  headers: string[];
  rows: Record<string, string>[];
  multiSystemData?: Record<string, MultiSystemSizingData>;
  isInheritedFromSetup?: boolean;
  inheritedFromSetupLabel?: string;
  sourceOrigin?: 'setup_cached' | 'delta_researched';
  isResearched?: boolean;
  researchStatus?: 'done' | 'needs_research';
  templateStatus?: 'found' | 'not_found';
}

export type GapStatus = 'not_started' | 'in_progress' | 'complete';

export interface GapItem {
  id: string;
  brandName: string;
  categoryPath: string;
  title: string;
  type: 'brand' | 'category';
  parentCategory?: ParentCategoryType;
  categoryType: 'tops' | 'bottoms' | 'footwear' | 'accessories' | 'outerwear';
  skuCount: number;
  status: GapStatus;
  sampleProducts: {
    sku: string;
    title: string;
    imageUrl: string;
    price: string;
  }[];
  columns: string[];
  rows: Record<string, string>[];
  multiSystemData?: MultiSystemSizingData;
  isInheritedFromSetup?: boolean;
  inheritedFromSetupLabel?: string;
  inheritedSetupDate?: string;
  sourceOrigin?: 'setup_prefilled' | 'delta_gap_required';
}

export interface BrandFilterOverride {
  increaseCm?: number;
  decreaseCm?: number;
}

export interface HierarchicalBrandItem {
  id: string;
  name: string;
  brandType: 'global' | 'private' | 'null';
  skuCount: number;
  fitNote?: string;
  overrideIncreaseCm?: number;
  overrideDecreaseCm?: number;
}

export interface HierarchicalLeafCategory {
  id: string;
  name: string;
  path: string;
  skuCount: number;
  defaultIncreaseCm?: number;
  defaultDecreaseCm?: number;
  brands: HierarchicalBrandItem[];
}

export interface HierarchicalSubCategory {
  id: string;
  name: string;
  skuCount: number;
  defaultIncreaseCm?: number;
  defaultDecreaseCm?: number;
  leafs: HierarchicalLeafCategory[];
}

export interface HierarchicalCategory {
  id: string;
  name: string;
  iconName: string;
  categoryType: 'tops' | 'bottoms' | 'footwear' | 'headwear' | 'outerwear' | 'dresses' | 'accessories';
  skuCount: number;
  defaultIncreaseCm: number;
  defaultDecreaseCm: number;
  subCategories: HierarchicalSubCategory[];
}

export interface CategoryFilterConfig {
  id: string;
  name: string;
  categoryPath: string;
  iconName: string;
  categoryType: 'tops' | 'bottoms' | 'footwear' | 'headwear' | 'outerwear' | 'dresses' | 'accessories';
  defaultIncreaseCm: number;
  defaultDecreaseCm: number;
  skuCount: number;
  sampleMeasurement: string;
  sampleBaseRange: { min: number; max: number; unit: string; sizeLabel: string };
  brands: {
    name: string;
    brandType: 'global' | 'private' | 'null';
    skuCount: number;
    fitNote?: string;
  }[];
  brandOverrides: Record<string, BrandFilterOverride>;
}

export type PlatformType = 'shopify' | 'woocommerce' | 'bigcommerce' | 'custom';

export interface StoreConnectionInfo {
  isConnected: boolean;
  platform: PlatformType;
  storeName: string;
  storeUrl: string;
  totalSkuCount: number;
  detectedCurrency: string;
  apiStatus: 'connected' | 'connecting' | 'error' | 'disconnected';
  connectedAt?: string;
  taxonomySource: string;
  authMethod: string;
  apiKeyOrToken?: string;
  apiSecret?: string;
}

export interface LeafCategoryItem {
  id: string; // e.g. "women-tops-tshirts"
  path: string; // e.g. "Women > Tops > T-Shirts & Tees"
  leafName: string; // e.g. "T-Shirts & Tees"
  parentGroup: string; // e.g. "Women"
  subGroup: string; // e.g. "Tops"
  skuCount: number;
  isFitRelevant: boolean;
  sampleProductCount: number;
  productTypeSource: string; // e.g. "shopify.product_type = 'T-Shirts'"
  isShallowWarning?: boolean;
  shallowWarningText?: string;
}

export interface CategoryGroupTree {
  id: string; // e.g. "women"
  name: string; // e.g. "Women"
  subGroups: {
    id: string; // e.g. "women-tops"
    name: string; // e.g. "Tops"
    leafs: LeafCategoryItem[];
  }[];
  // For flat categories with no subcategories in WooCommerce
  hasNoSubcategories?: boolean;
  flatWarning?: string;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  type: 'smart' | 'custom';
  productCount: number;
  isMarketingTag?: boolean;
}

export interface ShopifyLevelAssignment {
  level1Collections: string[]; // collection IDs for Level 1 (e.g. Women, Men)
  level2Collections: string[]; // collection IDs for Level 2 (e.g. Dresses, Tops)
  level3Collections: string[]; // collection IDs for Level 3 (e.g. T-Shirts, Jeans)
}

export interface ResolvedShopifyPath {
  id: string;
  path: string;
  level1Title: string;
  level2Title: string;
  level3Title?: string;
  skuCount: number;
  sampleProducts: string[];
  ignoredMarketingTags: string[];
}

