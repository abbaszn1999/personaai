import {
  CategoryGroupTree,
  LeafCategoryItem,
  StoreConnectionInfo,
  ShopifyCollection,
  ShopifyLevelAssignment,
  ResolvedShopifyPath,
} from '../types';

export const DEFAULT_CONNECTED_STORE: StoreConnectionInfo = {
  isConnected: true,
  platform: 'shopify',
  storeName: 'Apex Athletic & Apparel Co.',
  storeUrl: 'apex-apparel.myshopify.com',
  totalSkuCount: 14850,
  detectedCurrency: 'USD',
  apiStatus: 'connected',
  connectedAt: '2026-09-02T10:15:00Z',
  taxonomySource: 'Shopify Collections & Custom Taxonomy',
  authMethod: 'Custom App Admin API (2024-10)',
  apiKeyOrToken: 'shpat_98a72b14c3e80f2d917e335b2e9a',
  apiSecret: 'shpss_88df29a103c847e1',
};

// ============================================================================
// MODE A: WooCommerce / WordPress Native Category Tree
// ============================================================================
export const WOOCOMMERCE_CATEGORY_TREE: CategoryGroupTree[] = [
  {
    id: 'wc-women',
    name: 'Women',
    subGroups: [
      {
        id: 'wc-women-tops',
        name: 'Tops',
        leafs: [
          {
            id: 'wc-w-tshirts',
            path: 'Women > Tops > T-Shirts',
            leafName: 'T-Shirts',
            parentGroup: 'Women',
            subGroup: 'Tops',
            skuCount: 1420,
            isFitRelevant: true,
            sampleProductCount: 48,
            productTypeSource: 'WooCommerce Category: Women/Tops/T-Shirts (ID #401)',
          },
          {
            id: 'wc-w-blouses',
            path: 'Women > Tops > Blouses',
            leafName: 'Blouses',
            parentGroup: 'Women',
            subGroup: 'Tops',
            skuCount: 860,
            isFitRelevant: true,
            sampleProductCount: 32,
            productTypeSource: 'WooCommerce Category: Women/Tops/Blouses (ID #402)',
          },
          {
            id: 'wc-w-sweaters',
            path: 'Women > Tops > Sweaters & Cardigans',
            leafName: 'Sweaters & Cardigans',
            parentGroup: 'Women',
            subGroup: 'Tops',
            skuCount: 940,
            isFitRelevant: true,
            sampleProductCount: 29,
            productTypeSource: 'WooCommerce Category: Women/Tops/Sweaters (ID #403)',
          },
        ],
      },
      {
        id: 'wc-women-dresses',
        name: 'Dresses',
        leafs: [
          {
            id: 'wc-w-dresses-casual',
            path: 'Women > Dresses > Casual',
            leafName: 'Casual',
            parentGroup: 'Women',
            subGroup: 'Dresses',
            skuCount: 610,
            isFitRelevant: true,
            sampleProductCount: 24,
            productTypeSource: 'WooCommerce Category: Women/Dresses/Casual (ID #410)',
          },
          {
            id: 'wc-w-dresses-formal',
            path: 'Women > Dresses > Formal',
            leafName: 'Formal',
            parentGroup: 'Women',
            subGroup: 'Dresses',
            skuCount: 280,
            isFitRelevant: true,
            sampleProductCount: 16,
            productTypeSource: 'WooCommerce Category: Women/Dresses/Formal (ID #411)',
          },
          {
            id: 'wc-w-dresses-jumpsuits',
            path: 'Women > Dresses > Jumpsuits',
            leafName: 'Jumpsuits',
            parentGroup: 'Women',
            subGroup: 'Dresses',
            skuCount: 210,
            isFitRelevant: true,
            sampleProductCount: 12,
            productTypeSource: 'WooCommerce Category: Women/Dresses/Jumpsuits (ID #412)',
          },
        ],
      },
      {
        id: 'wc-women-bottoms',
        name: 'Bottoms',
        leafs: [
          {
            id: 'wc-w-bottoms-jeans',
            path: 'Women > Bottoms > Jeans',
            leafName: 'Jeans',
            parentGroup: 'Women',
            subGroup: 'Bottoms',
            skuCount: 880,
            isFitRelevant: true,
            sampleProductCount: 38,
            productTypeSource: 'WooCommerce Category: Women/Bottoms/Jeans (ID #420)',
          },
          {
            id: 'wc-w-bottoms-trousers',
            path: 'Women > Bottoms > Trousers & Slacks',
            leafName: 'Trousers & Slacks',
            parentGroup: 'Women',
            subGroup: 'Bottoms',
            skuCount: 540,
            isFitRelevant: true,
            sampleProductCount: 22,
            productTypeSource: 'WooCommerce Category: Women/Bottoms/Trousers (ID #421)',
          },
          {
            id: 'wc-w-bottoms-skirts',
            path: 'Women > Bottoms > Skirts',
            leafName: 'Skirts',
            parentGroup: 'Women',
            subGroup: 'Bottoms',
            skuCount: 420,
            isFitRelevant: true,
            sampleProductCount: 19,
            productTypeSource: 'WooCommerce Category: Women/Bottoms/Skirts (ID #422)',
          },
        ],
      },
    ],
  },
  {
    id: 'wc-men',
    name: 'Men',
    subGroups: [
      {
        id: 'wc-men-tops',
        name: 'Tops',
        leafs: [
          {
            id: 'wc-m-tshirts',
            path: 'Men > Tops > T-Shirts',
            leafName: 'T-Shirts',
            parentGroup: 'Men',
            subGroup: 'Tops',
            skuCount: 1650,
            isFitRelevant: true,
            sampleProductCount: 52,
            productTypeSource: 'WooCommerce Category: Men/Tops/T-Shirts (ID #501)',
          },
          {
            id: 'wc-m-polos',
            path: 'Men > Tops > Polos & Casual Shirts',
            leafName: 'Polos & Casual Shirts',
            parentGroup: 'Men',
            subGroup: 'Tops',
            skuCount: 780,
            isFitRelevant: true,
            sampleProductCount: 28,
            productTypeSource: 'WooCommerce Category: Men/Tops/Polos (ID #502)',
          },
          {
            id: 'wc-m-hoodies',
            path: 'Men > Tops > Hoodies & Sweatshirts',
            leafName: 'Hoodies & Sweatshirts',
            parentGroup: 'Men',
            subGroup: 'Tops',
            skuCount: 690,
            isFitRelevant: true,
            sampleProductCount: 25,
            productTypeSource: 'WooCommerce Category: Men/Tops/Hoodies (ID #503)',
          },
        ],
      },
      {
        id: 'wc-men-bottoms',
        name: 'Bottoms',
        leafs: [
          {
            id: 'wc-m-bottoms-jeans',
            path: 'Men > Bottoms > Jeans & Denim',
            leafName: 'Jeans & Denim',
            parentGroup: 'Men',
            subGroup: 'Bottoms',
            skuCount: 920,
            isFitRelevant: true,
            sampleProductCount: 36,
            productTypeSource: 'WooCommerce Category: Men/Bottoms/Jeans (ID #520)',
          },
          {
            id: 'wc-m-bottoms-chinos',
            path: 'Men > Bottoms > Chinos & Trousers',
            leafName: 'Chinos & Trousers',
            parentGroup: 'Men',
            subGroup: 'Bottoms',
            skuCount: 580,
            isFitRelevant: true,
            sampleProductCount: 24,
            productTypeSource: 'WooCommerce Category: Men/Bottoms/Chinos (ID #521)',
          },
          {
            id: 'wc-m-bottoms-shorts',
            path: 'Men > Bottoms > Shorts & Swim',
            leafName: 'Shorts & Swim',
            parentGroup: 'Men',
            subGroup: 'Bottoms',
            skuCount: 390,
            isFitRelevant: true,
            sampleProductCount: 15,
            productTypeSource: 'WooCommerce Category: Men/Bottoms/Shorts (ID #522)',
          },
        ],
      },
    ],
  },
  {
    id: 'wc-footwear',
    name: 'Footwear',
    subGroups: [
      {
        id: 'wc-footwear-sneakers',
        name: 'Sneakers & Athletic',
        leafs: [
          {
            id: 'wc-f-running',
            path: 'Footwear > Sneakers & Athletic > Running',
            leafName: 'Running',
            parentGroup: 'Footwear',
            subGroup: 'Sneakers & Athletic',
            skuCount: 540,
            isFitRelevant: true,
            sampleProductCount: 22,
            productTypeSource: 'WooCommerce Category: Footwear/Sneakers/Running (ID #601)',
          },
          {
            id: 'wc-f-lifestyle',
            path: 'Footwear > Sneakers & Athletic > Lifestyle & Casual',
            leafName: 'Lifestyle & Casual',
            parentGroup: 'Footwear',
            subGroup: 'Sneakers & Athletic',
            skuCount: 430,
            isFitRelevant: true,
            sampleProductCount: 18,
            productTypeSource: 'WooCommerce Category: Footwear/Sneakers/Lifestyle (ID #602)',
          },
        ],
      },
      {
        id: 'wc-footwear-boots',
        name: 'Boots & Leather',
        leafs: [
          {
            id: 'wc-f-boots-leather',
            path: 'Footwear > Boots & Leather > Leather Boots',
            leafName: 'Leather Boots',
            parentGroup: 'Footwear',
            subGroup: 'Boots & Leather',
            skuCount: 260,
            isFitRelevant: true,
            sampleProductCount: 11,
            productTypeSource: 'WooCommerce Category: Footwear/Boots/Leather (ID #610)',
          },
          {
            id: 'wc-f-boots-dress',
            path: 'Footwear > Boots & Leather > Dress Loafers',
            leafName: 'Dress Loafers',
            parentGroup: 'Footwear',
            subGroup: 'Boots & Leather',
            skuCount: 180,
            isFitRelevant: true,
            sampleProductCount: 8,
            productTypeSource: 'WooCommerce Category: Footwear/Boots/Dress (ID #611)',
          },
        ],
      },
    ],
  },
  {
    id: 'wc-flat-clothing',
    name: 'Clothing (Flat Root / Unclassified)',
    hasNoSubcategories: true,
    flatWarning:
      'This category has no subcategories. Fit accuracy will be limited without more specific categorization.',
    subGroups: [
      {
        id: 'wc-flat-clothing-root',
        name: 'No Subcategories Available',
        leafs: [
          {
            id: 'wc-flat-clothing-leaf',
            path: 'Clothing',
            leafName: 'Clothing (Root Category)',
            parentGroup: 'Clothing (Flat Root / Unclassified)',
            subGroup: 'No Subcategories Available',
            skuCount: 240,
            isFitRelevant: true,
            sampleProductCount: 8,
            productTypeSource: 'WooCommerce Category: Clothing (ID #100 - Flat Root)',
            isShallowWarning: true,
            shallowWarningText:
              'This category has no subcategories. Fit accuracy will be limited without more specific categorization.',
          },
        ],
      },
    ],
  },
  {
    id: 'wc-accessories',
    name: 'Accessories & Non-Apparel',
    subGroups: [
      {
        id: 'wc-acc-bags',
        name: 'Bags & Luggage',
        leafs: [
          {
            id: 'wc-acc-backpacks',
            path: 'Accessories > Bags & Luggage > Backpacks',
            leafName: 'Backpacks',
            parentGroup: 'Accessories & Non-Apparel',
            subGroup: 'Bags & Luggage',
            skuCount: 310,
            isFitRelevant: false,
            sampleProductCount: 12,
            productTypeSource: 'WooCommerce Category: Accessories/Bags/Backpacks (ID #701)',
          },
        ],
      },
      {
        id: 'wc-acc-jewelry',
        name: 'Jewelry & Watches',
        leafs: [
          {
            id: 'wc-acc-watches',
            path: 'Accessories > Jewelry & Watches > Watches & Bracelets',
            leafName: 'Watches & Bracelets',
            parentGroup: 'Accessories & Non-Apparel',
            subGroup: 'Jewelry & Watches',
            skuCount: 190,
            isFitRelevant: false,
            sampleProductCount: 9,
            productTypeSource: 'WooCommerce Category: Accessories/Jewelry/Watches (ID #702)',
          },
        ],
      },
    ],
  },
];

// Compatibility alias for the raw tree
export const RAW_CATEGORY_TREE: CategoryGroupTree[] = WOOCOMMERCE_CATEGORY_TREE;

export const ALL_LEAF_CATEGORIES: LeafCategoryItem[] = WOOCOMMERCE_CATEGORY_TREE.flatMap((group) =>
  group.subGroups.flatMap((sub) => sub.leafs)
);

export const DEFAULT_SELECTED_LEAF_IDS: string[] = ALL_LEAF_CATEGORIES.filter(
  (c) => c.isFitRelevant && !c.isShallowWarning
).map((c) => c.id);

// ============================================================================
// MODE B: Shopify Raw Flat Collections List & Level Builder Setup
// ============================================================================

export const SHOPIFY_RAW_COLLECTIONS: ShopifyCollection[] = [
  // Audience / Gender Collections
  { id: 'col-women', title: 'Women', handle: 'women', type: 'smart', productCount: 2840 },
  { id: 'col-men', title: 'Men', handle: 'men', type: 'smart', productCount: 2190 },
  { id: 'col-unisex', title: 'Unisex', handle: 'unisex', type: 'smart', productCount: 840 },
  { id: 'col-kids', title: 'Kids & Teens', handle: 'kids', type: 'smart', productCount: 420 },

  // Category Level Collections
  { id: 'col-dresses', title: 'Dresses', handle: 'dresses', type: 'smart', productCount: 890 },
  { id: 'col-tops', title: 'Tops', handle: 'tops', type: 'smart', productCount: 3610 },
  { id: 'col-bottoms', title: 'Bottoms', handle: 'bottoms', type: 'smart', productCount: 2240 },
  { id: 'col-footwear', title: 'Footwear', handle: 'footwear', type: 'smart', productCount: 1150 },
  { id: 'col-outerwear', title: 'Outerwear & Jackets', handle: 'outerwear', type: 'smart', productCount: 720 },
  { id: 'col-activewear', title: 'Activewear', handle: 'activewear', type: 'smart', productCount: 680 },

  // Subcategory Level Collections
  { id: 'col-tshirts', title: 'T-Shirts', handle: 't-shirts', type: 'custom', productCount: 2200 },
  { id: 'col-blouses', title: 'Blouses & Shirts', handle: 'blouses', type: 'custom', productCount: 890 },
  { id: 'col-jeans', title: 'Jeans & Denim', handle: 'jeans', type: 'custom', productCount: 1420 },
  { id: 'col-casual-dresses', title: 'Casual Dresses', handle: 'casual-dresses', type: 'custom', productCount: 610 },
  { id: 'col-formal-dresses', title: 'Formal Dresses', handle: 'formal-dresses', type: 'custom', productCount: 280 },
  { id: 'col-sneakers', title: 'Sneakers', handle: 'sneakers', type: 'custom', productCount: 840 },
  { id: 'col-boots', title: 'Boots', handle: 'boots', type: 'custom', productCount: 440 },

  // Marketing / Promotional / Filter Collections (Not used in hierarchy paths)
  { id: 'col-new-arrivals', title: 'New Arrivals', handle: 'new-arrivals', type: 'smart', productCount: 420, isMarketingTag: true },
  { id: 'col-summer-sale', title: 'Summer Sale', handle: 'summer-sale', type: 'smart', productCount: 860, isMarketingTag: true },
  { id: 'col-under-50', title: 'Under $50', handle: 'under-50', type: 'smart', productCount: 1120, isMarketingTag: true },
  { id: 'col-trending', title: 'Trending Now', handle: 'trending', type: 'smart', productCount: 350, isMarketingTag: true },
  { id: 'col-best-sellers', title: 'Best Sellers', handle: 'best-sellers', type: 'smart', productCount: 980, isMarketingTag: true },
  { id: 'col-staff-picks', title: 'Staff Favorites', handle: 'staff-favorites', type: 'custom', productCount: 180, isMarketingTag: true },
  { id: 'col-clearance', title: 'Clearance Outlet', handle: 'clearance', type: 'smart', productCount: 490, isMarketingTag: true },
];

export const DEFAULT_SHOPIFY_ASSIGNMENTS: ShopifyLevelAssignment = {
  level1Collections: ['col-women', 'col-men', 'col-unisex'],
  level2Collections: ['col-dresses', 'col-tops', 'col-bottoms', 'col-footwear', 'col-outerwear'],
  level3Collections: [
    'col-tshirts',
    'col-blouses',
    'col-jeans',
    'col-casual-dresses',
    'col-formal-dresses',
    'col-sneakers',
    'col-boots',
  ],
};

export interface SampleTaggedProduct {
  id: string;
  title: string;
  imageThumbnail: string;
  collections: string[]; // collection titles
  resolvedPath: string;
  ignoredTags: string[];
}

export const SAMPLE_SHOPIFY_PRODUCTS: SampleTaggedProduct[] = [
  {
    id: 'prod-001',
    title: 'AeroTech Minimalist Linen Wrap Dress',
    imageThumbnail: '👗',
    collections: ['Women', 'Dresses', 'Casual Dresses', 'New Arrivals', 'Summer Sale'],
    resolvedPath: 'Women > Dresses > Casual Dresses',
    ignoredTags: ['New Arrivals', 'Summer Sale'],
  },
  {
    id: 'prod-002',
    title: 'Core Heavyweight Crewneck Athletic Tee',
    imageThumbnail: '👕',
    collections: ['Men', 'Tops', 'T-Shirts', 'Best Sellers', 'Under $50'],
    resolvedPath: 'Men > Tops > T-Shirts',
    ignoredTags: ['Best Sellers', 'Under $50'],
  },
  {
    id: 'prod-003',
    title: 'Stripe Silk Button-Down Formal Blouse',
    imageThumbnail: '👚',
    collections: ['Women', 'Tops', 'Blouses & Shirts', 'Trending Now'],
    resolvedPath: 'Women > Tops > Blouses & Shirts',
    ignoredTags: ['Trending Now'],
  },
  {
    id: 'prod-004',
    title: 'Apex Raw Indigo Selvage Denim Jean',
    imageThumbnail: '👖',
    collections: ['Men', 'Bottoms', 'Jeans & Denim', 'Staff Favorites'],
    resolvedPath: 'Men > Bottoms > Jeans & Denim',
    ignoredTags: ['Staff Favorites'],
  },
  {
    id: 'prod-005',
    title: 'Velocity Prime Cushioned Runner',
    imageThumbnail: '👟',
    collections: ['Unisex', 'Footwear', 'Sneakers', 'New Arrivals', 'Trending Now'],
    resolvedPath: 'Unisex > Footwear > Sneakers',
    ignoredTags: ['New Arrivals', 'Trending Now'],
  },
  {
    id: 'prod-006',
    title: 'Velvet Evening Gala Gown',
    imageThumbnail: '👗',
    collections: ['Women', 'Dresses', 'Formal Dresses', 'Summer Sale'],
    resolvedPath: 'Women > Dresses > Formal Dresses',
    ignoredTags: ['Summer Sale'],
  },
];
